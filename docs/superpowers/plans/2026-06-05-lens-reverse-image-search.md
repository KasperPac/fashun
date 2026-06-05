# Lens Reverse-Image Stock Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the photo flow's text-search candidate-finding with SerpAPI Google Lens reverse-image search, so the confirm-screen gallery shows real product matches with thumbnail images.

**Architecture:** A new `lens-search` lib sends the user's signed photo URL to SerpAPI Google Lens and maps `visual_matches` to candidates (with thumbnails). `/api/wardrobe/process` calls it instead of `searchProduct`. A new `/api/wardrobe/ingest-image` endpoint ingests the chosen thumbnail into the bucket on selection. `tagImage` and the confirm UI layout are unchanged. Spec: `docs/superpowers/specs/2026-06-05-lens-reverse-image-search-design.md`.

**Tech Stack:** Next.js (non-standard — see `apps/web/AGENTS.md`), TypeScript, Vitest, Zod, Supabase, SerpAPI (REST).

---

## Shared conventions (read before any task)

- **Soft-fail** external calls to a safe empty value (mirror `product-search.ts` / `tagger.ts`): never throw out of `searchByImage`.
- **Vitest mock hoisting:** a mock referenced inside a `vi.mock(...)` factory must be declared with `vi.hoisted(...)` unless its variable is `mock`-prefixed.
- **Run the FULL suite** after each task: `pnpm --filter web test` (currently 102 green). **Build:** `pnpm --filter web build` for the UI task.
- Run all commands from the repo root `C:\dev\fashun`. Non-standard Next.js — mirror existing route patterns (`export async function POST(req: Request)` → `NextResponse.json`).
- **Reused as-is:** `store-image.ts` (`uploadImageFromUrl`), `wardrobe-image.ts` (`signWardrobeImage`), `tagger.ts`.

## File Structure

- **Create** `apps/web/src/lib/ssrf.ts` (+ test) — `isPubliclyFetchable`, extracted from `from-link` so two routes share one copy.
- **Modify** `apps/web/src/app/api/wardrobe/from-link/route.ts` — import the shared guard, drop the local copy.
- **Create** `apps/web/src/lib/lens-search.ts` (+ test) — `searchByImage(imageUrl)`.
- **Modify** `apps/web/src/lib/product-search.ts` — add optional `price?: number` to `ProductCandidate`.
- **Modify** `apps/web/src/app/api/wardrobe/process/route.ts` (+ test) — call `searchByImage` instead of `searchProduct`.
- **Create** `apps/web/src/app/api/wardrobe/ingest-image/route.ts` (+ test) — ingest a thumbnail URL into the bucket.
- **Modify** `apps/web/src/components/wardrobe/AddItemForm.tsx` — stock-save via `ingest-image`; `Candidate` gains `price?`.

---

## Task 1: Extract the SSRF guard to a shared lib

**Files:**
- Create: `apps/web/src/lib/ssrf.ts`
- Test: `apps/web/src/lib/ssrf.test.ts`
- Modify: `apps/web/src/app/api/wardrobe/from-link/route.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/ssrf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isPubliclyFetchable } from './ssrf'

describe('isPubliclyFetchable', () => {
  it('allows public http(s) URLs', () => {
    expect(isPubliclyFetchable('https://www.kmart.com.au/p/1')).toBe(true)
    expect(isPubliclyFetchable('http://example.com/x.jpg')).toBe(true)
  })
  it('rejects non-http(s) schemes', () => {
    expect(isPubliclyFetchable('ftp://example.com')).toBe(false)
    expect(isPubliclyFetchable('file:///etc/passwd')).toBe(false)
    expect(isPubliclyFetchable('not a url')).toBe(false)
  })
  it('rejects loopback and localhost', () => {
    expect(isPubliclyFetchable('http://localhost/admin')).toBe(false)
    expect(isPubliclyFetchable('http://127.0.0.1/x')).toBe(false)
    expect(isPubliclyFetchable('http://[::1]/x')).toBe(false)
  })
  it('rejects private and link-local ranges', () => {
    expect(isPubliclyFetchable('http://10.0.0.5/internal')).toBe(false)
    expect(isPubliclyFetchable('http://192.168.1.1/x')).toBe(false)
    expect(isPubliclyFetchable('http://172.16.0.1/x')).toBe(false)
    expect(isPubliclyFetchable('http://169.254.169.254/latest/meta-data')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/ssrf.test.ts`
Expected: FAIL — cannot resolve `./ssrf`.

- [ ] **Step 3: Create the lib**

Create `apps/web/src/lib/ssrf.ts`:

