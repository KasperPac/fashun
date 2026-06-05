# Reverse-image stock search via SerpAPI Google Lens (Design)

**Date:** 2026-06-05 · **Status:** Approved, ready to plan · **Branch:** `feature/lens-reverse-image-search`

## Problem

Feature C's photo→stock-image flow finds candidates with Claude's text `web_search`,
driven by a Vision-written description. Investigation showed this is the wrong tool:
- Vision often can't read the brand off a photo, so the query is generic.
- `web_search` returns **category/listing pages, not product pages**, and almost always
  `imageUrl: null`; those pages frequently have no `og:image` (or 403 Vercel's IP).

Net result in prod: imageless gallery tiles pointing at category pages — the feature
under-delivers. "Find the official photo of *this* item" is a **reverse-image-search**
problem, not a text-search one.

## Goal

Replace the photo flow's candidate-finding with **SerpAPI Google Lens** (reverse image
search): send the user's photo, get back real product matches **with thumbnail images**,
and show them in the existing confirm-screen gallery.

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | Provider | **SerpAPI Google Lens** |
| 2 | Cost gating | **Auto on every photo add** (one Lens call ≈ $0.01) |
| 3 | Stored image on select | **Ingest the Lens thumbnail directly** (no source-page re-fetch) |
| 4 | Scope | **Photo flow only** — add-by-link keeps `searchProduct` (it has a real URL/describe text) |

Rejected: client-side Lens (API key must stay server-side); re-fetching the match's source
page for a higher-res image (the bot-blocking/category-page problem we're escaping).

## Architecture & data flow

```
Photo upload
  → POST /api/wardrobe/process
       ├─ tagImage()                         (name / category / colours — unchanged)
       ├─ upload user's photo → SIGNED preview URL  (unchanged)
       └─ searchByImage(signedPreviewUrl)    (NEW — Lens; replaces searchProduct here)
  → returns { processedImageUrl, category, colours, styleTags, suggestedName, candidates[] }

  → Confirm screen (AddItemForm): tiles now show real thumbnails (candidate.imageUrl)
  → On Save:
       • user photo  → POST /api/wardrobe (user photo)                      [unchanged]
       • stock match → POST /api/wardrobe/ingest-image { imageUrl }  (NEW — ingest thumbnail)
                       → POST /api/wardrobe with the returned bucket path + retailer/price
```

SerpAPI Google's servers fetch the photo from the short-lived **signed bucket URL**
(`signWardrobeImage` already mints these; signed URLs are publicly reachable).

## Components

### `apps/web/src/lib/lens-search.ts` (new)
- `export async function searchByImage(imageUrl: string): Promise<ProductCandidate[]>`
- GET `https://serpapi.com/search.json` with params `engine=google_lens`, `url=<imageUrl>`,
  `country=au`, `hl=en`, `api_key=process.env.SERPAPI_API_KEY`.
- Parse `visual_matches[]`; map each to `ProductCandidate`:
  `{ url: m.link, title: m.title, imageUrl: m.thumbnail, retailer: m.source }`
  (+ optional `price` from `m.price?.extracted_value` if present).
- Keep only matches with a string `link` and a `thumbnail`; take the **top 3**.
- Return `[]` on missing key, non-200, fetch error, or no matches (soft-fail).
- Reuse the `ProductCandidate` shape from `product-search.ts` (extend with optional `price?: number`).

### `apps/web/src/app/api/wardrobe/process/route.ts` (modify)
- Replace the `searchProduct(tags.searchQuery, '')` block with
  `candidates = await searchByImage(processedImageUrl)` (the signed preview URL), guarded in
  try/catch → `[]`. `processedImageUrl` must be non-null to search (if signing failed, skip).
- Response keeps the same shape; `candidates` now carries thumbnails (+ optional price).
- `tags.searchQuery` is no longer consumed here; leave `tagImage` as-is (harmless).

### `apps/web/src/app/api/wardrobe/ingest-image/route.ts` (new)
- `POST { imageUrl: string }` (zod). Auth required (`getUser`).
- SSRF guard: reject non-public/loopback hosts (reuse the same `isPubliclyFetchable` logic as
  `from-link`; extract it to a shared `lib/ssrf.ts` so both routes share one copy).
- `uploadImageFromUrl(supabase, imageUrl, user.id)` → object path; `signWardrobeImage(path, 3600)`.
- Return `{ imageUrl: signedPreview, path }`. On failure → 502 `{ error }`.

### `apps/web/src/components/wardrobe/AddItemForm.tsx` (modify)
- `Candidate` gains optional `price?: number`. Tiles already render `candidate.imageUrl` — no
  layout change, they just populate now.
- Stock-pick Save path: replace the `from-link` call with
  `POST /api/wardrobe/ingest-image { imageUrl: selected.candidate.imageUrl }`; on success use the
  returned signed path as `imageUrl`, plus `retailer`/`price` from the candidate and
  `storeUrl = candidate.url`; then `POST /api/wardrobe`. Graceful fallback to the user's photo on
  any failure (existing notice pattern). User-photo path unchanged.

### Env
- New `SERPAPI_API_KEY` — add to `apps/web/.env.local` and Vercel (all environments).

## Error handling / edge cases

- No `SERPAPI_API_KEY` / Lens error / no matches → `searchByImage` returns `[]` → no gallery,
  user photo saved as today. Zero regression.
- `processedImageUrl` null (photo upload/sign failed) → skip the Lens call (no URL to send).
- `ingest-image` fetch/upload failure → AddItemForm shows the fallback notice and saves the
  user's photo.
- SSRF: `ingest-image` only fetches public hosts; the Lens thumbnail URLs are public CDN images.

## Cost / latency

- One SerpAPI Lens call per photo add (~$0.01). One thumbnail ingest only when a stock match is
  chosen. No extra Anthropic calls beyond the existing `tagImage`.

## Testing

- `lens-search.test.ts` — mock `fetch`: a SerpAPI `visual_matches` payload → mapped candidates
  (top 3, thumbnails); non-200 / missing key / empty matches → `[]`.
- `process/route.test.ts` — mock `searchByImage`; candidates returned; `searchByImage` throwing
  doesn't break the response (still 200, `candidates: []`).
- `ingest-image/route.test.ts` — 401 unauth; 400 bad body; SSRF reject (loopback → 400);
  success → returns signed path (mock `uploadImageFromUrl` + `signWardrobeImage`).
- `ssrf.test.ts` — the extracted guard (loopback/private/link-local/non-http → false).
- UI verified manually (no React component-test harness).

## Out of scope

- Changing the add-by-link flow (keeps `searchProduct`).
- Higher-res image via source-page fetch (thumbnail-direct chosen).
- Per-user search caps / rate limiting (auto-every-add accepted at beta volume).
- Removing the now-unused `searchQuery` from `tagImage` (left in place; no consumer harm).
