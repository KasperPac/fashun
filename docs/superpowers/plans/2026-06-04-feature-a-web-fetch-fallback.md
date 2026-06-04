# Feature A — Claude web_fetch Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the direct server-side product-page scrape fails (e.g. AU retailers behind Akamai/Cloudflare returning 403 to Vercel's datacenter IP), fall back to fetching the page via Claude's server-side `web_fetch` tool so the add-by-link flow still produces a `confirm` payload instead of dead-ending at `manual`.

**Architecture:** A new lib `product-fetch-claude.ts` calls the Anthropic Messages API with the `web_fetch` tool, putting the product URL in the user message (Claude may only fetch URLs present in the conversation). It parses the final text block into the existing `ExtractedProduct` shape using the same validation guards as `product-extractor.ts`, returning `null` on any fetch/parse failure. The `from-link` URL-mode route wraps only the direct fetch+extract in a `try`; on throw it calls the Claude fallback, and only returns `mode:'manual'` when both produce nothing. Everything downstream (image upload, colour resolution, confirm payload) is unchanged.

**Tech Stack:** Next.js (non-standard — see `apps/web/AGENTS.md`), TypeScript, `@anthropic-ai/sdk` ^0.100, Vitest, Zod, Supabase.

---

## Shared conventions (read before starting any task)