```ts
/**
 * Blocks SSRF to loopback / private / link-local hosts and non-http(s) schemes.
 * Used before any server-side fetch of a user/3rd-party-supplied URL.
 */
export function isPubliclyFetchable(rawUrl: string): boolean {
  let u: URL
  try { u = new URL(rawUrl) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  // IPv6 loopback / unspecified
  if (host === '::1' || host === '[::1]' || host === '::') return false
  // IPv4 literal private / loopback / link-local ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 127 || a === 10 || a === 0) return false
    if (a === 169 && b === 254) return false           // link-local
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
  }
  return true
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/lib/ssrf.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Use the shared guard in `from-link`**

In `apps/web/src/app/api/wardrobe/from-link/route.ts`:

Add to the imports (after the existing `import { searchProduct } ...` line):
```ts
import { isPubliclyFetchable } from '@/lib/ssrf'
```

Delete the local `isPubliclyFetchable` function (the whole `// Blocks SSRF...` comment + `function isPubliclyFetchable(rawUrl: string): boolean { ... }` block). Leave the call site (`if (!isPubliclyFetchable(url))`) untouched — it now resolves to the import.

- [ ] **Step 6: Run the full suite (no regression in from-link)**

Run: `pnpm --filter web test`
Expected: PASS — all green (102 + 4 new).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/ssrf.ts apps/web/src/lib/ssrf.test.ts apps/web/src/app/api/wardrobe/from-link/route.ts
git commit -m "refactor: extract isPubliclyFetchable to shared lib/ssrf"
```

---

## Task 2: `lens-search` lib

**Files:**
- Modify: `apps/web/src/lib/product-search.ts` (add `price?` to `ProductCandidate`)
- Create: `apps/web/src/lib/lens-search.ts`
- Test: `apps/web/src/lib/lens-search.test.ts`

- [ ] **Step 1: Add `price?` to the shared candidate type**

In `apps/web/src/lib/product-search.ts`, extend the interface:
```ts
export interface ProductCandidate {
  url: string
  title: string
  imageUrl: string | null
  retailer: string | null
  price?: number
}
```
(Existing `searchProduct` simply won't set `price` — no other change needed there.)

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/lens-search.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchByImage } from './lens-search'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubEnv('SERPAPI_API_KEY', 'test-key')
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const lensResponse = {
  visual_matches: [
    { position: 1, title: 'Nike Air Force 1 White', link: 'https://www.theiconic.com.au/af1', source: 'THE ICONIC', thumbnail: 'https://serpapi-cdn/af1.jpg', price: { extracted_value: 149.95, currency: 'AUD' } },
    { position: 2, title: 'Nike Dunk Low', link: 'https://www.footlocker.com.au/dunk', source: 'Foot Locker', thumbnail: 'https://serpapi-cdn/dunk.jpg' },
    { position: 3, title: 'No thumb', link: 'https://x.com/p', source: 'X' }, // dropped (no thumbnail)
    { position: 4, title: 'Fourth', link: 'https://x.com/q', source: 'X', thumbnail: 'https://serpapi-cdn/4.jpg' },
  ],
}

describe('searchByImage', () => {
  it('maps the top 3 thumbnailed visual matches to candidates', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => lensResponse })
    const out = await searchByImage('https://signed/photo.jpg')
    expect(out).toHaveLength(2) // only 2 of the first 3 have thumbnails; #4 not reached after slice
    expect(out[0]).toEqual({ url: 'https://www.theiconic.com.au/af1', title: 'Nike Air Force 1 White', imageUrl: 'https://serpapi-cdn/af1.jpg', retailer: 'THE ICONIC', price: 149.95 })
    expect(out[1].price).toBeUndefined()
    // the signed image URL is passed to SerpAPI
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('engine=google_lens')
    expect(calledUrl).toContain(encodeURIComponent('https://signed/photo.jpg'))
  })

  it('returns [] when SERPAPI_API_KEY is missing', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '')
    expect(await searchByImage('https://signed/photo.jpg')).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns [] on a non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) })
    expect(await searchByImage('https://signed/photo.jpg')).toEqual([])
  })

  it('returns [] when there are no visual matches', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ visual_matches: [] }) })
    expect(await searchByImage('https://signed/photo.jpg')).toEqual([])
  })

  it('returns [] when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network'))
    expect(await searchByImage('https://signed/photo.jpg')).toEqual([])
  })
})
```

