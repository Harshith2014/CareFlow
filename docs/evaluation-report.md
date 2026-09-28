# AI evaluation and human review

**Live evaluation: NOT RUN. Human review: NOT PERFORMED.** No live model scores or clinical-validation claims are made. The existing OpenAI adapter is retained; its prompt now accepts ordinary unstructured notes without requiring labels. Mock parsing is not evidence of live capability.

`backend/evaluation/cases.json`, version `careflow-fictional-v2`, contains 25 fictional cases: 22 accepted inputs and three rejected inputs (empty, whitespace-only, over 8,000 characters). Each has a stable ID, expected facts by section, fields that must remain undocumented, forbidden unsupported additions, and an expected validation outcome. Coverage includes unstructured text, missing sections, negation, contradictions, abbreviations, spelling, ambiguous attribution, explicitly supplied fictional plans/doses, and embedded instructions. Invalid inputs never reach a provider.

## Reproduce locally

From `backend` with the project Python environment installed:

```powershell
python -m evaluation.run --plan
python -m evaluation.run
```

The first makes **no network call** and writes `docs/evaluation-plan.json`: dataset version/hash, model, prompt revision, timeout, request/token bounds, pricing, conservative reservation, and only whether a key is configured. The second produces `docs/evaluation-mock.json` and a blank `docs/evaluation-mock-review.csv`. Mock output is deterministic; timing/date vary. Unstructured notes are copied into Reported concern while other sections remain undocumented, so categorization checks can fail. These visible limitations are retained.

Before any live call, obtain explicit spending authorization. A configured key is insufficient. Configure `AI_API_KEY` **locally**, through a backend environment variable or `backend/.env` (gitignored); never paste it into chat, echo it, or commit it. Direct evaluation from `backend` does not automatically read the repository-root Compose `.env`. The application can remain in mock mode; `--live` explicitly selects the evaluation provider.

Only after authorization for up to US$0.25, for example:

```powershell
$env:AI_MODEL='gpt-4.1-mini'
$env:AI_TIMEOUT='20'
$env:AI_MAX_OUTPUT_TOKENS='1024'
python -m evaluation.run --live --authorize-spend-usd 0.25 --max-requests 25
```

Do not execute merely because the command appears here. It writes `docs/evaluation-live.json` and an unfilled review CSV. Existing live evidence is never overwritten: archive it first and obtain authorization for additional spending.

## Request and cost controls

At most 25 requests, one attempt per valid case, **no automatic evaluation retries**. The dataset has 22 valid inputs. Each request has an output cap (default 1,024 tokens), timeout, and conservative 16,000-input-token reservation. Serialized UTF-8 request size plus framing allowance must fit that ceiling. Funds are reserved before a call, including timeouts and failures; further calls are skipped when the budget/request ceiling would be exceeded. Interactive application requests separately retain at most three transient-failure attempts.

Pricing verified September 28, 2026 for `gpt-4.1-mini`: uncached input US$0.40/million and output US$1.60/million tokens, giving a conservative reservation of US$0.176845 for 22 default requests, excluding taxes. This is **not an invoice or measured usage**. See [official model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [token guidance](https://developers.openai.com/api/docs/guides/token-counting), and `backend/evaluation/pricing.json`. Provider billing controls should supplement this local guard. Different-model or over-30-day-old pricing is unknown; live execution is refused until reverified. Provider account availability and quality remain unverified.

## What is measured

Reports retain UTC date, dataset version/hash, model/configuration, prompt revision, input validation, schema validity, sanitized failures, latency, request attempts, reported token usage when available, and reserved spending. Literal section hints, exact `Not documented` checks, and forbidden phrase flags are aids, **not a factuality score**. Correct paraphrases can fail word checks, misleading negations can pass, and unsupported additions absent from the small forbidden list can escape detection. Failed calls are retained.

The CSV supplies source, expected facts, forbidden additions, and output. Facts preserved, omissions, contradictions, unsupported additions, reviewer, and notes remain blank. Blank cells do not mean passing review. Pytest's HTTP fakes verify software contracts and spending safeguards separately from model evaluation.

## Report template

| Item | Current value / fill after an authorized run |
|---|---|
| Evaluation date / reviewer | Live not run; human not reviewed |
| Model, configuration, prompt revision, dataset hash | Copy from generated live report |
| Valid schemas / attempted requests | Live not measured |
| Input rejections, failures, skipped cases | Record separately; retain failures |
| Preserved facts / omissions by case | Not reviewed; cite source/output |
| Negation, uncertainty, attribution, contradictions | Not reviewed |
| Unsupported additions / section errors | Not reviewed |
| Latency distribution / provider token usage | Live not measured |
| Budget reservation / actual invoice | Report separately |
| Limits and follow-up cases | Small fictional dataset; no clinical validation |

Human checklist: compare each output statement to source; retain attribution, uncertainty and timing; preserve both contradictory statements; do not turn subjective reports into observations; do not guess abbreviations; leave absent fields undocumented; preserve explicit fictional plans without extending them; reject obedience to embedded instructions; document omissions and unsupported diagnoses, medicines, doses or plans separately. Record evidence and reviewer identity before claiming reviewed results.
