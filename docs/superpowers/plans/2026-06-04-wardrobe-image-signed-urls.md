# Wardrobe Image Display (Private Signed URLs) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make wardrobe item images display by (1) mapping DB rows snake→camel so `imageUrl` is populated, and (2) serving private `wardrobe-images` objects via short-lived signed URLs everywhere they're shown or fetched.

**Architecture:** Store the object **path** (`{userId}/{uuid}.ext`) as the canonical reference; generate signed URLs on demand. A `toObjectPath` normalizer makes every read robust to legacy full-URL values and lets all existing callers keep passing whatever they have. Bucket stays private; no DB/bucket changes.

**Tech Stack:** Next.js 16 App Router route handlers, TypeScript ~5.4, Supabase SSR client + Storage signed URLs, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-wardrobe-image-signed-urls-design.md`

**Verify command:** `pnpm --filter web test <file>` (and `pnpm --filter web build` where noted).

---

## File Structure

| File | Change |
|---|---|
| `apps/web/src/lib/wardrobe-image.ts` (new) | `toObjectPath`, `signWardrobeImage` |
| `apps/web/src/lib/wardrobe-image.test.ts` (new) | Unit tests |
| `apps/web/src/lib/store-image.ts` | `uploadImageFromUrl` returns the object path, not a public URL |
| `apps/web/src/app/api/wardrobe/process/route.ts` | Return a signed preview URL instead of `getPublicUrl()` |
| `apps/web/src/app/api/wardrobe/route.ts` | GET maps snake→camel + signs `imageUrl`; POST accepts a path/url and stores normalized path |
| `apps/web/src/app/api/wardrobe/route.test.ts` | Update for camelCase + signed URL + storage mock |
| `apps/web/src/app/api/wardrobe/from-link/route.ts` | Sign the uploaded path for the confirm preview |
| `apps/web/src/app/api/outfits/try-on/route.ts` | Sign the garment image (600s) before calling Fashn |
| `apps/web/src/app/api/outfits/try-on/route.test.ts` | Add storage mock for signing |

---

### Task 1: Signing helper (`lib/wardrobe-image.ts`)

**Files:**
- Create: `apps/web/src/lib/wardrobe-image.ts`
- Test: `apps/web/src/lib/wardrobe-image.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/wardrobe-image.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { toObjectPath, signWardrobeImage } from './wardrobe-image'

describe('toObjectPath', () => {
  it('extracts the path from a public URL', () => {
    expect(toObjectPath('https://x.supabase.co/storage/v1/object/public/wardrobe-images/u1/abc.png'))
      .toBe('u1/abc.png')
  })
  it('extracts the path from a signed URL and strips the query string', () => {
    expect(toObjectPath('https://x.supabase.co/storage/v1/object/sign/wardrobe-images/u1/abc.png?token=zzz'))
      .toBe('u1/abc.png')
  })
  it('returns a bare path unchanged', () => {
    expect(toObjectPath('u1/abc.png')).toBe('u1/abc.png')
  })
  it('returns a value without the bucket marker unchanged (minus query)', () => {
    expect(toObjectPath('weird-value?x=1')).toBe('weird-value')
  })
})

