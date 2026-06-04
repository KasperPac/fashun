# Feature C — Photo → Stock Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Photo add flow, after Claude Vision tags the photo, also identify the item, search for it online, and let the user swap their phone snapshot for an official stock image (better virtual try-on quality) — defaulting to the stock image but always allowing the user's own photo.

**Architecture:** One synchronous `POST /api/wardrobe/process` call returns Vision tags **plus** search candidates (via the existing `searchProduct`). The confirm screen shows the user's photo + a 2–3 image stock gallery (best stock pre-selected). On save, a chosen stock image is ingested + enriched by reusing the existing `POST /api/wardrobe/from-link` URL mode (lazy — only the picked item is fetched). Spec: `docs/superpowers/specs/2026-06-04-photo-stock-image-design.md`.

**Tech Stack:** Next.js (non-standard — see `apps/web/AGENTS.md`), TypeScript, `@anthropic-ai/sdk` ^0.100, Vitest, Zod, Supabase, React.

---

## Shared conventions (read before any task)

- **Anthropic conventions** (`lib/tagger.ts`, `lib/product-search.ts` are the references): model `claude-haiku-4-5-20251001`; strip markdown fences before `JSON.parse` where relevant; soft-fallback on any error; validate then map.
- **Vitest mock hoisting:** a mock referenced inside a `vi.mock(...)` factory must be declared with `vi.hoisted(...)` unless its variable is `mock`-prefixed. The Anthropic mock shape is `vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))`.
- **Run the FULL suite** before finishing each task that adds tests: `pnpm --filter web test` (currently 74 green). Per-file runs hide cross-file issues.
- **Build/lint check** for the UI task: `pnpm --filter web build`.
- Run all commands from the repo root `C:\dev\fashun`.
- **Non-standard Next.js**: mirror existing route patterns (`export async function POST(req: Request)` → `NextResponse.json`). Don't invent.
- **Reused as-is (do NOT modify):** `product-fetch-claude.ts`, `product-extractor.ts`, `product-scraper.ts`, `store-image.ts`, `variant-matcher.ts`, `wardrobe-image.ts`. Feature C only composes them via the from-link route.

## File Structure

- **Modify:** `apps/web/src/lib/tagger.ts` — add `searchQuery` to the Vision result (one extra field, same single call).
- **Modify:** `apps/web/src/lib/tagger.test.ts` — cover `searchQuery`.
- **Modify:** `apps/web/src/lib/product-search.ts` — conditional retailer clause so an empty `store` works.
- **Modify:** `apps/web/src/lib/product-search.test.ts` — cover empty-store branch.
- **Modify:** `apps/web/src/app/api/wardrobe/process/route.ts` — call `searchProduct` after tagging; return `searchQuery` + `candidates`.
- **Create:** `apps/web/src/app/api/wardrobe/process/route.test.ts` — new (none exists today).
- **Modify:** `apps/web/src/components/wardrobe/AddItemForm.tsx` — stock-image picker on the confirm screen + stock save via from-link.

---

## Task 1: Add `searchQuery` to the Vision tagger

**Files:**
- Modify: `apps/web/src/lib/tagger.ts`
- Test: `apps/web/src/lib/tagger.test.ts`

- [ ] **Step 1: Add the failing tests**

In `apps/web/src/lib/tagger.test.ts`, add `searchQuery` to the hoisted happy-path fixture's JSON (so it reads):

```ts
      text: JSON.stringify({
        category: 'tops',
        colours: ['#1a1a6e', '#ffffff'],
        styleTags: ['casual', 'smart-casual'],
        suggestedName: 'Navy Linen Shirt',
        searchQuery: 'Uniqlo navy linen shirt',
      }),
```

Then add two tests inside `describe('tagImage', ...)`:

```ts
  it('returns the searchQuery when Claude identifies the item', async () => {
    const result = await tagImage('base64imagedata')
    expect(result.searchQuery).toBe('Uniqlo navy linen shirt')
  })

  it('returns an empty searchQuery when absent or malformed', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ category: 'tops', colours: [], styleTags: [], suggestedName: 'Item' }) }],
    })
    const result = await tagImage('base64imagedata')
    expect(result.searchQuery).toBe('')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test src/lib/tagger.test.ts`
Expected: FAIL — `result.searchQuery` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Implement**

In `apps/web/src/lib/tagger.ts`:

