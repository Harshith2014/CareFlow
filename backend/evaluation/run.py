"""Reproducible fictional evaluation; a key alone never authorizes paid calls."""

import argparse
import csv
import hashlib
import json
import math
import time
from datetime import date, datetime, timezone
from pathlib import Path

from app.ai import (
    PROMPT_VERSION,
    LiveProvider,
    MockProvider,
    ProviderError,
    request_payload,
    validate_source,
)
from app.config import settings

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent.parent / "docs"
INPUT_TOKEN_CEILING = 16000


def load_dataset():
    raw = (HERE / "cases.json").read_bytes()
    data = json.loads(raw)
    return data, hashlib.sha256(raw).hexdigest()


def price_snapshot():
    pricing = json.loads((HERE / "pricing.json").read_text())
    age = (date.today() - date.fromisoformat(pricing["verified_on"])).days
    valid = pricing["model"] == settings().ai_model and 0 <= age <= 30
    return pricing, valid


def estimated_reservation(pricing):
    return (
        INPUT_TOKEN_CEILING * pricing["input_usd_per_million"]
        + settings().ai_max_output_tokens * pricing["output_usd_per_million"]
    ) / 1_000_000


def make_plan(max_requests=25):
    data, digest = load_dataset()
    pricing, known = price_snapshot()
    valid_count = sum(case["expected_validation"] == "accept" for case in data["cases"])
    return {
        "dataset_version": data["version"],
        "dataset_sha256": digest,
        "case_count": len(data["cases"]),
        "model": settings().ai_model,
        "prompt_version": PROMPT_VERSION,
        "max_requests": min(valid_count, max_requests),
        "attempts_per_case": 1,
        "max_output_tokens": settings().ai_max_output_tokens,
        "conservative_input_token_ceiling": INPUT_TOKEN_CEILING,
        "timeout_seconds": settings().ai_timeout,
        "pricing": pricing,
        "pricing_current_for_model": known,
        "conservative_reserved_usd": round(
            estimated_reservation(pricing) * min(valid_count, max_requests), 6
        )
        if known
        else None,
        "key_configured": bool(settings().ai_api_key),
        "live_evaluation": "not run",
    }


def authorize_live(budget, plan):
    if budget is None or not math.isfinite(budget) or budget <= 0:
        raise SystemExit(
            "Live evaluation NOT RUN: explicit --authorize-spend-usd is required; a key alone is insufficient."
        )
    if not plan["pricing_current_for_model"]:
        raise SystemExit(
            "Live evaluation NOT RUN: pricing is unknown/stale for this model; verify pricing.json first."
        )
    if not settings().ai_api_key:
        raise SystemExit(
            "Live evaluation NOT RUN: configure AI_API_KEY locally, never in chat or Git."
        )


