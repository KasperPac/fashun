# Wardrobe Image Display — Private Signed URLs — Design Spec

**Date:** 2026-06-04
**Status:** Proposed
**Type:** Bug fix (broken wardrobe images) + privacy hardening

---

## 1. Problem

Wardrobe item images render as broken links. Two root causes, found by tracing the data path:

1. **Snake/camel mismatch (confirmed).** `GET /api/wardrobe` returns `data as WardrobeItem[]` — raw DB rows with no field mapping. DB column is `image_url`; `ItemCard` reads `item.imageUrl`. So `item.imageUrl` is always `undefined` → `<img src={undefined}>`. This also disables the grid's "Try on" button (`disabled={!item.imageUrl}`).
2. **Private bucket served via public URLs (confirmed via migration).** `003_storage_buckets.sql` creates `wardrobe-images` with `public = false`, but upload code returns `getPublicUrl()`. Public URLs on a private bucket return 403.

**Decision:** keep the bucket **private** and serve images via **short-lived signed URLs** (clothing photos stay non-public). Try-on photos / skin selfies remain in their own private bucket, unchanged.

---

## 2. Approach

Store the **object path** (`{userId}/{uuid}.ext`) as the canonical image reference and generate a fresh **signed URL** whenever an image must be displayed or fetched. A normalizer makes this robust to any legacy rows that currently hold a full public URL, and lets every existing caller keep passing whatever URL/path it has — the save layer always reduces it to a clean path.

**Security bonus:** signing uses the user's SSR client, and the existing RLS policy (`wardrobe_images_user_access`: `auth.uid()::text = foldername[1]`) means a user can only sign **their own** images.

**Try-on note:** Fashn.ai fetches the garment image from an external server, so the try-on route signs the path with a slightly longer expiry and passes that signed URL to Fashn. The image stays private and unguessable; it is briefly fetchable by Fashn during the render only.

---

## 3. New shared helper — `apps/web/src/lib/wardrobe-image.ts`

```ts
import type { createServerClient } from '@/lib/supabase/server'
type ServerClient = Awaited<ReturnType<typeof createServerClient>>

/** Reduces a public URL, signed URL, or bare path to the bucket object path
 *  `{userId}/{uuid}.ext`. Handles /object/public/ and /object/sign/ forms and
 *  strips any query string (e.g. ?token=). */
export function toObjectPath(value: string): string

/** Generates a signed URL for a wardrobe-images object. Accepts a path or any
 *  URL form (normalized internally). Returns null on failure. */
export async function signWardrobeImage(
  supabase: ServerClient, value: string, expiresIn: number,
): Promise<string | null>
```

`toObjectPath` logic: find `'/wardrobe-images/'`; if present, take the substring after it; else use the value as-is; then drop anything from `'?'` onward.

`signWardrobeImage`: `supabase.storage.from('wardrobe-images').createSignedUrl(toObjectPath(value), expiresIn)` → `data.signedUrl` or `null` on error.

---

## 4. Changes by file

| File | Change |
|---|---|
| `lib/wardrobe-image.ts` (new) | `toObjectPath`, `signWardrobeImage` (+ unit tests) |
| `lib/store-image.ts` | `uploadImageFromUrl` returns the **object path** (`filename`), not a public URL |
| `api/wardrobe/process/route.ts` | After upload, return `processedImageUrl = signWardrobeImage(path, 3600)` (signed preview) instead of `getPublicUrl()` |
| `api/wardrobe/route.ts` — POST | `imageUrl` validation `z.string().url()` → `z.string().min(1)`; store `image_url: toObjectPath(imageUrl)` |
| `api/wardrobe/route.ts` — GET | Map rows snake→camel; set each `imageUrl = await signWardrobeImage(row.image_url, 3600)` (via `Promise.all`) |
| `api/wardrobe/from-link/route.ts` | Sign the uploaded path for the confirm preview (`processedImageUrl`); save path normalized on POST as above |
| `api/outfits/try-on/route.ts` | `garment_image = await signWardrobeImage(item.image_url, 600)` instead of passing `image_url` directly |
| Tests | Update `route.test.ts` (GET expects camelCase + signed URL; storage mock), `store-image.test.ts` (returns path), try-on + from-link tests |

**Expiries:** display 3600s (1h); try-on 600s (10m, enough for Fashn to fetch).

**Frontend:** **no changes** to `AddItemForm` / `AddByLinkForm`. They keep saving whatever `processedImageUrl` they received; the POST normalizes it to a path. `ItemCard` already reads `item.imageUrl`, which the GET now populates with a signed URL.

---

## 5. Existing data

Any rows already holding a full public URL in `image_url` are handled transparently: `signWardrobeImage` → `toObjectPath` extracts the path before signing. No migration/backfill required. (No change to the bucket's `public=false` setting — it stays private.)

---

## 6. Error handling

| Scenario | Handling |
|---|---|
| `createSignedUrl` fails (missing object, etc.) | `signWardrobeImage` returns `null` → `imageUrl` null → card shows no image, try-on disabled for that item (graceful) |
| Legacy row with malformed value | `toObjectPath` returns best-effort path; sign fails → null |
| Try-on item has no image | Existing `NO_ITEM_PHOTO` 400 path unchanged (guard before signing) |

---

## 7. Out of scope

- Making the bucket public (explicitly rejected — privacy).
- Backfilling/rewriting existing `image_url` values (normalizer handles them live).
- Changing the `try-on-photos` bucket or skin-tone handling.
- A CDN/caching layer for signed URLs (revisit if signing latency on the grid matters).

---

## 8. Verification

- Add an item via Photo → it appears in the grid **with its image visible**.
- Add via Link → confirm preview shows; saved item shows in grid.
- "Try on" button is **enabled** for items with images and produces a render (Fashn fetches the signed URL).
- Open a grid image URL in a new tab after expiry → eventually 403 (confirms it's signed/non-public), while fresh loads work.