Note on the slice semantics: the implementation **slices the first 3 raw matches, then filters by thumbnail** — so the third (no thumbnail) is dropped and the fourth is never considered → 2 results. The test asserts that exact behaviour.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/lens-search.test.ts`
Expected: FAIL — cannot resolve `./lens-search`.

- [ ] **Step 4: Implement the lib**

Create `apps/web/src/lib/lens-search.ts`:

```ts
import type { ProductCandidate } from './product-search'

interface LensMatch {
  link?: unknown
  title?: unknown
  thumbnail?: unknown
  source?: unknown
  price?: { extracted_value?: unknown }
}

/**
 * Reverse-image product search via SerpAPI Google Lens. Sends a publicly-reachable
 * image URL (a short-lived signed bucket URL) and maps the top visual matches to
 * candidates with real thumbnails. Returns [] on missing key / error / no matches.
 */
export async function searchByImage(imageUrl: string): Promise<ProductCandidate[]> {
  const key = process.env.SERPAPI_API_KEY
  if (!key) return []
  try {
    const params = new URLSearchParams({
      engine: 'google_lens',
      url: imageUrl,
      country: 'au',
      hl: 'en',
      api_key: key,
    })
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`)
    if (!res.ok) return []
    const data = await res.json()
    const matches: LensMatch[] = Array.isArray(data.visual_matches) ? data.visual_matches : []
    return matches
      .slice(0, 3)
      .filter((m) => typeof m.link === 'string' && typeof m.thumbnail === 'string')
      .map((m) => ({
        url: m.link as string,
        title: typeof m.title === 'string' ? m.title : (m.link as string),
        imageUrl: m.thumbnail as string,
        retailer: typeof m.source === 'string' ? m.source : null,
        price: typeof m.price?.extracted_value === 'number' ? m.price.extracted_value : undefined,
      }))
  } catch {
    return []
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web test src/lib/lens-search.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/product-search.ts apps/web/src/lib/lens-search.ts apps/web/src/lib/lens-search.test.ts
git commit -m "feat(lens-search): SerpAPI Google Lens reverse-image candidate search"
```

---

## Task 3: `/process` uses Lens instead of text search

**Files:**
- Modify: `apps/web/src/app/api/wardrobe/process/route.ts`
- Test: `apps/web/src/app/api/wardrobe/process/route.test.ts`

- [ ] **Step 1: Update the test**

In `apps/web/src/app/api/wardrobe/process/route.test.ts`, replace the `searchProduct` mock with `searchByImage`. Change the mock block:

```ts
const searchByImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/lens-search', () => ({ searchByImage }))
```

(Remove the `searchProduct` hoisted mock + its `vi.mock('@/lib/product-search', ...)` line.)

In `beforeEach`, replace `searchProduct.mockResolvedValue([candidate])` with:
```ts
  searchByImage.mockResolvedValue([candidate])
```

Replace the candidate-returning test and the empty-searchQuery test with these (the gallery no longer depends on `searchQuery` — it searches the image):

```ts
  it('returns tags, a signed preview, and Lens candidates (searched by the photo)', async () => {
    const res = await post(VALID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(searchByImage).toHaveBeenCalledWith('https://signed/preview.jpg')
    expect(json.processedImageUrl).toBe('https://signed/preview.jpg')
    expect(json.category).toBe('shoes')
    expect(json.candidates).toHaveLength(1)
    expect(json.candidates[0].url).toBe('https://shop.com/p/1')
  })

  it('still returns 200 with no candidates when searchByImage throws', async () => {
    searchByImage.mockRejectedValueOnce(new Error('boom'))
    const res = await post(VALID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.candidates).toEqual([])
  })
```

(Keep the 401 and 400 tests as-is. The `candidate` fixture already has `url/title/imageUrl/retailer`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/app/api/wardrobe/process/route.test.ts`
Expected: FAIL — route still imports/calls `searchProduct`, and `@/lib/lens-search` mock is unused / `searchByImage` not called.

- [ ] **Step 3: Implement the route change**

In `apps/web/src/app/api/wardrobe/process/route.ts`:

Change the import line:
```ts
import { searchByImage } from '@/lib/lens-search'
import type { ProductCandidate } from '@/lib/product-search'
```
(Remove `import { searchProduct, type ProductCandidate } from '@/lib/product-search'`.)

Replace the candidate block (the `// 4. If Vision identified...` block) with:
```ts
  // 4. Reverse-image search the user's photo for stock matches (soft-fail to []).
  let candidates: ProductCandidate[] = []
  if (processedImageUrl) {
    try {
      candidates = await searchByImage(processedImageUrl)
    } catch {
      candidates = []
    }
  }
```

Leave the final `return NextResponse.json({...})` unchanged (it already includes `searchQuery: tags.searchQuery` and `candidates` — `searchQuery` stays for backward compatibility but is now unused downstream).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/app/api/wardrobe/process/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `pnpm --filter web test`
Expected: PASS — all green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/wardrobe/process/route.ts apps/web/src/app/api/wardrobe/process/route.test.ts
git commit -m "feat(process): find stock candidates via reverse-image (Lens) search"
```

---

## Task 4: `/api/wardrobe/ingest-image` endpoint

**Files:**
- Create: `apps/web/src/app/api/wardrobe/ingest-image/route.ts`
- Test: `apps/web/src/app/api/wardrobe/ingest-image/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/wardrobe/ingest-image/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

const uploadImageFromUrl = vi.hoisted(() => vi.fn())
vi.mock('@/lib/store-image', () => ({ uploadImageFromUrl }))

const signWardrobeImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/wardrobe-image', () => ({ signWardrobeImage }))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://localhost/api/wardrobe/ingest-image', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  uploadImageFromUrl.mockResolvedValue('u1/abc.jpg')
  signWardrobeImage.mockResolvedValue('https://signed/abc.jpg')
})

describe('POST /api/wardrobe/ingest-image', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await post({ imageUrl: 'https://cdn/x.jpg' })).status).toBe(401)
  })

  it('returns 400 for a missing/invalid imageUrl', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ imageUrl: 'not a url' })).status).toBe(400)
  })

  it('returns 400 for a private/loopback URL (SSRF)', async () => {
    expect((await post({ imageUrl: 'http://169.254.169.254/x' })).status).toBe(400)
    expect((await post({ imageUrl: 'http://localhost/x' })).status).toBe(400)
    expect(uploadImageFromUrl).not.toHaveBeenCalled()
  })

  it('ingests the image and returns the signed path', async () => {
    const res = await post({ imageUrl: 'https://serpapi-cdn/af1.jpg' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(uploadImageFromUrl).toHaveBeenCalledWith(expect.anything(), 'https://serpapi-cdn/af1.jpg', 'u1')
    expect(json.path).toBe('u1/abc.jpg')
    expect(json.imageUrl).toBe('https://signed/abc.jpg')
  })

  it('returns 502 when ingest fails', async () => {
    uploadImageFromUrl.mockRejectedValueOnce(new Error('fetch 403'))
    expect((await post({ imageUrl: 'https://serpapi-cdn/af1.jpg' })).status).toBe(502)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/app/api/wardrobe/ingest-image/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/wardrobe/ingest-image/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { uploadImageFromUrl } from '@/lib/store-image'
import { signWardrobeImage } from '@/lib/wardrobe-image'
import { isPubliclyFetchable } from '@/lib/ssrf'
import { z } from 'zod'

const Schema = z.object({ imageUrl: z.string().url() })

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Provide an imageUrl' }, { status: 400 })
  if (!isPubliclyFetchable(parsed.data.imageUrl)) {
    return NextResponse.json({ error: 'That URL cannot be fetched' }, { status: 400 })
  }

  try {
    const path = await uploadImageFromUrl(supabase, parsed.data.imageUrl, user.id)
    const imageUrl = await signWardrobeImage(supabase, path, 3600)
    return NextResponse.json({ imageUrl, path })
  } catch (err) {
    console.error('[ingest-image] failed', parsed.data.imageUrl, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not ingest that image' }, { status: 502 })
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/app/api/wardrobe/ingest-image/route.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Run the full suite**

Run: `pnpm --filter web test`
Expected: PASS — all green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/wardrobe/ingest-image/route.ts apps/web/src/app/api/wardrobe/ingest-image/route.test.ts
git commit -m "feat(wardrobe): add ingest-image endpoint for stock thumbnails"
```

---

## Task 5: AddItemForm — save a picked stock thumbnail

**Files:**
- Modify: `apps/web/src/components/wardrobe/AddItemForm.tsx`

No automated test (no React component-test harness — per spec, don't introduce one). Verify via build/lint + manual check.

- [ ] **Step 1: Update the component**

In `apps/web/src/components/wardrobe/AddItemForm.tsx`:

(a) Add `price?` to the `Candidate` type:
```tsx
type Candidate = { url: string; title: string; imageUrl: string | null; retailer: string | null; price?: number }
```

(b) Remove the now-unused user-photo base64 state (Lens needs no variant matching). Delete this state declaration:
```tsx
  const [userPhotoBase64, setUserPhotoBase64] = useState('')
```
and in `processFile`, delete the line:
```tsx
    setUserPhotoBase64(base64)
```
(Keep the `const base64 = await fileToBase64(file)` line and the `/api/wardrobe/process` call that uses it.)

(c) Replace the entire `if (selected.kind === 'stock') { ... }` block inside `handleSave` with the Lens-thumbnail ingest:
```tsx
    if (selected.kind === 'stock') {
      const thumb = selected.candidate.imageUrl
      if (!thumb) {
        setNotice("That match has no image — using your photo instead.")
        setSelected({ kind: 'user' })
        setState('confirming')
        return
      }
      try {
        const res = await fetch('/api/wardrobe/ingest-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: thumb }),
        })
        const data = await res.json()
        if (res.ok && data.path) {
          imageUrl = data.path
          retailer = selected.candidate.retailer ?? undefined
          price = selected.candidate.price
          storeUrl = selected.candidate.url
          // colours stay from Vision tags (Lens returns no colours)
        } else {
          setNotice("Couldn't fetch that product image — using your photo instead.")
          setSelected({ kind: 'user' })
          setState('confirming')
          return
        }
      } catch {
        setNotice("Couldn't fetch that product image — using your photo instead.")
        setSelected({ kind: 'user' })
        setState('confirming')
        return
      }
    }
```

Everything else in `handleSave` (the `let imageUrl = result.processedImageUrl` etc. initialisers, the final `POST /api/wardrobe` with `res.ok` check, the user-photo path) stays as-is.

- [ ] **Step 2: Verify lint + build pass**

Run: `pnpm --filter web build`
Expected: compiles successfully, no TS/ESLint errors (in particular, no "unused `userPhotoBase64`" error — it's fully removed).

- [ ] **Step 3: Run the full suite (no regression)**

Run: `pnpm --filter web test`
Expected: PASS — all green.

- [ ] **Step 4: Manual verification (requires `SERPAPI_API_KEY` set in `apps/web/.env.local`)**

In `pnpm --filter web dev`, on `/wardrobe/add` → Photo tab:
1. Upload a photo of a recognisable item. Expect the spinner, then the confirm screen with a **"Which photo?"** row whose stock tiles now **show real thumbnail images** (not "no img").
2. Pick a stock tile → Save → it ingests that thumbnail and lands in `/wardrobe` showing the stock image (and saves retailer/price).
3. Pick your own photo → Save → stores your photo (unchanged).
4. With no `SERPAPI_API_KEY` (or no matches) → no gallery row, your photo saves — zero regression.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wardrobe/AddItemForm.tsx
git commit -m "feat(add-photo): save picked Lens stock thumbnail via ingest-image"
```

---

## Post-implementation (before merging to prod)

- [ ] Add `SERPAPI_API_KEY` to Vercel (all environments) and `apps/web/.env.local`.
- [ ] Live check: a real photo → gallery tiles show thumbnails → picking one stores the stock image. (SerpAPI + ingest hit live infra the mocked tests can't exercise.)
- [ ] Confirm zero-regression: an add with no matches still saves the user's photo.

## Integration & handoff

- Branch `feature/lens-reverse-image-search` → subagent-driven execution → merge `--no-ff` to master. **Confirm with the user before `git push origin master`** (pushing deploys to Vercel production).
- Verify: `pnpm --filter web test` and `pnpm --filter web build`.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- `lens-search.ts` `searchByImage` (SerpAPI, country=au, top-3 thumbnailed, soft-fail) → Task 2. ✓
- `ProductCandidate` gains `price?` → Task 2. ✓
- `/process` calls `searchByImage(signedPreviewUrl)`, guarded, response shape kept → Task 3. ✓
- `/api/wardrobe/ingest-image` (auth, SSRF via shared guard, uploadImageFromUrl, sign, 502 on fail) → Task 4; shared guard → Task 1. ✓
- AddItemForm: thumbnails render (no layout change), stock-save via ingest-image, `price?`, graceful fallback, user-photo path unchanged → Task 5. ✓
- `SERPAPI_API_KEY` env → Task 2 lib + Post-implementation. ✓
- Testing (lens-search, process, ingest-image, ssrf; UI manual) → Tasks 1–5. ✓

**Placeholder scan:** none — all code shown in full, including the SSRF guard and the component edits.

**Type consistency:** `ProductCandidate` (`url,title,imageUrl,retailer,price?`) is consistent across `lens-search` (returns it), `/process` (returns array of it), and `AddItemForm.Candidate` (mirror + `price?`). `searchByImage(imageUrl: string)` signature matches the `/process` call and the test. `ingest-image` returns `{ imageUrl, path }`, and `AddItemForm` reads `data.path`. `isPubliclyFetchable` signature is identical in Task 1's lib, the `from-link` call site, and the `ingest-image` call site.