def evaluate(live=False, budget=None, max_requests=25):
    data, digest = load_dataset()
    plan = make_plan(max_requests)
    if live:
        authorize_live(budget, plan)
    provider = LiveProvider(attempts=1) if live else MockProvider()
    reservation = estimated_reservation(plan["pricing"])
    spent_reserved = 0.0
    attempts = 0
    results = []
    for case in data["cases"]:
        started = time.perf_counter()
        result = {
            "id": case["id"],
            "expected_validation": case["expected_validation"],
            "schema_valid": None,
            "human_review": "not reviewed",
            "request_attempted": False,
        }
        try:
            validate_source(case["source"])
        except ProviderError:
            result.update(
                validation="rejected", expected_rejection=case["expected_validation"] != "accept"
            )
        else:
            result["validation"] = "accepted"
            # Deliberately overestimate text tokens from full UTF-8 request bytes plus framing.
            # Refuse payloads exceeding the fixed reservation; use no retries in live evaluation.
            input_bound = (
                len(json.dumps(request_payload(case["source"]), ensure_ascii=False).encode("utf-8"))
                + 4096
            )
            if live and (
                attempts >= max_requests
                or spent_reserved + reservation > budget
                or input_bound > INPUT_TOKEN_CEILING
            ):
                result["skipped"] = "Request/budget/input ceiling reached"
            else:
                try:
                    if live:
                        attempts += 1
                        spent_reserved += reservation  # Reserve even for timeout/unknown billing.
                        result["request_attempted"] = True
                    output = provider.generate(case["source"]).model_dump()
                    combined = " ".join(output.values()).casefold()
                    result.update(
                        schema_valid=True,
                        output=output,
                        literal_section_hints={
                            section: {
                                fact: fact.casefold() in output[section].casefold()
                                for fact in facts
                            }
                            for section, facts in case["expected_facts"].items()
                        },
                        undocumented_checks={
                            section: output[section] == "Not documented"
                            for section in case["undocumented"]
                        },
                        forbidden_phrase_flags=[
                            phrase
                            for phrase in case["forbidden_additions"]
                            if phrase.casefold() in combined
                        ],
                    )
                    if live:
                        result["reported_token_usage"] = provider.last_usage
                except ProviderError as exc:
                    result.update(schema_valid=False, failure=str(exc))
        result["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
        results.append(result)
    return {
        "evaluated_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_version": data["version"],
        "dataset_sha256": digest,
        "mode": "live" if live else "mock",
        "model": settings().ai_model if live else "mock-label-parser-v1",
        "configuration": plan,
        "authorized_budget_usd": budget if live else None,
        "reserved_usd_not_actual_invoice": round(spent_reserved, 6),
        "requests_attempted": attempts,
        "live_evaluation": "run" if live and attempts else "not run",
        "limitations": "Literal hints are not factuality scores. Forbidden phrase absence does not prove safety. Human review is unperformed.",
        "cases": results,
    }


def write_review(report, output):
    data, _ = load_dataset()
    cases = {c["id"]: c for c in data["cases"]}
    with output.open("w", newline="", encoding="utf-8") as stream:
        names = [
            "id",
            "source",
            "expected_facts_by_section",
            "must_remain_undocumented",
            "forbidden_additions",
            "generated_output",
            "facts_preserved",
            "omissions",
            "negation_and_contradictions",
            "unsupported_additions",
            "reviewer",
            "reviewed_at",
            "notes",
        ]
        writer = csv.DictWriter(stream, fieldnames=names)
        writer.writeheader()
        for result in report["cases"]:
            case = cases[result["id"]]
            writer.writerow(
                {
                    "id": case["id"],
                    "source": case["source"],
                    "expected_facts_by_section": json.dumps(case["expected_facts"]),
                    "must_remain_undocumented": json.dumps(case["undocumented"]),
                    "forbidden_additions": json.dumps(case["forbidden_additions"]),
                    "generated_output": json.dumps(result.get("output")),
                }
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--plan", action="store_true", help="Write a no-network cost/request plan")
    parser.add_argument("--authorize-spend-usd", type=float, default=None)
    parser.add_argument("--max-requests", type=int, default=25)
    args = parser.parse_args()
    if not 1 <= args.max_requests <= 25:
        parser.error("--max-requests must be between 1 and 25")
    DOCS.mkdir(exist_ok=True)
    if args.plan:
        plan = make_plan(args.max_requests)
        (DOCS / "evaluation-plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
        print(json.dumps(plan, indent=2))  # Only key presence, never its value.
        return
    mode = "live" if args.live else "mock"
    output = DOCS / f"evaluation-{mode}.json"
    if args.live and output.exists():
        raise SystemExit(
            "Preserve existing live evidence: archive evaluation-live.json before another run."
        )
    report = evaluate(args.live, args.authorize_spend_usd, args.max_requests)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    write_review(report, DOCS / f"evaluation-{mode}-review.csv")
    print(f"Wrote {output.name} and blank human-review sheet. No factuality score is claimed.")


if __name__ == "__main__":
    main()