Add `searchQuery` to the interface:
```ts
interface TagResult {
  category: WardrobeCategory
  colours: string[]   // hex codes
  styleTags: string[]
  suggestedName: string
  searchQuery: string  // product search query if identifiable, else ''
}
```

Add it to `FALLBACK`:
```ts
const FALLBACK: TagResult = {
  category: 'tops',
  colours: [],
  styleTags: [],
  suggestedName: 'My item',
  searchQuery: '',
}
```

Extend the prompt — change the JSON block and add a rule. Replace the prompt text block with:
```ts
            text: `Analyse this clothing item image. Return ONLY valid JSON:
{
  "category": "tops|bottoms|shoes|outerwear|bags|accessories",
  "colours": ["#hexcode1", "#hexcode2"],
  "styleTags": ["casual|smart-casual|business|streetwear|minimalist|athleisure|bohemian|glam"],
  "suggestedName": "Short descriptive name e.g. Navy Linen Shirt",
  "searchQuery": "If you can identify the specific product (brand + model), a concise web search query e.g. 'Timberland 6-inch premium boots'. Empty string if you cannot identify it."
}
No markdown, no explanation, just the JSON.`,
```

Add `searchQuery` to the returned object:
```ts
    return {
      category: parsed.category ?? FALLBACK.category,
      colours: Array.isArray(parsed.colours) ? parsed.colours : [],
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags : [],
      suggestedName: parsed.suggestedName ?? FALLBACK.suggestedName,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test src/lib/tagger.test.ts`
Expected: PASS — all tests green (existing two + new two).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/tagger.ts apps/web/src/lib/tagger.test.ts
git commit -m "feat(tagger): identify a product search query from the photo"
```

---

## Task 2: Support an empty `store` in `searchProduct`

**Files:**
- Modify: `apps/web/src/lib/product-search.ts`
- Test: `apps/web/src/lib/product-search.test.ts`

- [ ] **Step 1: Add the failing test**

In `apps/web/src/lib/product-search.test.ts`, add a test that verifies the prompt branches on `store` and still returns candidates when `store` is empty:

```ts
  it('uses a generic retailer clause and still returns candidates when store is empty', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: JSON.stringify([
          { url: 'https://shop.com/p/1', title: 'Timberland 6-inch boots', imageUrl: 'https://shop.com/i.jpg', retailer: 'Timberland' },
        ]) },
      ],
    })
    const out = await searchProduct('Timberland 6-inch premium boots', '')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://shop.com/p/1')
    // the prompt should NOT contain an empty retailer name in quotes
    const sent = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(sent).toContain('from any major Australian retailer')
    expect(sent).not.toContain('retailer ""')
  })

  it('uses the named retailer clause when a store is given', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '[]' }] })
    await searchProduct('white tee', 'THE ICONIC')
    const sent = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(sent).toContain('at the Australian retailer "THE ICONIC"')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test src/lib/product-search.test.ts`
Expected: FAIL — the current prompt always emits `at the Australian retailer "${store}"`, so the empty-store test finds `retailer ""` and lacks the generic clause.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/product-search.ts`, replace the `messages` content. Build the retailer clause conditionally:

```ts
      messages: [{
        role: 'user',
        content: `Find up to 3 specific product pages for "${description}" ${
          store ? `at the Australian retailer "${store}"` : 'from any major Australian retailer'
        }.
After searching, reply with ONLY a JSON array (no markdown):
[{"url":"direct product page url","title":"product name","imageUrl":"image url or null","retailer":"retailer name"}]`,
      }],
```

(Note: the `retailer` example no longer hard-codes `${store}` — the map below already falls back to `store` when the model omits it, which is `''` in photo mode; that's acceptable.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test src/lib/product-search.test.ts`
Expected: PASS — all tests green (existing three + new two).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/product-search.ts apps/web/src/lib/product-search.test.ts
git commit -m "feat(product-search): support storeless search for photo identification"
```

---

## Task 3: `/process` returns search candidates

**Files:**
- Modify: `apps/web/src/app/api/wardrobe/process/route.ts`
- Test: `apps/web/src/app/api/wardrobe/process/route.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/app/api/wardrobe/process/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }))
const mockUpload = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    storage: { from: () => ({ upload: mockUpload }) },
  }),
}))

const tagImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/tagger', () => ({ tagImage }))

const searchProduct = vi.hoisted(() => vi.fn())
vi.mock('@/lib/product-search', () => ({ searchProduct }))

const signWardrobeImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/wardrobe-image', () => ({ signWardrobeImage }))

import { POST } from './route'

const tags = { category: 'shoes', colours: ['#000000'], styleTags: ['casual'], suggestedName: 'Boots', searchQuery: 'Timberland 6-inch boots' }
const candidate = { url: 'https://shop.com/p/1', title: 'Timberland 6-inch boots', imageUrl: 'https://shop.com/i.jpg', retailer: 'Timberland' }
const VALID = { imageBase64: 'x'.repeat(120) }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockUpload.mockResolvedValue({ error: null })
  tagImage.mockResolvedValue(tags)
  searchProduct.mockResolvedValue([candidate])
  signWardrobeImage.mockResolvedValue('https://signed/preview.jpg')
})

function post(body: unknown) {
  return POST(new Request('http://localhost/api/wardrobe/process', { method: 'POST', body: JSON.stringify(body) }))
}

describe('POST /api/wardrobe/process', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await post(VALID)).status).toBe(401)
  })

  it('returns 400 for an invalid image', async () => {
    expect((await post({ imageBase64: 'short' })).status).toBe(400)
  })

  it('returns tags, a signed preview, searchQuery and candidates', async () => {
    const res = await post(VALID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(searchProduct).toHaveBeenCalledWith('Timberland 6-inch boots', '')
    expect(json.processedImageUrl).toBe('https://signed/preview.jpg')
    expect(json.category).toBe('shoes')
    expect(json.searchQuery).toBe('Timberland 6-inch boots')
    expect(json.candidates).toHaveLength(1)
    expect(json.candidates[0].url).toBe('https://shop.com/p/1')
  })

  it('does not search and returns no candidates when searchQuery is empty', async () => {
    tagImage.mockResolvedValueOnce({ ...tags, searchQuery: '' })
    const res = await post(VALID)
    const json = await res.json()
    expect(searchProduct).not.toHaveBeenCalled()
    expect(json.candidates).toEqual([])
  })

  it('still returns 200 with no candidates when searchProduct throws', async () => {
    searchProduct.mockRejectedValueOnce(new Error('boom'))
    const res = await post(VALID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.candidates).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test src/app/api/wardrobe/process/route.test.ts`
Expected: FAIL — the route doesn't import/call `searchProduct` and the response has no `searchQuery`/`candidates`.

- [ ] **Step 3: Implement the route change**

In `apps/web/src/app/api/wardrobe/process/route.ts`:

Add the import after the `tagImage` import:
```ts
import { searchProduct } from '@/lib/product-search'
import type { ProductCandidate } from '@/lib/product-search'
```

After the `processedImageUrl` line and before the final `return`, add the search step:
```ts
  // 4. If Vision identified the item, find candidate stock images (soft-fail to []).
  let candidates: ProductCandidate[] = []
  if (tags.searchQuery) {
    try {
      candidates = await searchProduct(tags.searchQuery, '')
    } catch {
      candidates = []
    }
  }
```

Extend the final response to include `searchQuery` and `candidates`:
```ts
  return NextResponse.json({
    processedImageUrl,
    category: tags.category,
    colours: tags.colours,
    styleTags: tags.styleTags,
    suggestedName: tags.suggestedName,
    searchQuery: tags.searchQuery,
    candidates,
  })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test src/app/api/wardrobe/process/route.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Run the FULL suite**

Run: `pnpm --filter web test`
Expected: PASS — all green (74 prior + new tests from Tasks 1–3).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/wardrobe/process/route.ts apps/web/src/app/api/wardrobe/process/route.test.ts
git commit -m "feat(process): return stock-image search candidates for the photo"
```

---

## Task 4: Stock-image picker on the confirm screen

**Files:**
- Modify: `apps/web/src/components/wardrobe/AddItemForm.tsx`

No automated test — the repo has no React component-test harness, and per the spec we do not introduce one for v1. Verification is the build/lint plus a manual check.

- [ ] **Step 1: Replace the component with the stock-picker version**

Replace the entire contents of `apps/web/src/components/wardrobe/AddItemForm.tsx` with:

```tsx
'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WardrobeCategory } from '@fashun/shared'

type Candidate = { url: string; title: string; imageUrl: string | null; retailer: string | null }

type ProcessResult = {
  processedImageUrl: string
  category: WardrobeCategory
  colours: string[]
  styleTags: string[]
  suggestedName: string
  searchQuery: string
  candidates: Candidate[]
}

type Selected = { kind: 'user' } | { kind: 'stock'; candidate: Candidate }

export default function AddItemForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'processing' | 'confirming' | 'saving'>('idle')
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [userPhotoBase64, setUserPhotoBase64] = useState('')
  const [selected, setSelected] = useState<Selected>({ kind: 'user' })
  const [name, setName] = useState('')
  const [category, setCategory] = useState<WardrobeCategory>('tops')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function processFile(file: File) {
    setState('processing')
    setError('')
    setNotice('')
    const base64 = await fileToBase64(file)
    setUserPhotoBase64(base64)
    const res = await fetch('/api/wardrobe/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Processing failed'); setState('idle'); return }
    const r = data as ProcessResult
    setResult(r)
    setName(r.suggestedName)
    setCategory(r.category)
    // Default to the best stock image when one was found; otherwise the user's photo.
    setSelected(r.candidates.length ? { kind: 'stock', candidate: r.candidates[0] } : { kind: 'user' })
    setState('confirming')
  }

  async function handleSave() {
    if (!result) return
    setState('saving')
    setError('')

    let imageUrl = result.processedImageUrl
    let colours = result.colours
    let price: number | undefined
    let retailer: string | undefined
    let storeUrl: string | undefined

    if (selected.kind === 'stock') {
      try {
        const res = await fetch('/api/wardrobe/from-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: selected.candidate.url, itemPhotoBase64: userPhotoBase64 }),
        })
        const data = await res.json()
        if (res.ok && data.mode === 'confirm' && data.product?.processedImageUrl) {
          imageUrl = data.product.processedImageUrl
          colours = data.product.colours
          price = data.product.price ?? undefined
          retailer = data.product.retailer ?? undefined
          storeUrl = selected.candidate.url
        } else {
          // Graceful fallback: the product image couldn't be fetched — use the user's photo.
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

    try {
      await fetch('/api/wardrobe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category, colours, styleTags: result.styleTags, imageUrl,
          ownership: 'owned', price, retailer, storeUrl,
        }),
      })
      router.push('/wardrobe')
    } catch {
      setError('Could not save the item — please try again.')
      setState('confirming')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  if (state === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">Tagging and finding your item…</p>
      </div>
    )
  }

  if ((state === 'confirming' || state === 'saving') && result) {
    const previewUrl = selected.kind === 'stock' ? (selected.candidate.imageUrl ?? result.processedImageUrl) : result.processedImageUrl
    return (
      <div className="flex flex-col gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt={name} className="w-40 h-52 object-contain mx-auto bg-zinc-900 rounded-xl" />

        {result.candidates.length > 0 && (
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-widest mb-2 block">Which photo?</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelected({ kind: 'user' })}
                className={`shrink-0 rounded-xl p-1 border-2 ${selected.kind === 'user' ? 'border-purple-500' : 'border-zinc-800'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.processedImageUrl} alt="Your photo" className="w-16 h-20 object-contain bg-zinc-900 rounded-lg" />
                <span className="block text-[10px] text-zinc-400 mt-1">Your photo</span>
              </button>
              {result.candidates.map((c) => (
                <button
                  key={c.url}
                  type="button"
                  onClick={() => setSelected({ kind: 'stock', candidate: c })}
                  className={`shrink-0 rounded-xl p-1 border-2 ${selected.kind === 'stock' && selected.candidate.url === c.url ? 'border-purple-500' : 'border-zinc-800'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.imageUrl
                    ? <img src={c.imageUrl} alt={c.title} className="w-16 h-20 object-contain bg-zinc-900 rounded-lg" />
                    : <div className="w-16 h-20 bg-zinc-900 rounded-lg flex items-center justify-center text-zinc-600 text-xs">no img</div>}
                  <span className="block text-[10px] text-zinc-400 mt-1 truncate w-16">{c.retailer ?? 'Stock'}</span>
                </button>
              ))}
            </div>
            <p className="text-zinc-600 text-[11px] mt-1">Official product photos usually look better in try-on.</p>
          </div>
        )}

        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as WardrobeCategory)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
          >
            {['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories'].map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        {notice && <p className="text-amber-400 text-sm">{notice}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2 mt-2">
          <button onClick={() => setState('idle')} className="flex-1 bg-zinc-900 text-zinc-400 rounded-xl py-3 font-bold hover:bg-zinc-800">
            ← Redo
          </button>
          <button
            onClick={handleSave}
            disabled={state === 'saving'}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50"
          >
            {state === 'saving' ? 'Saving…' : '✓ Save to Wardrobe'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-zinc-700 rounded-2xl h-52 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-purple-500 transition-colors"
      >
        <span className="text-4xl">📂</span>
        <span className="text-zinc-400 text-sm font-semibold">Drop photo here or click to browse</span>
        <span className="text-zinc-600 text-xs">JPG or PNG — works best on a neutral background</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  })
}
```

- [ ] **Step 2: Verify lint + build pass**

Run: `pnpm --filter web build`
Expected: compiles successfully, no type errors, no ESLint errors.

- [ ] **Step 3: Run the FULL suite (ensure no regression)**

Run: `pnpm --filter web test`
Expected: PASS — all green (the component change doesn't touch tested modules).

- [ ] **Step 4: Manual verification (document the result; do not skip)**

In `pnpm --filter web dev`, on `/wardrobe/add` → Photo tab:
1. Upload a photo of a recognisable branded item (e.g. well-known sneakers). Expect the spinner "Tagging and finding your item…", then the confirm screen with a **"Which photo?"** row: your photo tile + 1–3 stock tiles, a **stock tile pre-selected** (purple ring), and the large preview showing the selected image.
2. Tap your own photo tile → ring moves, preview switches to your photo. Save → lands in `/wardrobe` with your photo.
3. Re-add, keep a stock tile selected → Save → the from-link fetch runs, then it lands in `/wardrobe` with the official image (and price/retailer saved).
4. Upload a plain/unbranded item (Vision likely returns empty `searchQuery`) → **no "Which photo?" row**, screen behaves exactly as before. Save works.
5. (If reproducible) a stock pick whose page can't be fetched → amber notice "Couldn't fetch that product image — using your photo instead." and selection flips to your photo; Save then stores your photo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wardrobe/AddItemForm.tsx
git commit -m "feat(add-photo): offer official stock images as a try-on-quality alternative"
```

---

## Post-implementation verification (before merging to prod)

- [ ] Confirm the end-to-end Photo→stock flow against a real branded item in `dev` (Task 4 manual steps), since the search + from-link calls hit live Anthropic/retailer infra that the mocked tests can't exercise.
- [ ] Spot-check that an unbranded item still adds cleanly with the user's own photo (zero regression).

## Integration & handoff

- Per the team workflow: this branch (`feature/photo-stock-image`) → subagent-driven execution → merge `--no-ff` to master. **Confirm with the user before `git push origin master`** (pushing triggers the Vercel production deploy).
- Verify: `pnpm --filter web test` and `pnpm --filter web build`.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Decision 1 (auto every add) → Task 3 always calls `searchProduct` when `searchQuery` present, no gating. ✓
- Decision 2 (stock pre-selected) → Task 4 `processFile` defaults `selected` to the first candidate. ✓
- Decision 3 (gallery 2–3) → Task 4 renders one tile per candidate (`searchProduct` returns up to 3). ✓
- Decision 4 (extend Vision call) → Task 1 adds `searchQuery` to `tagImage`, no second call. ✓
- Decision 5 (one synchronous step) → Task 3 does Vision + search in one `/process` response. ✓
- Decision 6 (reuse from-link on selection) → Task 4 `handleSave` calls `/api/wardrobe/from-link` only for a stock pick. ✓
- Error handling (no query/no candidates; search throws; stock fetch fails) → Tasks 3 (empty-query + throw tests) and 4 (graceful notice + fallback to user photo). ✓
- Empty-store search → Task 2. ✓
- Testing section (tagger, product-search, process route; UI manual) → Tasks 1–4. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — all code shown in full, including the complete component.

**Type consistency:** `Candidate`/`ProductCandidate` fields (`url, title, imageUrl, retailer`) match `product-search.ts`. `ProcessResult` fields match the Task 3 response (`processedImageUrl, category, colours, styleTags, suggestedName, searchQuery, candidates`). `tagImage`'s new `searchQuery: string` (Task 1) is the field Task 3 reads. The from-link `confirm` payload fields read in Task 4 (`product.processedImageUrl, product.colours, product.price, product.retailer`) match the shape returned by `apps/web/src/app/api/wardrobe/from-link/route.ts`.
