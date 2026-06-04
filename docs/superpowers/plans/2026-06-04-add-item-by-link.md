# Add Item by Store Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add a wardrobe item from a store URL (or a description + store name), pulling the product name, category, colour, price, retailer, and photo from online, with an optional snap of the actual item to auto-pick the right colour variant.

**Architecture:** A new `POST /api/wardrobe/from-link` route orchestrates small, single-purpose libs: a deterministic page scraper (Open Graph + JSON-LD), a Claude-based normaliser, an image uploader, a Claude-Vision variant matcher, and a Claude web-search fallback. The route returns a confirm payload that reuses the existing `POST /api/wardrobe` save path. A new `🔗 Link` tab on the Add Item page drives it. **Photoroom is skipped** — the product image is stored as-is (matches the existing photo flow, where Photoroom is already disabled).

**Tech Stack:** Next.js 16 App Router route handlers, TypeScript ~5.4, `@anthropic-ai/sdk` ^0.100, Supabase SSR + Storage (`wardrobe-images` bucket), Zod, Vitest.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/lib/product-scraper.ts` | Fetch a product page, deterministically extract og tags + Product JSON-LD + a text snippet |
| `apps/web/src/lib/product-extractor.ts` | Claude normalises scraped data → name, category, colour variants, style tags, colours |
| `apps/web/src/lib/store-image.ts` | Fetch a product image URL and upload it to the `wardrobe-images` bucket |
| `apps/web/src/lib/variant-matcher.ts` | Claude Vision picks the colour variant closest to the user's photo |
| `apps/web/src/lib/product-search.ts` | Claude web-search fallback → candidate product pages from a description |
| `apps/web/src/app/api/wardrobe/from-link/route.ts` | Orchestrates URL mode + search mode; returns confirm payload / candidates / manual |
| `apps/web/src/components/wardrobe/AddByLinkForm.tsx` | The `🔗 Link` tab UI: inputs, confirm card, candidate list, manual fallback |
| `apps/web/src/components/wardrobe/ColourVariantPicker.tsx` | Variant chip selector |
| `apps/web/src/app/(app)/wardrobe/add/page.tsx` | Add the `📸 Photo` / `🔗 Link` method toggle |

Each lib is independently unit-testable with mocked `fetch` / Anthropic. The route is tested with the libs mocked.

**Verify command (used throughout):** run from the repo root —
`pnpm --filter web test <test-file-path>`

---

### Task 1: Product page scraper (`lib/product-scraper.ts`)

Deterministic extraction — no AI. Pulls Open Graph meta, the first `Product` JSON-LD block, and a trimmed text snippet for the Claude step that follows.

**Files:**
- Create: `apps/web/src/lib/product-scraper.ts`
- Test: `apps/web/src/lib/product-scraper.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/product-scraper.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scrapeProductPage } from './product-scraper'

