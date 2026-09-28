import json

import httpx
import pytest

from app import ai
from app.config import settings
from app.schemas import StructuredNote
from evaluation import run


def test_dataset_contract():
    dataset, digest = run.load_dataset()
    assert len(dataset["cases"]) == 25 and len(digest) == 64
    assert len({case["id"] for case in dataset["cases"]}) == 25
    for case in dataset["cases"]:
        assert set(case["expected_facts"]).isdisjoint(case["undocumented"])
        assert set(case["expected_facts"]) | set(case["undocumented"]) == set(
            StructuredNote.model_fields
        )
        assert case["forbidden_additions"]
        if case["expected_validation"] != "accept":
            with pytest.raises(ai.ProviderError):
                ai.validate_source(case["source"])


def test_key_is_not_spending_authorization(monkeypatch):
    monkeypatch.setattr(settings(), "ai_api_key", "fake-key-never-sent")
    with pytest.raises(SystemExit, match="explicit"):
        run.evaluate(live=True)


def test_budget_request_cap_and_blank_review(monkeypatch, tmp_path):
    monkeypatch.setattr(settings(), "ai_api_key", "fake-key-never-sent")
    calls = []

    class FakeLive:
        last_usage = {"prompt_tokens": 12, "completion_tokens": 10}

        def __init__(self, attempts):
            assert attempts == 1

        def generate(self, source):
            calls.append(source)
            return StructuredNote()

    monkeypatch.setattr(run, "LiveProvider", FakeLive)
    monkeypatch.setattr(
        run,
        "price_snapshot",
        lambda: ({"input_usd_per_million": 0.4, "output_usd_per_million": 1.6}, True),
    )
    report = run.evaluate(live=True, budget=0.009, max_requests=25)
    assert len(calls) == 1
    assert report["requests_attempted"] == 1
    assert report["reserved_usd_not_actual_invoice"] <= 0.009
    report = run.evaluate(live=True, budget=1, max_requests=2)
    assert report["requests_attempted"] == 2
    output = tmp_path / "review.csv"
    run.write_review(report, output)
    assert "facts_preserved" in output.read_text()
    assert all(c["human_review"] == "not reviewed" for c in report["cases"])


def test_unstructured_request_and_output_limit(monkeypatch):
    monkeypatch.setattr(settings(), "ai_api_key", "fake-key-never-sent")
    note = "Fictional patient has cough, denies fever. No plan supplied."
    sent = []

    class Client:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, url, **kwargs):
            sent.append(kwargs["json"])
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {
                                "content": json.dumps(
                                    StructuredNote(
                                        reported_concern="Cough; denies fever"
                                    ).model_dump()
                                )
                            },
                        }
                    ]
                },
            )

    monkeypatch.setattr(ai, "ProviderClient", Client)
    output = ai.LiveProvider().generate(note)
    assert output.documented_plan == "Not documented"
    assert json.loads(sent[0]["messages"][1]["content"])["source_note"] == note
    assert sent[0]["max_completion_tokens"] == 1024
    assert "labels are not required" in sent[0]["messages"][0]["content"]
    assert sent[0]["store"] is False


def test_live_retry_bound(monkeypatch):
    monkeypatch.setattr(settings(), "ai_api_key", "fake-key-never-sent")

    class Client:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, *args, **kwargs):
            return httpx.Response(503)

    monkeypatch.setattr(ai, "ProviderClient", Client)
    monkeypatch.setattr(ai.time, "sleep", lambda _: None)
    provider = ai.LiveProvider()
    with pytest.raises(ai.ProviderError):
        provider.generate("Fictional cough")
    assert provider.requests_made == 3