- **Anthropic conventions** (mirror `product-search.ts` and `product-extractor.ts`): model `claude-haiku-4-5-20251001`; strip markdown fences before `JSON.parse`; soft-fallback on any error; validate then map the returned shape. No beta header — the SDK sends `anthropic-version: 2023-06-01`.
- **web_fetch tool config:** `{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 2 } as never` (the `as never` cast matches how `product-search.ts` passes `web_search_20250305`, since the SDK's tool union may not yet type these server tools). Do NOT use `web_fetch_20260209` — it requires the code-execution tool and is not needed here.
- **Last-text-block parsing:** tool-use / tool-result blocks precede the model's final answer. Filter `message.content` to text blocks and use the LAST one (see `product-search.ts:27-31`).
- **Vitest mock hoisting:** any mock referenced inside a `vi.mock(...)` factory whose variable name is NOT `mock`-prefixed MUST be declared with `vi.hoisted(...)` (see both existing test files). The Anthropic mock pattern is: `vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))`.
- **Run the FULL suite** before finishing (`pnpm --filter web test`), not just per-file — cross-file fixture issues hide otherwise. Currently 66 tests green; this plan adds tests, so the count should rise and stay green.
- **Build check:** `pnpm --filter web build` must pass.
- Run all commands from the repo root `C:\dev\fashun`.

## File Structure

- **Create:** `apps/web/src/lib/product-fetch-claude.ts` — single export `extractProductViaClaude(url)`; sole responsibility is "fetch a product page via Claude web_fetch and return a validated `ExtractedProduct` or `null`".
- **Create:** `apps/web/src/lib/product-fetch-claude.test.ts` — unit tests mocking the Anthropic SDK.
- **Modify:** `apps/web/src/app/api/wardrobe/from-link/route.ts` — wire the fallback into URL mode.
- **Modify:** `apps/web/src/app/api/wardrobe/from-link/route.test.ts` — add the new-lib mock and fallback-path tests.

---

## Task 1: `product-fetch-claude.ts` lib

**Files:**
- Create: `apps/web/src/lib/product-fetch-claude.ts`
- Test: `apps/web/src/lib/product-fetch-claude.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/product-fetch-claude.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))

import { extractProductViaClaude } from './product-fetch-claude'

const productJson = {
  name: 'Rust Linen Shirt',
  category: 'tops',
  retailer: 'Kmart',
  imageUrl: 'https://cdn.kmart.com/shirt.jpg',
  price: 25,
  styleTags: ['smart-casual'],
  colourVariants: [{ label: 'Rust', hex: '#B7410E' }, { label: 'Olive', hex: '#556B2F' }],
  colours: ['#B7410E'],
}

beforeEach(() => vi.clearAllMocks())

describe('extractProductViaClaude', () => {
  it('parses a product from the final text block (after tool-use blocks)', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'server_tool_use', id: 't1', name: 'web_fetch', input: { url: 'https://kmart.com/p/1' } },
        { type: 'web_fetch_tool_result', tool_use_id: 't1', content: { type: 'web_fetch_result', url: 'https://kmart.com/p/1' } },
        { type: 'text', text: JSON.stringify(productJson) },
      ],
    })
    const out = await extractProductViaClaude('https://kmart.com/p/1')
    expect(out).not.toBeNull()
    expect(out!.name).toBe('Rust Linen Shirt')
    expect(out!.category).toBe('tops')
    expect(out!.colourVariants).toHaveLength(2)
    expect(out!.colours).toEqual(['#B7410E'])
  })

  it('parses JSON wrapped in a markdown fence', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: '```json\n' + JSON.stringify(productJson) + '\n```' },
      ],
    })
    const out = await extractProductViaClaude('https://kmart.com/p/1')
    expect(out!.name).toBe('Rust Linen Shirt')
  })

  it('coerces an unknown category to tops and drops invalid hex variants', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        ...productJson,
        category: 'gadgets',
        colourVariants: [{ label: 'Rust', hex: '#B7410E' }, { label: 'Bad', hex: 'red' }],
        colours: ['#B7410E', 'notahex'],
      }) }],
    })
    const out = await extractProductViaClaude('https://kmart.com/p/1')
    expect(out!.category).toBe('tops')
    expect(out!.colourVariants).toHaveLength(1)
    expect(out!.colours).toEqual(['#B7410E'])
  })

  it('returns null when web_fetch returns an error block', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'server_tool_use', id: 't1', name: 'web_fetch', input: { url: 'https://kmart.com/p/1' } },
        { type: 'web_fetch_tool_result', tool_use_id: 't1', content: { type: 'web_fetch_tool_error', error_code: 'url_not_accessible' } },
        { type: 'text', text: 'I could not access that page.' },
      ],
    })
    expect(await extractProductViaClaude('https://kmart.com/p/1')).toBeNull()
  })

  it('returns null when there is no text block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'server_tool_use', id: 't1', name: 'web_fetch', input: {} }] })
    expect(await extractProductViaClaude('https://kmart.com/p/1')).toBeNull()
  })

  it('returns null on unparseable text', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'sorry, no JSON here' }] })
    expect(await extractProductViaClaude('https://kmart.com/p/1')).toBeNull()
  })

  it('returns null when the SDK call throws', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    expect(await extractProductViaClaude('https://kmart.com/p/1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/lib/product-fetch-claude.test.ts`
Expected: FAIL — `Failed to resolve import "./product-fetch-claude"` / "extractProductViaClaude is not a function".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/product-fetch-claude.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { WardrobeCategory } from '@fashun/shared'
import type { ExtractedProduct, ColourVariant } from './product-extractor'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CATEGORIES: WardrobeCategory[] = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']
const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Fallback used when the direct server-side scrape is blocked (e.g. retailer
 * bot-protection returns 403 to Vercel's datacenter IP). Fetches the page via
 * Claude's server-side `web_fetch` tool (runs on Anthropic infra, different IP)
 * and normalises it into ExtractedProduct. Returns null on any fetch/parse failure.
 *
 * Note: Claude may only fetch URLs that appear in the conversation, so the URL is
 * placed in the user message. web_fetch does not render JS and Anthropic also
 * fetches server-side, so the most aggressive sites may still fail -> null.
 */
export async function extractProductViaClaude(url: string): Promise<ExtractedProduct | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 2 } as never],
      messages: [{
        role: 'user',
        content: `Fetch this clothing product page and normalise it into structured data: ${url}

After fetching, reply with ONLY valid JSON (no markdown):
{
  "name": "Short descriptive name e.g. Rust Linen Shirt",
  "category": "tops|bottoms|shoes|outerwear|bags|accessories",
  "retailer": "store name shown on the page, or null",
  "imageUrl": "main product image url, or null",
  "price": number or null,
  "styleTags": ["casual|smart-casual|business|streetwear|minimalist|athleisure|bohemian|glam"],
  "colourVariants": [{"label": "named colour shown on the page", "hex": "#rrggbb"}],
  "colours": ["#rrggbb"]
}
Rules:
- colourVariants: only colours the page actually offers. Empty array if none are listed.
- colours: 1-2 dominant hex codes for the pictured item (best guess if no variants).
- hex values must be 6-digit #rrggbb.`,
      }],
    })

    // If web_fetch failed, the result block carries a web_fetch_tool_error -> give up (null).
    const fetchFailed = message.content.some(
      (b: { type: string; content?: { type?: string } }) =>
        b.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_tool_error',
    )
    if (fetchFailed) return null

    // Final text block is the answer (tool-use / tool-result blocks precede it).
    const texts = message.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    const last = texts[texts.length - 1]
    if (!last) return null

    const raw = last.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
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
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'My item',
      category,
      retailer: typeof parsed.retailer === 'string' && parsed.retailer ? parsed.retailer : null,
      imageUrl: typeof parsed.imageUrl === 'string' && parsed.imageUrl ? parsed.imageUrl : null,
      price: typeof parsed.price === 'number' && Number.isFinite(parsed.price) ? parsed.price : null,
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags : [],
      colourVariants,
      colours,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/lib/product-fetch-claude.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/product-fetch-claude.ts apps/web/src/lib/product-fetch-claude.test.ts