const HTML = `<!doctype html><html><head>
<title>Fallback Title</title>
<meta property="og:title" content="Rust Linen Shirt" />
<meta property="og:image" content="https://cdn.shop.com/shirt.jpg" />
<meta property="og:site_name" content="THE ICONIC" />
<meta property="product:price:amount" content="89.95" />
<script type="application/ld+json">
{"@type":"Product","name":"Rust Linen Shirt","color":"Rust","offers":{"price":"89.95"}}
</script>
</head><body><p>A breathable warm-weather shirt.</p><script>ignored()</script></body></html>`

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(HTML),
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('scrapeProductPage', () => {
  it('extracts og tags', async () => {
    const page = await scrapeProductPage('https://shop.com/p/1')
    expect(page.title).toBe('Rust Linen Shirt')
    expect(page.imageUrl).toBe('https://cdn.shop.com/shirt.jpg')
    expect(page.retailer).toBe('THE ICONIC')
    expect(page.price).toBe(89.95)
  })

  it('parses the first Product JSON-LD block', async () => {
    const page = await scrapeProductPage('https://shop.com/p/1')
    expect(page.jsonLd).toMatchObject({ '@type': 'Product', color: 'Rust' })
  })

  it('includes a tag-stripped text snippet without script contents', async () => {
    const page = await scrapeProductPage('https://shop.com/p/1')
    expect(page.textSnippet).toContain('breathable warm-weather shirt')
    expect(page.textSnippet).not.toContain('ignored()')
  })

  it('falls back to <title> when og:title is absent', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, text: () => Promise.resolve('<title>Only Title</title>'),
    })
    const page = await scrapeProductPage('https://shop.com/p/2')
    expect(page.title).toBe('Only Title')
  })

  it('throws when the response is not ok', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 403 })
    await expect(scrapeProductPage('https://shop.com/blocked')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/product-scraper.test.ts`
Expected: FAIL — "Cannot find module './product-scraper'"

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/product-scraper.ts`:

```typescript
export interface ScrapedPage {
  url: string
  title: string | null
  imageUrl: string | null
  price: number | null
  retailer: string | null
  jsonLd: Record<string, unknown> | null
  textSnippet: string
}

function metaContent(html: string, property: string): string | null {
  // Matches <meta property="og:x" content="..."> in either attribute order.
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']` +
    `|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    'i',
  )
  const m = html.match(re)
  return m ? (m[1] ?? m[2] ?? null) : null
}

function firstProductJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim())
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] ?? [])]
      for (const node of nodes) {
        const type = node?.['@type']
        if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
          return node as Record<string, unknown>
        }
      }
    } catch {
      // skip malformed JSON-LD blocks
    }
  }
  return null
}

function textSnippet(html: string, limit = 4000): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return body.slice(0, limit)
}

export async function scrapeProductPage(url: string): Promise<ScrapedPage> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      Accept: 'text/html',
    },
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const html = await res.text()

  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null
  const priceRaw = metaContent(html, 'product:price:amount') ?? metaContent(html, 'og:price:amount')
  const price = priceRaw ? Number.parseFloat(priceRaw) : null

  return {
    url,
    title: metaContent(html, 'og:title') ?? titleTag,
    imageUrl: metaContent(html, 'og:image'),
    price: Number.isFinite(price as number) ? price : null,
    retailer: metaContent(html, 'og:site_name'),
    jsonLd: firstProductJsonLd(html),
    textSnippet: textSnippet(html),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/lib/product-scraper.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/product-scraper.ts apps/web/src/lib/product-scraper.test.ts
git commit -m "feat: product page scraper (og tags + JSON-LD)"
```

---

### Task 2: Product normaliser (`lib/product-extractor.ts`)

Turns a `ScrapedPage` into clean wardrobe fields using Claude (text). Deterministic page data (image/price/retailer) is passed through; Claude supplies name, category, colour variants, style tags, and fallback colours.

**Files:**
- Create: `apps/web/src/lib/product-extractor.ts`
- Test: `apps/web/src/lib/product-extractor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/product-extractor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } },
}))

import { extractProduct } from './product-extractor'
import type { ScrapedPage } from './product-scraper'

const page: ScrapedPage = {
  url: 'https://shop.com/p/1',
  title: 'Rust Linen Shirt',
  imageUrl: 'https://cdn.shop.com/shirt.jpg',
  price: 89.95,
  retailer: 'THE ICONIC',
  jsonLd: { '@type': 'Product', color: 'Rust' },
  textSnippet: 'A breathable warm-weather shirt available in rust and olive.',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      name: 'Rust Linen Shirt',
      category: 'tops',
      styleTags: ['smart-casual'],
      colourVariants: [{ label: 'Rust', hex: '#B7410E' }, { label: 'Olive', hex: '#556B2F' }],
      colours: ['#B7410E'],
    }) }],
  })
})

describe('extractProduct', () => {
  it('returns normalised product fields and passes through page image/price/retailer', async () => {
    const p = await extractProduct(page)
    expect(p.name).toBe('Rust Linen Shirt')
    expect(p.category).toBe('tops')
    expect(p.colourVariants).toHaveLength(2)
    expect(p.imageUrl).toBe('https://cdn.shop.com/shirt.jpg')
    expect(p.price).toBe(89.95)
    expect(p.retailer).toBe('THE ICONIC')
  })

  it('falls back to page title and empty variants when Claude output is unparseable', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json {{' }] })
    const p = await extractProduct(page)
    expect(p.name).toBe('Rust Linen Shirt')
    expect(p.category).toBe('tops')
    expect(p.colourVariants).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/product-extractor.test.ts`
Expected: FAIL — "Cannot find module './product-extractor'"

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/product-extractor.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { WardrobeCategory } from '@fashun/shared'
import type { ScrapedPage } from './product-scraper'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ColourVariant {
  label: string
  hex: string
}

export interface ExtractedProduct {
  name: string
  category: WardrobeCategory
  retailer: string | null
  imageUrl: string | null
  price: number | null
  styleTags: string[]
  colourVariants: ColourVariant[]
  colours: string[]
}

const CATEGORIES: WardrobeCategory[] = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']
const HEX = /^#[0-9a-fA-F]{6}$/

export async function extractProduct(page: ScrapedPage): Promise<ExtractedProduct> {
  const fallback: ExtractedProduct = {
    name: page.title ?? 'My item',
    category: 'tops',
    retailer: page.retailer,
    imageUrl: page.imageUrl,
    price: page.price,
    styleTags: [],
    colourVariants: [],
    colours: [],
  }

  const prompt = `You are normalising a clothing product page into structured data.

Title: ${page.title ?? '(none)'}
Retailer: ${page.retailer ?? '(unknown)'}
Product JSON-LD: ${page.jsonLd ? JSON.stringify(page.jsonLd).slice(0, 1500) : '(none)'}
Page text: ${page.textSnippet}

Return ONLY valid JSON (no markdown):
{
  "name": "Short descriptive name e.g. Rust Linen Shirt",
  "category": "tops|bottoms|shoes|outerwear|bags|accessories",
  "styleTags": ["casual|smart-casual|business|streetwear|minimalist|athleisure|bohemian|glam"],
  "colourVariants": [{"label": "named colour shown on the page", "hex": "#rrggbb"}],
  "colours": ["#rrggbb"]
}
Rules:
- colourVariants: only colours the page actually offers. Empty array if none are listed.
- colours: 1-2 dominant hex codes for the pictured item (best guess if no variants).
- hex values must be 6-digit #rrggbb.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = message.content[0]
    if (content.type !== 'text') return fallback
    const raw = content.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(raw)

    const category: WardrobeCategory = CATEGORIES.includes(parsed.category) ? parsed.category : 'tops'
    const colourVariants: ColourVariant[] = Array.isArray(parsed.colourVariants)
      ? parsed.colourVariants
          .filter((v: ColourVariant) => v && typeof v.label === 'string' && HEX.test(v.hex))
          .map((v: ColourVariant) => ({ label: v.label, hex: v.hex }))
      : []
    const colours: string[] = Array.isArray(parsed.colours)
      ? parsed.colours.filter((c: string) => HEX.test(c))
      : []

    return {
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : fallback.name,
      category,
      retailer: page.retailer,
      imageUrl: page.imageUrl,
      price: page.price,
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags : [],
      colourVariants,
      colours,
    }
  } catch {
    return fallback
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/lib/product-extractor.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/product-extractor.ts apps/web/src/lib/product-extractor.test.ts
git commit -m "feat: Claude product normaliser for store links"
```

---

### Task 3: Store image uploader (`lib/store-image.ts`)

Fetches the product image URL and uploads it to the existing `wardrobe-images` bucket, returning a public URL — same destination the photo flow uses.

**Files:**
- Create: `apps/web/src/lib/store-image.ts`
- Test: `apps/web/src/lib/store-image.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/store-image.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadImageFromUrl } from './store-image'

const upload = vi.fn().mockResolvedValue({ error: null })
const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://supa.co/wardrobe/u1/x.jpg' } })
const supabase = { storage: { from: () => ({ upload, getPublicUrl }) } } as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('uploadImageFromUrl', () => {
  it('uploads the fetched image and returns the public URL', async () => {
    const url = await uploadImageFromUrl(supabase, 'https://cdn.shop.com/shirt.jpg', 'u1')
    expect(upload).toHaveBeenCalled()
    expect(url).toBe('https://supa.co/wardrobe/u1/x.jpg')
  })

  it('throws when the image fetch fails', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 404 })
    await expect(uploadImageFromUrl(supabase, 'https://cdn.shop.com/missing.jpg', 'u1')).rejects.toThrow()
  })

  it('throws when storage upload errors', async () => {
    upload.mockResolvedValueOnce({ error: { message: 'nope' } })
    await expect(uploadImageFromUrl(supabase, 'https://cdn.shop.com/shirt.jpg', 'u1')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/store-image.test.ts`
Expected: FAIL — "Cannot find module './store-image'"

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/store-image.ts`:

```typescript
import { randomUUID } from 'crypto'
import type { createServerClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

/** Fetches an image by URL and uploads it to the wardrobe-images bucket. Returns the public URL. */
export async function uploadImageFromUrl(
  supabase: ServerClient,
  imageUrl: string,
  userId: string,
): Promise<string> {
  const res = await fetch(imageUrl, { headers: { Accept: 'image/*' } })
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`)

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const bytes = Buffer.from(await res.arrayBuffer())
  const filename = `${userId}/${randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('wardrobe-images')
    .upload(filename, bytes, { contentType, upsert: false })
  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data } = supabase.storage.from('wardrobe-images').getPublicUrl(filename)
  return data.publicUrl
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/lib/store-image.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/store-image.ts apps/web/src/lib/store-image.test.ts
git commit -m "feat: upload store product image to wardrobe bucket"
```

---

### Task 4: from-link route — URL mode (`api/wardrobe/from-link/route.ts`)

The orchestration route. This task implements **URL mode only** (the reliable path). Variant photo-matching (Task 5) and search mode (Task 6) extend it.

**Files:**
- Create: `apps/web/src/app/api/wardrobe/from-link/route.ts`
- Test: `apps/web/src/app/api/wardrobe/from-link/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/wardrobe/from-link/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } })
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

const scrapeProductPage = vi.fn()
vi.mock('@/lib/product-scraper', () => ({ scrapeProductPage }))

const extractProduct = vi.fn()
vi.mock('@/lib/product-extractor', () => ({ extractProduct }))

const uploadImageFromUrl = vi.fn()
vi.mock('@/lib/store-image', () => ({ uploadImageFromUrl }))

import { POST } from './route'

const extracted = {
  name: 'Rust Linen Shirt', category: 'tops', retailer: 'THE ICONIC',
  imageUrl: 'https://cdn.shop.com/shirt.jpg', price: 89.95, styleTags: ['smart-casual'],
  colourVariants: [{ label: 'Rust', hex: '#B7410E' }, { label: 'Olive', hex: '#556B2F' }],
  colours: ['#B7410E'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  scrapeProductPage.mockResolvedValue({ url: 'https://shop.com/p/1', imageUrl: extracted.imageUrl })
  extractProduct.mockResolvedValue(extracted)
  uploadImageFromUrl.mockResolvedValue('https://supa.co/wardrobe/u1/x.jpg')
})

function post(body: unknown) {
  return POST(new Request('http://localhost/api/wardrobe/from-link', {
    method: 'POST', body: JSON.stringify(body),
  }))
}

describe('POST /api/wardrobe/from-link (URL mode)', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await post({ url: 'https://shop.com/p/1' })).status).toBe(401)
  })

  it('returns 400 when neither url nor description provided', async () => {
    expect((await post({})).status).toBe(400)
  })

  it('returns a confirm payload for a valid url', async () => {
    const res = await post({ url: 'https://shop.com/p/1' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mode).toBe('confirm')
    expect(json.product.suggestedName).toBe('Rust Linen Shirt')
    expect(json.product.processedImageUrl).toBe('https://supa.co/wardrobe/u1/x.jpg')
    expect(json.product.storeUrl).toBe('https://shop.com/p/1')
    expect(json.product.colourVariants).toHaveLength(2)
    expect(json.product.colours).toEqual(['#B7410E']) // first variant default, no photo
  })

  it('returns mode manual when scraping throws', async () => {
    scrapeProductPage.mockRejectedValueOnce(new Error('403'))
    const res = await post({ url: 'https://shop.com/blocked' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mode).toBe('manual')
    expect(json.storeUrl).toBe('https://shop.com/blocked')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/app/api/wardrobe/from-link/route.test.ts`
Expected: FAIL — "Cannot find module './route'"

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/app/api/wardrobe/from-link/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { scrapeProductPage } from '@/lib/product-scraper'
import { extractProduct } from '@/lib/product-extractor'
import { uploadImageFromUrl } from '@/lib/store-image'
import { z } from 'zod'

const Schema = z.object({
  url: z.string().url().optional(),
  itemPhotoBase64: z.string().optional(),
  description: z.string().min(2).optional(),
  store: z.string().min(1).optional(),
})

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = Schema.safeParse(body)
  if (!parsed.success || (!parsed.data.url && !parsed.data.description)) {
    return NextResponse.json({ error: 'Provide a url or a description' }, { status: 400 })
  }

  // URL mode
  if (parsed.data.url) {
    const url = parsed.data.url
    try {
      const page = await scrapeProductPage(url)
      const product = await extractProduct(page)

      let processedImageUrl: string | null = null
      if (product.imageUrl) {
        try {
          processedImageUrl = await uploadImageFromUrl(supabase, product.imageUrl, user.id)
        } catch {
          processedImageUrl = null
        }
      }

      // Colour resolution (variant photo-matching added in Task 5)
      const colours = product.colourVariants.length
        ? [product.colourVariants[0].hex]
        : product.colours

      return NextResponse.json({
        mode: 'confirm',
        product: {
          suggestedName: product.name,
          category: product.category,
          colours,
          colourVariants: product.colourVariants,
          styleTags: product.styleTags,
          processedImageUrl,
          storeUrl: url,
          price: product.price,
          retailer: product.retailer,
        },
      })
    } catch {
      return NextResponse.json({ mode: 'manual', storeUrl: url, reason: 'Could not read that page' })
    }
  }

  // Search mode — implemented in Task 6
  return NextResponse.json({ error: 'Search mode not yet available' }, { status: 400 })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/app/api/wardrobe/from-link/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/wardrobe/from-link/route.ts apps/web/src/app/api/wardrobe/from-link/route.test.ts
git commit -m "feat: from-link route URL mode — scrape, extract, upload, confirm payload"
```

---

### Task 5: Variant photo-matching (`lib/variant-matcher.ts` + route wiring)

When the page lists colour variants **and** the user attached a photo of their item, Claude Vision picks the closest variant.

**Files:**
- Create: `apps/web/src/lib/variant-matcher.ts`
- Test: `apps/web/src/lib/variant-matcher.test.ts`
- Modify: `apps/web/src/app/api/wardrobe/from-link/route.ts`
- Modify: `apps/web/src/app/api/wardrobe/from-link/route.test.ts`

- [ ] **Step 1: Write the failing test for the matcher**

Create `apps/web/src/lib/variant-matcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))

import { matchVariantToPhoto } from './variant-matcher'

const variants = [{ label: 'Rust', hex: '#B7410E' }, { label: 'Olive', hex: '#556B2F' }]

beforeEach(() => vi.clearAllMocks())

describe('matchVariantToPhoto', () => {
  it('returns the variant whose label Claude selects', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"label":"Olive"}' }] })
    const match = await matchVariantToPhoto(variants, 'BASE64DATA')
    expect(match?.label).toBe('Olive')
  })

  it('returns null when the label does not match any variant', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"label":"Pink"}' }] })
    expect(await matchVariantToPhoto(variants, 'BASE64DATA')).toBeNull()
  })

  it('returns null on Claude error', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    expect(await matchVariantToPhoto(variants, 'BASE64DATA')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/variant-matcher.test.ts`
Expected: FAIL — "Cannot find module './variant-matcher'"

- [ ] **Step 3: Write the matcher**

Create `apps/web/src/lib/variant-matcher.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { ColourVariant } from './product-extractor'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Picks the variant whose colour best matches the user's photo, or null if undecidable. */
export async function matchVariantToPhoto(
  variants: ColourVariant[],
  photoBase64: string,
): Promise<ColourVariant | null> {
  if (variants.length === 0) return null
  const labels = variants.map(v => `${v.label} (${v.hex})`).join(', ')
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 } },
          {
            type: 'text',
            text: `Which of these colour options best matches the item in the photo? Options: ${labels}.
Return ONLY JSON: {"label":"exact option label"}`,
          },
        ],
      }],
    })
    const content = message.content[0]
    if (content.type !== 'text') return null
    const raw = content.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const { label } = JSON.parse(raw)
    return variants.find(v => v.label === label) ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the matcher test to verify it passes**

Run: `pnpm --filter web test src/lib/variant-matcher.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add a failing route test for photo-driven selection**

Add this mock near the other route mocks in `apps/web/src/app/api/wardrobe/from-link/route.test.ts` (top of file, after the `store-image` mock):

```typescript
const matchVariantToPhoto = vi.fn()
vi.mock('@/lib/variant-matcher', () => ({ matchVariantToPhoto }))
```

Add to the `beforeEach` body:

```typescript
  matchVariantToPhoto.mockResolvedValue(null)
```

Add this test inside the `describe` block:

```typescript
  it('uses the photo-matched variant colour when a photo is attached', async () => {
    matchVariantToPhoto.mockResolvedValueOnce({ label: 'Olive', hex: '#556B2F' })
    const res = await post({ url: 'https://shop.com/p/1', itemPhotoBase64: 'BASE64DATA' })
    const json = await res.json()
    expect(matchVariantToPhoto).toHaveBeenCalled()
    expect(json.product.colours).toEqual(['#556B2F'])
  })
```

- [ ] **Step 6: Run the route test to verify the new case fails**

Run: `pnpm --filter web test src/app/api/wardrobe/from-link/route.test.ts`
Expected: FAIL — `colours` is `['#B7410E']`, photo path not wired

- [ ] **Step 7: Wire the matcher into the route**

In `apps/web/src/app/api/wardrobe/from-link/route.ts`, add the import:

```typescript
import { matchVariantToPhoto } from '@/lib/variant-matcher'
```

Replace the colour-resolution block:

```typescript
      // Colour resolution (variant photo-matching added in Task 5)
      const colours = product.colourVariants.length
        ? [product.colourVariants[0].hex]
        : product.colours
```

with:

```typescript
      // Colour resolution: photo-match a variant if a photo was given, else first variant, else extracted
      let colours: string[]
      if (product.colourVariants.length && parsed.data.itemPhotoBase64) {
        const matched = await matchVariantToPhoto(product.colourVariants, parsed.data.itemPhotoBase64)
        colours = [(matched ?? product.colourVariants[0]).hex]
      } else if (product.colourVariants.length) {
        colours = [product.colourVariants[0].hex]
      } else {
        colours = product.colours
      }
```

- [ ] **Step 8: Run the route test to verify it passes**

Run: `pnpm --filter web test src/app/api/wardrobe/from-link/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/variant-matcher.ts apps/web/src/lib/variant-matcher.test.ts apps/web/src/app/api/wardrobe/from-link/route.ts apps/web/src/app/api/wardrobe/from-link/route.test.ts
git commit -m "feat: photo-driven colour variant matching in from-link"
```

---

### Task 6: Search fallback (`lib/product-search.ts` + route wiring)

When the user has no link, they give a description + store; Claude's web-search tool returns candidate product pages to confirm.

**Files:**
- Create: `apps/web/src/lib/product-search.ts`
- Test: `apps/web/src/lib/product-search.test.ts`
- Modify: `apps/web/src/app/api/wardrobe/from-link/route.ts`
- Modify: `apps/web/src/app/api/wardrobe/from-link/route.test.ts`

- [ ] **Step 1: Write the failing test for search**

Create `apps/web/src/lib/product-search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))

import { searchProduct } from './product-search'

beforeEach(() => vi.clearAllMocks())

describe('searchProduct', () => {
  it('parses candidate products from the final text block', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'Here are some options:' },
        { type: 'text', text: JSON.stringify([
          { url: 'https://theiconic.com.au/p/1', title: 'Black Nike Pegasus', imageUrl: null, retailer: 'THE ICONIC' },
        ]) },
      ],
    })
    const out = await searchProduct('black Nike running shoes', 'THE ICONIC')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://theiconic.com.au/p/1')
  })

  it('returns an empty array on error or unparseable output', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    expect(await searchProduct('x', 'y')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/product-search.test.ts`
Expected: FAIL — "Cannot find module './product-search'"

- [ ] **Step 3: Write the search lib**

Create `apps/web/src/lib/product-search.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ProductCandidate {
  url: string
  title: string
  imageUrl: string | null
  retailer: string | null
}

/** Uses Claude's server-side web search to find candidate product pages. Returns [] on failure. */
export async function searchProduct(description: string, store: string): Promise<ProductCandidate[]> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as never],
      messages: [{
        role: 'user',
        content: `Find up to 3 specific product pages for "${description}" at the Australian retailer "${store}".
After searching, reply with ONLY a JSON array (no markdown):
[{"url":"direct product page url","title":"product name","imageUrl":"image url or null","retailer":"${store}"}]`,
      }],
    })

    // Use the last text block as the answer (tool-use blocks precede it).
    const texts = message.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    const last = texts[texts.length - 1]
    if (!last) return []
    const raw = last.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((c: ProductCandidate) => c && typeof c.url === 'string' && /^https?:\/\//.test(c.url))
      .map((c: ProductCandidate) => ({
        url: c.url,
        title: typeof c.title === 'string' ? c.title : c.url,
        imageUrl: typeof c.imageUrl === 'string' ? c.imageUrl : null,
        retailer: typeof c.retailer === 'string' ? c.retailer : store,
      }))
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run the search test to verify it passes**

Run: `pnpm --filter web test src/lib/product-search.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add failing route tests for search mode**

Add this mock to `apps/web/src/app/api/wardrobe/from-link/route.test.ts` (after the variant-matcher mock):

```typescript
const searchProduct = vi.fn()
vi.mock('@/lib/product-search', () => ({ searchProduct }))
```

Add to `beforeEach`:

```typescript
  searchProduct.mockResolvedValue([])
```

Add these tests inside the `describe` block:

```typescript
  it('returns candidates in search mode', async () => {
    searchProduct.mockResolvedValueOnce([
      { url: 'https://theiconic.com.au/p/1', title: 'Black Nike Pegasus', imageUrl: null, retailer: 'THE ICONIC' },
    ])
    const res = await post({ description: 'black Nike running shoes', store: 'THE ICONIC' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mode).toBe('candidates')
    expect(json.candidates).toHaveLength(1)
  })

  it('returns 404 when search finds nothing', async () => {
    searchProduct.mockResolvedValueOnce([])
    const res = await post({ description: 'nonexistent thing', store: 'Nowhere' })
    expect(res.status).toBe(404)
  })
```

- [ ] **Step 6: Run the route test to verify the new cases fail**

Run: `pnpm --filter web test src/app/api/wardrobe/from-link/route.test.ts`
Expected: FAIL — search mode returns the placeholder 400

- [ ] **Step 7: Wire search into the route**

In `apps/web/src/app/api/wardrobe/from-link/route.ts`, add the import:

```typescript
import { searchProduct } from '@/lib/product-search'
```

Replace the placeholder tail:

```typescript
  // Search mode — implemented in Task 6
  return NextResponse.json({ error: 'Search mode not yet available' }, { status: 400 })
```

with:

```typescript
  // Search mode
  const candidates = await searchProduct(parsed.data.description!, parsed.data.store ?? '')
  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No matching products found' }, { status: 404 })
  }
  return NextResponse.json({ mode: 'candidates', candidates })
```

- [ ] **Step 8: Run the route test to verify it passes**

Run: `pnpm --filter web test src/app/api/wardrobe/from-link/route.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/product-search.ts apps/web/src/lib/product-search.test.ts apps/web/src/app/api/wardrobe/from-link/route.ts apps/web/src/app/api/wardrobe/from-link/route.test.ts
git commit -m "feat: web-search fallback for add-by-link (description + store)"
```

---

### Task 7: Frontend — Link tab, variant picker, method toggle

The `🔗 Link` tab UI. Handles the three response modes (`confirm`, `candidates`, `manual`), variant picking, ownership, and saving via the existing `POST /api/wardrobe`.

**Files:**
- Create: `apps/web/src/components/wardrobe/ColourVariantPicker.tsx`
- Create: `apps/web/src/components/wardrobe/AddByLinkForm.tsx`
- Modify: `apps/web/src/app/(app)/wardrobe/add/page.tsx`

**Acceptance Criteria:**
- [ ] Add page shows a `📸 Photo` / `🔗 Link` toggle; Photo renders the existing `AddItemForm` unchanged
- [ ] Link tab: URL field, "No link? Describe it" toggle (description + store), optional item-photo attach, Owned/Wishlist toggle
- [ ] `confirm` mode shows product image, editable name + category, variant picker (when variants exist), ownership, and saves via `POST /api/wardrobe`
- [ ] `candidates` mode lists results; clicking one re-submits in URL mode
- [ ] `manual` mode shows a notice, prefilled store URL, and lets the user type fields + paste an image URL to save
- [ ] After save, navigates to `/wardrobe`

- [ ] **Step 1: Create `ColourVariantPicker`**

Create `apps/web/src/components/wardrobe/ColourVariantPicker.tsx`:

```tsx
'use client'
import type { ColourVariant } from '@/lib/product-extractor'

interface Props {
  variants: ColourVariant[]
  selectedHex: string | undefined
  onSelect: (hex: string) => void
}

export default function ColourVariantPicker({ variants, selectedHex, onSelect }: Props) {
  if (variants.length === 0) return null
  return (
    <div>
      <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Colour</label>
      <div className="flex flex-wrap gap-2">
        {variants.map(v => {
          const active = v.hex === selectedHex
          return (
            <button
              key={v.hex + v.label}
              type="button"
              onClick={() => onSelect(v.hex)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? 'border-purple-500 text-white bg-purple-600/20' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <span className="w-4 h-4 rounded-full border border-white/20" style={{ background: v.hex }} />
              {v.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `AddByLinkForm`**

Create `apps/web/src/components/wardrobe/AddByLinkForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WardrobeCategory, Ownership } from '@fashun/shared'
import type { ColourVariant } from '@/lib/product-extractor'
import ColourVariantPicker from './ColourVariantPicker'

type Product = {
  suggestedName: string
  category: WardrobeCategory
  colours: string[]
  colourVariants: ColourVariant[]
  styleTags: string[]
  processedImageUrl: string | null
  storeUrl: string
  price: number | null
  retailer: string | null
}
type Candidate = { url: string; title: string; imageUrl: string | null; retailer: string | null }

const CATEGORIES: WardrobeCategory[] = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']

export default function AddByLinkForm() {
  const router = useRouter()
  const [mode, setMode] = useState<'input' | 'loading' | 'confirm' | 'candidates' | 'manual' | 'saving'>('input')
  const [describe, setDescribe] = useState(false)
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [store, setStore] = useState('')
  const [itemPhoto, setItemPhoto] = useState<string | undefined>(undefined)
  const [ownership, setOwnership] = useState<Ownership>('owned')
  const [error, setError] = useState('')

  const [product, setProduct] = useState<Product | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [name, setName] = useState('')
  const [category, setCategory] = useState<WardrobeCategory>('tops')
  const [selectedHex, setSelectedHex] = useState<string | undefined>(undefined)
  const [manualImageUrl, setManualImageUrl] = useState('')

  async function submit(payload: Record<string, unknown>) {
    setMode('loading')
    setError('')
    const res = await fetch('/api/wardrobe/from-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Something went wrong'); setMode('input'); return }

    if (data.mode === 'candidates') { setCandidates(data.candidates); setMode('candidates'); return }
    if (data.mode === 'manual') {
      setName(''); setCategory('tops'); setManualImageUrl(''); setMode('manual')
      setProduct({ suggestedName: '', category: 'tops', colours: [], colourVariants: [], styleTags: [],
        processedImageUrl: null, storeUrl: data.storeUrl, price: null, retailer: null })
      return
    }
    // confirm
    const p: Product = data.product
    setProduct(p); setName(p.suggestedName); setCategory(p.category)
    setSelectedHex(p.colours[0]); setMode('confirm')
  }

  async function handleSave(imageUrl: string, colours: string[]) {
    if (!product) return
    setMode('saving')
    await fetch('/api/wardrobe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, category, colours, styleTags: product.styleTags, imageUrl, ownership,
        storeUrl: product.storeUrl, price: product.price ?? undefined, retailer: product.retailer ?? undefined,
      }),
    })
    router.push('/wardrobe')
  }

  if (mode === 'loading' || mode === 'saving') {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">{mode === 'saving' ? 'Saving…' : 'Finding your item…'}</p>
      </div>
    )
  }

  if (mode === 'candidates') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-zinc-400 text-sm">Which one is it?</p>
        {candidates.map(c => (
          <button key={c.url} onClick={() => submit({ url: c.url, itemPhotoBase64: itemPhoto })}
            className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-left hover:border-purple-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.imageUrl && <img src={c.imageUrl} alt={c.title} className="w-12 h-12 object-contain rounded" />}
            <div>
              <p className="text-white text-sm font-semibold">{c.title}</p>
              <p className="text-zinc-500 text-xs">{c.retailer}</p>
            </div>
          </button>
        ))}
        <button onClick={() => setMode('input')} className="text-zinc-500 text-sm hover:text-white">← Back</button>
      </div>
    )
  }

  if (mode === 'confirm' && product) {
    const colours = selectedHex ? [selectedHex] : product.colours
    return (
      <div className="flex flex-col gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {product.processedImageUrl && (
          <img src={product.processedImageUrl} alt={name} className="w-40 h-52 object-contain mx-auto bg-zinc-900 rounded-xl" />
        )}
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value as WardrobeCategory)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500">
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <ColourVariantPicker variants={product.colourVariants} selectedHex={selectedHex} onSelect={setSelectedHex} />
        <OwnershipToggle ownership={ownership} onChange={setOwnership} />
        <div className="flex gap-2 mt-2">
          <button onClick={() => setMode('input')} className="flex-1 bg-zinc-900 text-zinc-400 rounded-xl py-3 font-bold hover:bg-zinc-800">← Redo</button>
          <button onClick={() => handleSave(product.processedImageUrl ?? '', colours)}
            disabled={!product.processedImageUrl}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50">
            ✓ Save to Wardrobe
          </button>
        </div>
        {!product.processedImageUrl && <p className="text-amber-400 text-xs">No image found — switch to the 📸 Photo tab to add one.</p>}
      </div>
    )
  }

  if (mode === 'manual' && product) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-amber-400 text-sm">Couldn&apos;t read that page automatically — fill in the details.</p>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value as WardrobeCategory)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500">
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Image URL</label>
          <input value={manualImageUrl} onChange={e => setManualImageUrl(e.target.value)} placeholder="https://…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
        </div>
        <OwnershipToggle ownership={ownership} onChange={setOwnership} />
        <div className="flex gap-2 mt-2">
          <button onClick={() => setMode('input')} className="flex-1 bg-zinc-900 text-zinc-400 rounded-xl py-3 font-bold hover:bg-zinc-800">← Back</button>
          <button onClick={() => handleSave(manualImageUrl, [])}
            disabled={!name || !manualImageUrl}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50">
            ✓ Save to Wardrobe
          </button>
        </div>
      </div>
    )
  }

  // input mode
  return (
    <div className="flex flex-col gap-4">
      {!describe ? (
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Store link</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.theiconic.com.au/…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
          <button onClick={() => setDescribe(true)} className="text-purple-400 text-xs mt-2 hover:underline">No link? Describe it instead →</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Describe the item</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="black Nike running shoes"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Store</label>
            <input value={store} onChange={e => setStore(e.target.value)} placeholder="THE ICONIC"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
          </div>
          <button onClick={() => setDescribe(false)} className="text-purple-400 text-xs hover:underline">← Use a link instead</button>
        </div>
      )}

      <div>
        <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Photo of your item (optional — helps pick the colour)</label>
        <input type="file" accept="image/*"
          onChange={async e => { const f = e.target.files?.[0]; if (f) setItemPhoto(await fileToBase64(f)) }}
          className="text-zinc-400 text-sm" />
      </div>

      <OwnershipToggle ownership={ownership} onChange={setOwnership} />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={() => describe ? submit({ description, store }) : submit({ url, itemPhotoBase64: itemPhoto })}
        disabled={describe ? (!description || !store) : !url}
        className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50">
        Find item
      </button>
    </div>
  )
}