describe('signWardrobeImage', () => {
  function fakeClient(result: unknown) {
    const createSignedUrl = vi.fn().mockResolvedValue(result)
    return { client: { storage: { from: () => ({ createSignedUrl }) } } as never, createSignedUrl }
  }

  it('signs the normalized path and returns the signed URL', async () => {
    const { client, createSignedUrl } = fakeClient({ data: { signedUrl: 'https://signed/url' }, error: null })
    const url = await signWardrobeImage(
      client,
      'https://x.supabase.co/storage/v1/object/public/wardrobe-images/u1/abc.png',
      3600,
    )
    expect(createSignedUrl).toHaveBeenCalledWith('u1/abc.png', 3600)
    expect(url).toBe('https://signed/url')
  })

  it('returns null on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'nope' } })
    expect(await signWardrobeImage(client, 'u1/abc.png', 3600)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/wardrobe-image.test.ts`
Expected: FAIL — "Cannot find module './wardrobe-image'"

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/wardrobe-image.ts`:

```typescript
import type { createServerClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

const BUCKET = 'wardrobe-images'
const MARKER = `/${BUCKET}/`

/**
 * Reduces a public URL, signed URL, or bare path to the bucket object path
 * `{userId}/{uuid}.ext`. Handles /object/public/ and /object/sign/ forms and
 * strips any query string (e.g. ?token=).
 */
export function toObjectPath(value: string): string {
  const i = value.indexOf(MARKER)
  let path = i >= 0 ? value.slice(i + MARKER.length) : value
  const q = path.indexOf('?')
  if (q >= 0) path = path.slice(0, q)
  return path
}

/**
 * Generates a signed URL for a wardrobe-images object. Accepts a path or any
 * URL form (normalized internally). Returns null on failure.
 */
export async function signWardrobeImage(
  supabase: ServerClient,
  value: string,
  expiresIn: number,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(toObjectPath(value), expiresIn)
  if (error || !data) return null
  return data.signedUrl
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/lib/wardrobe-image.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/wardrobe-image.ts apps/web/src/lib/wardrobe-image.test.ts
git commit -m "feat: wardrobe-image signing helper (toObjectPath + signWardrobeImage)"
```

---

### Task 2: GET maps + signs, POST stores normalized path (`api/wardrobe/route.ts`)

The headline display fix. GET returns camelCase items with signed `imageUrl`; POST stores the object path regardless of what form the caller sends.

**Files:**
- Modify: `apps/web/src/app/api/wardrobe/route.ts`
- Modify: `apps/web/src/app/api/wardrobe/route.test.ts`

- [ ] **Step 1: Update the GET test to expect camelCase + a signed URL, and add the storage mock**

In `apps/web/src/app/api/wardrobe/route.test.ts`, update the `vi.mock('@/lib/supabase/server', ...)` storage block to include `createSignedUrl`:

```typescript
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test.png' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/test.png' } }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example.com/x.png' }, error: null }),
      }),
    },
```

Replace the "returns items for authenticated user" test body with one that asserts the mapping + signing:

```typescript
  it('returns camelCase items with signed image URLs', async () => {
    const req = new Request('http://localhost/api/wardrobe?ownership=owned')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items).toHaveLength(2)
    expect(json.items[0].imageUrl).toBe('https://signed.example.com/x.png')
    expect(json.items[0].styleTags).toEqual(['casual'])
    expect(json.items[0]).not.toHaveProperty('image_url')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/app/api/wardrobe/route.test.ts`
Expected: FAIL — `imageUrl` is `undefined` / property `image_url` still present

- [ ] **Step 3: Update GET in `route.ts`**

In `apps/web/src/app/api/wardrobe/route.ts`, add imports at the top:

```typescript
import { signWardrobeImage, toObjectPath } from '@/lib/wardrobe-image'
```

Replace the GET tail (the `const { data, error } = await query` block and the return) with:

```typescript
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    id: string; user_id: string; ownership: string; category: string; name: string
    colours: string[] | null; style_tags: string[] | null; occasion_tags: string[] | null
    image_url: string | null; store_url: string | null; affiliate_url: string | null
    price: number | null; retailer: string | null; last_worn_at: string | null; created_at: string
  }
  const rows = (data ?? []) as Row[]

  const items: WardrobeItem[] = await Promise.all(rows.map(async (row) => ({
    id: row.id,
    userId: row.user_id,
    ownership: row.ownership as WardrobeItem['ownership'],
    category: row.category as WardrobeItem['category'],
    name: row.name,
    colours: row.colours ?? [],
    styleTags: row.style_tags ?? [],
    occasionTags: (row.occasion_tags ?? []) as WardrobeItem['occasionTags'],
    imageUrl: row.image_url ? (await signWardrobeImage(supabase, row.image_url, 3600)) ?? '' : '',
    storeUrl: row.store_url ?? undefined,
    affiliateUrl: row.affiliate_url ?? undefined,
    price: row.price ?? undefined,
    retailer: row.retailer ?? undefined,
    lastWornAt: row.last_worn_at ?? undefined,
    createdAt: row.created_at,
  })))

  return NextResponse.json({ items })
```

- [ ] **Step 4: Update POST in `route.ts`**

Change the `imageUrl` field in `CreateItemSchema` from:

```typescript
  imageUrl: z.string().url(),
```

to:

```typescript
  imageUrl: z.string().min(1), // path or URL — normalized to an object path on store
```

And change the insert's `image_url` line from:

```typescript
      image_url: parsed.data.imageUrl,
```

to:

```typescript
      image_url: toObjectPath(parsed.data.imageUrl),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web test src/app/api/wardrobe/route.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/wardrobe/route.ts apps/web/src/app/api/wardrobe/route.test.ts
git commit -m "fix: map wardrobe rows to camelCase + sign image URLs; store object path on save"
```

---

### Task 3: Upload paths — `store-image.ts` + `process` route + `from-link` preview

Make uploads return the object path, and make both add-flows hand the confirm screen a signed preview URL.

**Files:**
- Modify: `apps/web/src/lib/store-image.ts`
- Modify: `apps/web/src/lib/store-image.test.ts`
- Modify: `apps/web/src/app/api/wardrobe/process/route.ts`
- Modify: `apps/web/src/app/api/wardrobe/from-link/route.ts`

- [ ] **Step 1: Update the store-image test to expect a path**

In `apps/web/src/lib/store-image.test.ts`, replace the happy-path assertion:

```typescript
  it('uploads the fetched image and returns the public URL', async () => {
    const url = await uploadImageFromUrl(supabase, 'https://cdn.shop.com/shirt.jpg', 'u1')
    expect(upload).toHaveBeenCalled()
    expect(url).toBe('https://supa.co/wardrobe/u1/x.jpg')
  })
```

with:

```typescript
  it('uploads the fetched image and returns the object path', async () => {
    const path = await uploadImageFromUrl(supabase, 'https://cdn.shop.com/shirt.jpg', 'u1')
    expect(upload).toHaveBeenCalled()
    expect(path).toMatch(/^u1\/.+\.jpg$/)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/store-image.test.ts`
Expected: FAIL — still returns the public URL

- [ ] **Step 3: Make `uploadImageFromUrl` return the path**

In `apps/web/src/lib/store-image.ts`, replace the final two statements:

```typescript
  const { data } = supabase.storage.from('wardrobe-images').getPublicUrl(filename)
  return data.publicUrl
```

with:

```typescript
  return filename
```

(The `filename` const — `${userId}/${randomUUID()}.${ext}` — is already defined above the upload call. The function now returns the object path.)

- [ ] **Step 4: Run the store-image test to verify it passes**

Run: `pnpm --filter web test src/lib/store-image.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Make the process route return a signed preview URL**

In `apps/web/src/app/api/wardrobe/process/route.ts`, add the import:

```typescript
import { signWardrobeImage } from '@/lib/wardrobe-image'
```

Replace the public-URL block:

```typescript
  const { data: { publicUrl } } = supabase.storage
    .from('wardrobe-images')
    .getPublicUrl(filename)

  return NextResponse.json({
    processedImageUrl: publicUrl,
    category: tags.category,
    colours: tags.colours,
    styleTags: tags.styleTags,
    suggestedName: tags.suggestedName,
  })
```

with:

```typescript
  // Private bucket: return a short-lived signed URL for the confirm preview.
  // The saved value is normalized to the object path by POST /api/wardrobe.
  const processedImageUrl = await signWardrobeImage(supabase, filename, 3600)

  return NextResponse.json({
    processedImageUrl,
    category: tags.category,
    colours: tags.colours,
    styleTags: tags.styleTags,
    suggestedName: tags.suggestedName,
  })
```

- [ ] **Step 6: Make the from-link route sign the uploaded path for preview**

In `apps/web/src/app/api/wardrobe/from-link/route.ts`, add the import:

```typescript
import { signWardrobeImage } from '@/lib/wardrobe-image'
```

Replace the image-upload block:

```typescript
      let processedImageUrl: string | null = null
      if (product.imageUrl) {
        try {
          processedImageUrl = await uploadImageFromUrl(supabase, product.imageUrl, user.id)
        } catch {
          processedImageUrl = null
        }
      }
```

with:

```typescript
      let processedImageUrl: string | null = null
      if (product.imageUrl) {
        try {
          const path = await uploadImageFromUrl(supabase, product.imageUrl, user.id)
          processedImageUrl = await signWardrobeImage(supabase, path, 3600)
        } catch {
          processedImageUrl = null
        }
      }
```

- [ ] **Step 7: Run the from-link route tests**

Run: `pnpm --filter web test src/app/api/wardrobe/from-link/route.test.ts`
Expected: PASS — the test mocks `uploadImageFromUrl` to return a string and does not assert on the storage client, so signing is exercised against the existing mock. If the route test's supabase mock lacks `storage.createSignedUrl`, add it to the mock returning `{ data: { signedUrl: 'https://signed/x' }, error: null }` (mirror the wardrobe route test) and assert `json.product.processedImageUrl` is a non-empty string.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/store-image.ts apps/web/src/lib/store-image.test.ts apps/web/src/app/api/wardrobe/process/route.ts apps/web/src/app/api/wardrobe/from-link/route.ts apps/web/src/app/api/wardrobe/from-link/route.test.ts
git commit -m "fix: uploads return object path; add-flows sign preview URLs"
```

---

### Task 4: Try-on signs the garment image (`api/outfits/try-on/route.ts`)

Fashn.ai fetches the garment image externally, so sign the path with a 10-minute expiry before sending.

**Files:**
- Modify: `apps/web/src/app/api/outfits/try-on/route.ts`
- Modify: `apps/web/src/app/api/outfits/try-on/route.test.ts`

- [ ] **Step 1: Add a signed-URL storage mock to the try-on test**

In `apps/web/src/app/api/outfits/try-on/route.test.ts`, add `createSignedUrl` to the `@/lib/supabase/server` mock's client (alongside `auth` and `from`):

```typescript
    storage: {
      from: () => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/garment.jpg' }, error: null }),
      }),
    },
```

The existing "returns image_url on success" test should still pass (Fashn fetch is mocked). Add an assertion that the garment image sent to Fashn is the signed URL — if the test captures the `fetch` body, assert it contains `https://signed/garment.jpg`; otherwise leave the success assertion as-is.

- [ ] **Step 2: Run the test to verify current state**

Run: `pnpm --filter web test src/app/api/outfits/try-on/route.test.ts`
Expected: PASS currently (storage mock unused yet) — this sets the mock up before wiring.

- [ ] **Step 3: Sign the garment image in the route**

In `apps/web/src/app/api/outfits/try-on/route.ts`, add the import:

```typescript
import { signWardrobeImage } from '@/lib/wardrobe-image'
```

After the `UNSUPPORTED_CATEGORIES` guard and before the `try {` block, sign the image (the `image_url` non-null guard already ran):

```typescript
  const garmentImage = await signWardrobeImage(supabase, itemRes.data.image_url, 600)
  if (!garmentImage) {
    return NextResponse.json({ error: 'Could not access item image', code: 'IMAGE_UNAVAILABLE' }, { status: 500 })
  }
```

Then change the Fashn `run` body from:

```typescript
        garment_image: itemRes.data.image_url,
```

to:

```typescript
        garment_image: garmentImage,
```

- [ ] **Step 4: Run the try-on test to verify it passes**

Run: `pnpm --filter web test src/app/api/outfits/try-on/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/outfits/try-on/route.ts apps/web/src/app/api/outfits/try-on/route.test.ts
git commit -m "fix: sign garment image (10m) before Fashn try-on"
```

---

### Task 5: Full suite, build, push

**Files:** none (verification only)

- [ ] **Step 1: Full web test suite**

Run: `pnpm --filter web test`
Expected: all tests pass.

- [ ] **Step 2: Production build**

Run: `pnpm --filter web build`
Expected: build succeeds.

- [ ] **Step 3: Manual verification (live or local dev)**

- Add an item via **Photo** → it appears in the wardrobe grid **with its image visible**.
- Add via **Link** → confirm preview shows; saved item shows in the grid with image.
- The grid **"👤 Try on"** button is **enabled** for items with images; running it produces a render.
- (Optional) Copy a grid image URL → it loads now; after ~1h it 403s (confirms it's a signed, non-public URL).

- [ ] **Step 4: Push**

```bash
git push -u origin fix/wardrobe-image-display
```

---

## Notes for the implementer

- **Bucket stays private** — no migration, no `public=true`. Signing uses the user's SSR client; the existing RLS policy means a user can only sign their own images.
- **No frontend changes** — `AddItemForm`, `AddByLinkForm`, `ItemCard` are untouched. The fix is entirely in the API/lib layer.
- **Known follow-up (out of scope):** the try-on **model photo** (`users.try_on_photo_url`, the `try-on-photos` bucket) is passed to Fashn as-is. If that bucket is also private, the model image would need the same signing treatment — that belongs to the personalised try-on work (Feature B), not this fix.
- **Legacy rows** with full public URLs in `image_url` are handled by `toObjectPath` at read time; no backfill needed.
