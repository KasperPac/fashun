# Feature C — Photo → identify → official stock image (Design)

**Date:** 2026-06-04 · **Status:** Approved, ready to plan · **Branch:** `feature/photo-stock-image`

## Problem

In the **Photo** add flow, the user's casual phone snapshot is stored and later used in
virtual try-on. Phone photos render poorly in try-on; clean official product (stock)
images render far better. We want to recognise the item, find it online, and let the
user swap their snapshot for the official stock image.

## Goal

After Claude Vision tags an uploaded photo, also identify the item, search for it online,
and offer the official stock image(s) as a better-quality alternative to the user's photo —
defaulting to the stock image but always letting the user keep their own.

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | When the find step runs | **Auto on every photo add** |
| 2 | Default image when a match is found | **Stock image pre-selected** (user can switch back) |
| 3 | How many matches surfaced | **Small gallery, 2–3 candidates** |
| 4 | How the search query is produced | **Extend the existing `tagImage` Vision call** (one Vision call) |
| 5 | Latency handling | **One synchronous `/process` call** (Vision + search together) |
| 6 | Architecture for ingest + enrichment | **Reuse `/api/wardrobe/from-link` on selection** (lazy ingest of only the chosen item) |

YAGNI guards: no separate confidence field (an empty `searchQuery` is the "couldn't
identify" signal); no per-candidate fetch up front (only the chosen candidate is fetched);
no new React component-test harness (repo has none — UI verified manually).

## Architecture & data flow

```
Photo upload
  → POST /api/wardrobe/process   (one synchronous call)
       ├─ tagImage()                         (extended: also returns searchQuery)
       ├─ upload user's photo → signed preview   (unchanged)
       └─ if searchQuery non-empty: searchProduct(searchQuery, '') → candidates[]
  → returns { processedImageUrl (user photo, signed), category, colours,
              styleTags, suggestedName, searchQuery, candidates[] }

  → Confirm screen
       • candidates present → image picker: user-photo tile + 2–3 stock tiles,
         first stock candidate PRE-SELECTED
       • no candidates      → screen exactly as today (user photo only)

  → On Save
       • user photo selected → POST /api/wardrobe   (user photo + Vision colours)   [as today]
       • stock selected      → POST /api/wardrobe/from-link { url, itemPhotoBase64 }
                                 → returns ingested clean stock image (signed),
                                   colours (variant-matched to the photo), price, retailer
                               → POST /api/wardrobe with that image + price + retailer
```

Reused as-is (no changes): `product-fetch-claude.ts` / `product-extractor.ts` /
`product-scraper.ts` (via from-link), `store-image.ts` (`uploadImageFromUrl`),
`variant-matcher.ts` (`matchVariantToPhoto`), `wardrobe-image.ts` (`signWardrobeImage`).

## Components & changes

### `apps/web/src/lib/tagger.ts`
- Add `searchQuery: string` to `TagResult` and `''` to `FALLBACK`.
- Extend the Vision prompt to also return a concise product search query when the item is
  identifiable (brand + model, e.g. `"Timberland 6-inch premium boots"`), else empty string.
- Parse defensively: `searchQuery = typeof parsed.searchQuery === 'string' ? parsed.searchQuery : ''`.

### `apps/web/src/lib/product-search.ts`
- Make the retailer clause conditional so an **empty `store`** works:
  `store ? 'at the Australian retailer "<store>"' : 'from any major Australian retailer'`.
- Backward-compatible: from-link's describe mode still passes a real `store`. Return shape
  unchanged (`ProductCandidate[]` with `{url, title, imageUrl, retailer}`).

### `apps/web/src/app/api/wardrobe/process/route.ts`
- After `tagImage`, if `tags.searchQuery` is non-empty, call `searchProduct(tags.searchQuery, '')`.
- Add `searchQuery` and `candidates` to the JSON response. Everything existing is unchanged.
- A failed/empty search must not break the add: `searchProduct` already soft-fails to `[]`;
  guard the call so the route still returns the (user-photo) result.

### `apps/web/src/components/wardrobe/AddItemForm.tsx`
- `ProcessResult` gains `candidates: Candidate[]` and `searchQuery: string`
  (`Candidate = { url; title; imageUrl: string | null; retailer: string | null }`).
- Confirm screen renders an image picker only when `candidates.length > 0`:
  the user's photo tile plus one tile per candidate (`candidate.imageUrl`, shown via `<img>`).
  Selection state `selected: { kind: 'user' } | { kind: 'stock'; candidate: Candidate }`,
  defaulting to the first stock candidate when candidates exist, else `user`.
- On Save:
  - `user`: unchanged — `POST /api/wardrobe` with the user photo `processedImageUrl` and
    Vision `colours`.
  - `stock`: `POST /api/wardrobe/from-link { url: candidate.url, itemPhotoBase64: <user photo base64> }`;
    on a `confirm` response with a non-null `processedImageUrl`, `POST /api/wardrobe` using
    that image, the returned `colours`, `price`, `retailer`. The user's edited `name`/`category`
    and Vision `styleTags` remain authoritative.
- The user photo's base64 must be retained in component state after `/process` so it can be
  passed to from-link for colour-variant matching.

## Error handling / edge cases

- **No `searchQuery` / no candidates** → no gallery; save the user photo. Zero regression.
- **`searchProduct` throws** → soft-fails to `[]` (existing lib behaviour); add proceeds with
  the user photo.
- **Stock save where from-link returns `mode:'manual'` or a null `processedImageUrl`** →
  graceful fallback: show a notice ("Couldn't fetch that product image — using your photo")
  and save the user's photo. The add is never blocked.
- **SSRF**: candidate URLs go through from-link, whose `isPubliclyFetchable` guard still runs.

## Cost / latency (documented, accepted)

- +1 Claude web_search per photo add (folded latency into the single `/process` call).
- +1 page fetch (from-link) **only** when the user chooses a stock image.
- No extra Vision call (identification folded into the existing `tagImage` call).

## Testing

- `tagger.test.ts`: `searchQuery` parsed on success; `''` on fallback/non-string.
- `product-search.test.ts`: an empty-`store` call still parses and returns candidates.
- `process/route.test.ts`: candidates included when `searchQuery` present; empty `searchQuery`
  → no search, no candidates; `searchProduct` throwing does not break the response.
- UI verified manually (no React component-test harness in the repo; do not introduce one for v1).

## Out of scope (future)

- Per-candidate live preview / variant picker for stock before save (v1 auto-matches the
  colour from the user's photo via `matchVariantToPhoto`).
- Auto-replacing the photo without confirmation.
- A confidence threshold gating the search (empty `searchQuery` is the only gate).