function OwnershipToggle({ ownership, onChange }: { ownership: Ownership; onChange: (o: Ownership) => void }) {
  return (
    <div className="flex gap-2">
      {(['owned', 'wishlist'] as Ownership[]).map(o => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            ownership === o ? 'bg-purple-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
          }`}>
          {o === 'owned' ? 'Owned' : 'Wishlist'}
        </button>
      ))}
    </div>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.readAsDataURL(file)
  })
}
```

- [ ] **Step 3: Add the method toggle to the add page**

Replace `apps/web/src/app/(app)/wardrobe/add/page.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import AddItemForm from '@/components/wardrobe/AddItemForm'
import AddByLinkForm from '@/components/wardrobe/AddByLinkForm'

export default function AddItemPage() {
  const [method, setMethod] = useState<'photo' | 'link'>('photo')
  return (
    <div className="min-h-screen bg-black text-white px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <a href="/wardrobe" className="text-zinc-500 hover:text-white text-xl">←</a>
        <h1 className="text-xl font-black">Add Item</h1>
      </div>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setMethod('photo')}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            method === 'photo' ? 'bg-purple-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}>
          📸 Photo
        </button>
        <button onClick={() => setMethod('link')}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            method === 'link' ? 'bg-purple-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}>
          🔗 Link
        </button>
      </div>
      {method === 'photo' ? <AddItemForm /> : <AddByLinkForm />}
    </div>
  )
}
```

- [ ] **Step 4: Verify the build compiles**

Run: `pnpm --filter web build`
Expected: build succeeds (no type errors)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wardrobe/ColourVariantPicker.tsx apps/web/src/components/wardrobe/AddByLinkForm.tsx "apps/web/src/app/(app)/wardrobe/add/page.tsx"
git commit -m "feat: Add Item by Link UI — method toggle, link form, variant picker"
```

---

### Task 8: Full-suite check, manual verification, push

**Files:** none (verification only)

- [ ] **Step 1: Run the full web test suite**

Run: `pnpm --filter web test`
Expected: all tests pass (existing + new)

- [ ] **Step 2: Run the production build**

Run: `pnpm --filter web build`
Expected: build succeeds

- [ ] **Step 3: Manual smoke test (local dev)**

Run: `pnpm --filter web dev`, sign in, go to `/wardrobe/add`:
- `🔗 Link` tab → paste a real AU product URL (e.g. a THE ICONIC product) → confirm card shows image, name, category, variants → pick a colour → Save → appears in `/wardrobe`.
- Attach a photo of your item with a multi-variant product → the matched colour is pre-selected.
- "No link? Describe it" → description + store → candidate list → pick one → confirm → Save.
- Paste a junk/blocked URL → manual mode → type name + image URL → Save.
- Toggle Owned/Wishlist → item lands in the correct wardrobe section.

- [ ] **Step 4: Push**

```bash
git push
```

Check the Vercel deployment passes. Confirm `ANTHROPIC_API_KEY` is set in the deployed environment (the route's scrape/extract/search all depend on it).

---

## Notes for the implementer

- **No DB migration** — `wardrobe_items` already has `store_url`, `price`, `retailer`, `colours`, `ownership`, `image_url`. Save goes through the existing `POST /api/wardrobe`.
- **Photoroom is intentionally skipped** — store images go straight to the bucket, matching the photo flow (where Photoroom is already disabled).
- **Anthropic web search tool** (`web_search_20250305`) requires it to be enabled for your Anthropic account/key. If search mode returns errors in production, that's the first thing to check. URL mode does not depend on it.
- All Claude calls use `claude-haiku-4-5-20251001`, matching the existing tagger and outfit-generate routes.
