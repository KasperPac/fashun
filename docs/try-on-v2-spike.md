# Try-on v2 spike: image-edit model comparison

Write-up for ticket 1 of `docs/try-on-v2-brief.md`. Fill in after running the harness with real keys.

## How to run

```
export OPENAI_API_KEY=...   # never commit or paste keys
export GEMINI_API_KEY=...
node apps/web/scripts/try-on-spike/run.mjs <photo-folder> --out try-on-spike-out --runs 5
```

Photo folder: `person.jpg`, `outfit-1/top.jpg`, `outfit-1/bottom.jpg`, ... `outfit-5/` (any number of garment photos per outfit, `.jpg`, `.png` or `.webp`).
Add `--dry-run` to check the flow without keys or network. Override models with `--openai-model` / `--gemini-model`
(or `OPENAI_IMAGE_MODEL` / `GEMINI_IMAGE_MODEL`); the defaults are `gpt-image-2.6-sunburst` and `gemini-nano-banana-2.1`.

### Through the studio gateway (paid run)

```
U=${PAPERCLIP_API_URL%/}; U=${U%/api}
export OPENAI_BASE_URL="$U/api/studio/paid/<run id>/openai"
export GEMINI_BASE_URL="$U/api/studio/paid/<run id>/gemini"
export OPENAI_API_KEY="$PAPERCLIP_API_KEY" GEMINI_API_KEY="$PAPERCLIP_API_KEY"
NODE_USE_ENV_PROXY=1 node apps/web/scripts/try-on-spike/run.mjs <photo-folder> --out try-on-spike-out --runs 1
```

Unset base addresses default to the providers' public ones. The gateway allows one picture per call, so the harness
sends one request per picture. Never write a real key or run id into the repo.

Output: every returned picture, `outfit-N-sheet.html` (person | garments | OpenAI | Gemini, open in a browser), and `results.json` (models, time per call, run count, sizes, p50/p95).

## Models tested

| Provider | Model (exact name) | Date checked |
| --- | --- | --- |
| OpenAI | | |
| Google | | |

## Scores (1-5 each, per outfit)

| Outfit | Model | Same person | Garment fidelity | Fit | Background kept | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | OpenAI | | | | | |
| 1 | Gemini | | | | | |
| 2 | OpenAI | | | | | |
| 2 | Gemini | | | | | |
| 3 | OpenAI | | | | | |
| 3 | Gemini | | | | | |
| 4 | OpenAI | | | | | |
| 4 | Gemini | | | | | |
| 5 | OpenAI | | | | | |
| 5 | Gemini | | | | | |
| **Average** | OpenAI | | | | | |
| **Average** | Gemini | | | | | |

## Facts (price and terms from the Researcher, timings from `results.json`)

| | OpenAI | Gemini |
| --- | --- | --- |
| Price per picture (USD) | | |
| p50 / p95 time (s) | | |
| Largest input size | | |
| Max input pictures | | |
| Seed available | | |
| Data retention | | |
| Training on our data | | |

## Recommendation

Chosen model and why:

Price per picture and retention terms (needed for the privacy note and `TRY_ON_PRICE_USD`):

Timeouts to set in the route (`maxDuration`):

FASHN stays behind a switch until this is decided.