git commit -m "feat(from-link): add Claude web_fetch product extractor fallback lib"
```

---

## Task 2: Wire the fallback into the from-link URL-mode route

**Files:**
- Modify: `apps/web/src/app/api/wardrobe/from-link/route.ts` (URL-mode block, lines 51-101)
- Test: `apps/web/src/app/api/wardrobe/from-link/route.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/app/api/wardrobe/from-link/route.test.ts`, add a hoisted mock for the new lib alongside the existing mocks (after the `searchProduct` mock block, around line 25):

```ts
const extractProductViaClaude = vi.hoisted(() => vi.fn())
vi.mock('@/lib/product-fetch-claude', () => ({ extractProductViaClaude }))
```

In the `beforeEach` (after the `searchProduct.mockResolvedValue([])` line, ~line 43), add a default:

```ts
  extractProductViaClaude.mockResolvedValue(null)
```

Then add two new tests inside the `describe('POST /api/wardrobe/from-link (URL mode)', ...)` block:

```ts
  it('falls back to Claude web_fetch and returns confirm when direct scrape throws', async () => {
    scrapeProductPage.mockRejectedValueOnce(new Error('Fetch failed: 403'))
    extractProductViaClaude.mockResolvedValueOnce(extracted)
    const res = await post({ url: 'https://kmart.com.au/p/blocked' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(extractProductViaClaude).toHaveBeenCalledWith('https://kmart.com.au/p/blocked')
    expect(json.mode).toBe('confirm')
    expect(json.product.suggestedName).toBe('Rust Linen Shirt')
    expect(json.product.processedImageUrl).toBe('https://signed/preview.jpg')
  })
```

And update the existing `'returns mode manual when scraping throws'` test so the fallback is explicitly exhausted (the default already returns null, but make the intent obvious):

```ts
  it('returns mode manual when both direct scrape and Claude fetch fail', async () => {
    scrapeProductPage.mockRejectedValueOnce(new Error('403'))
    extractProductViaClaude.mockResolvedValueOnce(null)
    const res = await post({ url: 'https://shop.com/blocked' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mode).toBe('manual')
    expect(json.storeUrl).toBe('https://shop.com/blocked')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test src/app/api/wardrobe/from-link/route.test.ts`
Expected: the new `falls back to Claude web_fetch...` test FAILS — `extractProductViaClaude` is never called (route doesn't call it yet) so `json.mode` is `'manual'`, not `'confirm'`. (The other tests still pass.)

- [ ] **Step 3: Implement the route change**

In `apps/web/src/app/api/wardrobe/from-link/route.ts`:

Add the imports near the existing ones (after line 8):

```ts
import { extractProductViaClaude } from '@/lib/product-fetch-claude'
import type { ExtractedProduct } from '@/lib/product-extractor'
```

Replace the URL-mode body (the `try { ... } catch (err) { ... }` block, lines 56-100) with:

```ts
    let product: ExtractedProduct | null = null
    try {
      const page = await scrapeProductPage(url)
      product = await extractProduct(page)
    } catch (err) {
      // Direct fetch blocked (e.g. retailer bot-protection 403s Vercel's IP).
      // Fall back to Claude's server-side web_fetch (different IP, Anthropic infra).
      console.error('[from-link] direct scrape failed, trying Claude web_fetch', url, err instanceof Error ? err.message : err)
      product = await extractProductViaClaude(url)
    }

    if (!product) {
      console.error('[from-link] both direct + Claude fetch failed', url)
      return NextResponse.json({ mode: 'manual', storeUrl: url, reason: 'Could not read that page' })
    }

    let processedImageUrl: string | null = null
    if (product.imageUrl) {
      try {
        const path = await uploadImageFromUrl(supabase, product.imageUrl, user.id)
        processedImageUrl = await signWardrobeImage(supabase, path, 3600)
      } catch {
        processedImageUrl = null
      }
    }

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
```

Note: only the scrape+extract is inside `try`; the downstream image-upload / colour / confirm code now runs after the `if (!product)` guard (it has its own inner try/catch for the image upload, matching the original).

- [ ] **Step 4: Run the route tests to verify they pass**

Run: `pnpm --filter web test src/app/api/wardrobe/from-link/route.test.ts`
Expected: PASS — all tests green, including the new fallback test.

- [ ] **Step 5: Run the FULL suite and the build**

Run: `pnpm --filter web test`
Expected: PASS — all tests green (was 66; now higher with the additions).

Run: `pnpm --filter web build`
Expected: build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/wardrobe/from-link/route.ts apps/web/src/app/api/wardrobe/from-link/route.test.ts
git commit -m "feat(from-link): fall back to Claude web_fetch when direct scrape is blocked"
```

---

## Post-implementation manual verification (do before merging to prod)

Automated tests mock the Anthropic SDK, so they do NOT confirm `web_fetch` actually works on the chosen model. Before merging:

- [ ] **Confirm `web_fetch` is supported on `claude-haiku-4-5-20251001`.** The docs' examples used Opus. Quickest check: a throwaway Node script (or a real add-by-link against a known-blocked retailer like Kmart in `pnpm --filter web dev`) that calls `extractProductViaClaude` with a real product URL and a real `ANTHROPIC_API_KEY`.
  - If the API rejects the tool for haiku (e.g. a 400 about an unsupported tool), switch the `model` in `product-fetch-claude.ts` to `claude-sonnet-4-6` and re-run. This is the one runtime unknown in this plan.
- [ ] Confirm the honest caveat holds: some hyper-aggressive sites may still fail and fall through to `manual` — that is acceptable (no regression vs today).

## Integration & handoff

- This is an enhancement to `docs/superpowers/specs/2026-06-04-add-item-by-link-design.md`.
- Per the team workflow: feature branch off `master` → subagent-driven execution → merge `--no-ff` to master. **Confirm with the user before `git push origin master`** (that triggers the Vercel production deploy).
- Feature C (photo → identify → stock image) reuses `extractProductViaClaude` from this work; do not delete or narrow its export.

---

## Self-Review (completed by plan author)

**Spec coverage** — every element of the approved design in the handover is covered:
- New lib `product-fetch-claude.ts` with `extractProductViaClaude(url): Promise<ExtractedProduct | null>` → Task 1. ✓
- web_fetch tool config `web_fetch_20250910`, max_uses 2, URL in user message → Task 1 implementation. ✓
- Parse LAST text block, strip fences, reuse hex/category guards, null on error/web_fetch_tool_error → Task 1 (incl. dedicated tests). ✓
- Route wiring: try direct → catch → Claude fallback → both-fail → manual; downstream unchanged; SSRF guard kept (it's above the changed block, untouched) → Task 2. ✓
- Tests: lib unit test mocking the web_fetch response shape; route tests for `confirm` via fallback and `manual` when both fail → Tasks 1 & 2. ✓
- Model-on-haiku verification flagged as the one runtime unknown → Post-implementation verification. ✓

**Placeholder scan** — no TBD/TODO/"handle edge cases"; all code shown in full.

**Type consistency** — `extractProductViaClaude` returns `ExtractedProduct | null` consistently across lib, route import, and route tests. `ColourVariant`/`ExtractedProduct` imported from `product-extractor.ts` match its actual exports. Validation guards (`CATEGORIES`, `HEX`) mirror `product-extractor.ts` exactly.
