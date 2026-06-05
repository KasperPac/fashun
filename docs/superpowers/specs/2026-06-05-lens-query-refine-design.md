# Focus Lens search on the garment via a text query (Design)

**Date:** 2026-06-05 · **Status:** Approved · **Branch:** `feature/lens-query-refine`

## Problem

Google Lens reverse-image search matches the **whole image's dominant content**. A photo of
a person on a couch wearing a shirt makes the scene (couch/person) the subject, so Lens
returns other couch/person scenes instead of the shirt. We send Lens the entire photo, with
no signal about which part is the item.

## Goal

Bias the Lens search toward the garment by adding a **text query** (Google Lens multisearch:
image + text → "find *this described thing* in the image"), reusing the garment description
`tagImage` already produces.

## Decision (locked during brainstorming)

Approach **A — text-refine** (chosen over B "crop to garment" and C "both"): cheapest, reuses
existing output, one extra param. Crop (B) is the fallback if `q` proves insufficient — no
code from this change is wasted, since the `q` param is harmless if Lens ignores it.

Scope guard: one item per photo (the primary garment `tagImage` names); no cropping; no new
dependencies.

## Components

### `apps/web/src/lib/lens-search.ts`
- Signature gains an optional query:
  `searchByImage(imageUrl: string, query?: string): Promise<ProductCandidate[]>`
- When `query` is a non-empty string, add `q: query` to the `URLSearchParams` sent to
  `https://serpapi.com/search.json?engine=google_lens&...`. When absent/empty, behave exactly
  as today (no `q`). All mapping / soft-fail behaviour unchanged.

### `apps/web/src/app/api/wardrobe/process/route.ts`
- Pass the garment description to the search:
  `candidates = await searchByImage(processedImageUrl, tags.searchQuery || tags.suggestedName)`
- `tags.searchQuery` is the brand+model query when Vision is confident (else `''`); it falls
  back to `tags.suggestedName` (always a short garment description, e.g. "White Leather
  Low-top Sneakers"). This re-purposes the previously-vestigial `searchQuery`.
- Guarded `if (processedImageUrl)` + try/catch → `[]` stays as-is.

## Edge cases

- Both empty: `suggestedName` is never empty (defaults to the `tagImage` fallback "My item"),
  so `query` is effectively always non-empty. In the rare full-Vision-failure case `query`
  is "My item" — Lens just leans on the image; no worse than today. Not worth special-casing.
- SerpAPI ignores an unknown param gracefully, so if `google_lens` doesn't honour `q`, results
  are unchanged (no regression).

## Testing

- `lens-search.test.ts`: when a query is passed, the SerpAPI request URL contains
  `q=<encoded query>`; when no query is passed, the URL has no `q` param. Existing mapping /
  soft-fail tests unchanged.
- `process/route.test.ts`: `searchByImage` is called with the signed preview URL **and** the
  expected query (`tags.searchQuery || tags.suggestedName`).
- UI unchanged → no UI test.

## Build/deploy verification (cannot be unit-tested — SerpAPI key is Vercel-only)

After deploy: re-upload the couch-shirt photo; confirm the gallery now returns **shirts**, not
scenes. If `q` is rejected or doesn't focus enough, escalate to Approach B (crop to the
garment bounding box) — tracked as the known fallback, not built now.

## Out of scope

- Cropping / bounding-box detection (Approach B fallback).
- Multi-item handling for full-body photos.
- Removing the `searchQuery` field anywhere (now back in use as the query source).
