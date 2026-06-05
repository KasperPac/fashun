# Backfill: stock images for already-uploaded photos (Design)

**Date:** 2026-06-05 · **Status:** Approved · **Type:** One-off throwaway dev script (not committed)

## Goal

Retroactively apply Feature C's "official stock image" upgrade to wardrobe items that
were already added as the user's own phone photos. Interactive, one item at a time, on
the operator's own account.

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | What it is | One-off backfill on the operator's own account (not a shipped feature) |
| 2 | Apply behaviour | Interactive **y/n per item** (never silent auto-replace) |
| 3 | Implementation | **Self-contained `.mjs`** (Approach A): no new deps, no app coupling, throwaway |
| 4 | Image to ingest | Candidate page `og:image`, falling back to the web-search thumbnail |

## Constraints / environment

- `NEXT_PUBLIC_SUPABASE_URL` is present in `apps/web/.env.local`; **`ANTHROPIC_API_KEY` and
  `SUPABASE_SERVICE_ROLE_KEY` are empty locally** — the operator supplies both at runtime
  (they exist in Vercel). Service-role bypasses RLS for DB + Storage read/write.
- No TS runner installed (no tsx/ts-node); `@supabase/supabase-js` ^2.43 and
  `@anthropic-ai/sdk` are available → plain `node` `.mjs` is the right fit.
- Supabase MCP is connected to the wrong org and cannot reach this project, so this script
  (service-role + supabase-js) is the access path, not MCP.

## Script

`apps/web/scripts/backfill-stock-images.mjs` — **uncommitted throwaway**, deleted after the run.

**Run:**
```
ANTHROPIC_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  node apps/web/scripts/backfill-stock-images.mjs <email> [--dry-run]
```
`NEXT_PUBLIC_SUPABASE_URL` is read from `apps/web/.env.local` (fallback to the env var).

## Flow

1. Create a service-role `supabase-js` client (`{ auth: { persistSession: false } }`).
2. Resolve `user_id` from `<email>` via `auth.admin.listUsers()` (paginate; match case-insensitively).
   Exit with a clear message if not found.
3. Select the user's **photo-only** items:
   `wardrobe_items` where `user_id = <id>` AND `retailer IS NULL` AND `store_url IS NULL`
   AND `image_url NOT LIKE 'http%'` (bucket objects never linked to a retailer).
4. For each item (sequential):
   1. `storage.from('wardrobe-images').download(image_url)` → `arrayBuffer` → base64.
   2. **Vision call** (`claude-haiku-4-5-20251001`) with the `tagImage` prompt → `searchQuery`.
      Empty/unparsed → print "couldn't identify — skipping" and continue.
   3. **Web-search call** (`web_search_20250305`) with the `searchProduct` prompt and an empty
      store → up to 3 candidates. None → print "no matches — skipping."
   4. Print: item name, current `image_url`, and the **top candidate** (title, retailer, page URL,
      image URL); list any other candidate URLs for reference.
   5. `readline` prompt **y/n** (default n).
   6. On **y** and not `--dry-run`:
      - Fetch the candidate page; extract `og:image` (regex, same approach as `product-scraper.ts`);
        fall back to the candidate's search-thumbnail URL.
      - Download that image, upload to `wardrobe-images` as `<userId>/<uuid>.<ext>` (service role).
      - `update wardrobe_items` set `image_url` = new path, `retailer` = candidate retailer,
        `store_url` = candidate page URL, for this `id`.
      - Print "updated → <new path>".
      - On `--dry-run`: print "[dry-run] would update → <candidate>", write nothing.
   7. On **n**: print "skipped."
5. Print a summary: processed / updated / skipped / errors.

## Safety & robustness

- `--dry-run` performs every read + the prompt but writes nothing (recommended first pass).
- Per-item `try/catch`: a download/search/ingest failure logs the item id + reason and continues.
- **Idempotent:** an updated item gains `retailer`/`store_url`, so it's excluded from the
  photo-only query on any re-run.
- Touches only the resolved user's rows; never deletes; only sets the three columns above.
- The original photo object is left in the bucket (not deleted) so a wrong call is recoverable.

## Out of scope

- Any shipped/user-facing UI (that was the rejected "in-app" option).
- Multi-candidate selection (top candidate only; y/n). Colour-variant re-matching and price
  capture (Feature C does these live; the backfill keeps it minimal).
- Automated tests (throwaway script hitting live infra; `--dry-run` is the verification).
