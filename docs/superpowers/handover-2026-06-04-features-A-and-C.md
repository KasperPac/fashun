# Handover — Features A & C (add-by-link robustness + photo→stock-image)

**Written:** 2026-06-04 · For a future session picking these up cold.

This captures two queued features after the wardrobe work shipped today. Read the
"Shared context & gotchas" section first — it applies to both.

---

## Status of the broader effort

| Work | State |
|---|---|
| Add Item by Store Link (URL + describe-it search + variant photo-match) | ✅ Shipped to master/prod |
| Wardrobe images display (snake→camel + **private signed URLs**) | ✅ Shipped to master/prod |
| **Feature A** — Claude web-fetch fallback for bot-blocked retailers | 📋 Designed & API-verified, **no plan written yet** |
| **Feature C** — photo → Claude identifies → use online stock image | 🔲 Rough intent only, **needs a brainstorming pass** |
| Feature B — personalised try-on base (multi-photo → best model) | 📋 Spec exists, not planned: `specs/2026-06-04-personalised-tryon-base-design.md` |

Agreed sequence was **images → A → C**. Images done; **A is next.**

---

## Shared context & gotchas (read first)

- **Workflow:** feature branch off `master` → subagent-driven execution (fresh
  implementer per task + spec-compliance review + code-quality review, both via
  `general-purpose` agents) → merge `--no-ff` to master → `git push origin master`
  triggers Vercel **production** deploy (confirm with user before pushing).
- **Verify:** `pnpm --filter web test [path]` and `pnpm --filter web build`.
  Currently 66 tests green.
- **Repo Anthropic conventions** (`apps/web/src/lib/tagger.ts`,
  `app/api/outfits/generate/route.ts` are the references): `@anthropic-ai/sdk` ^0.100,
  model `claude-haiku-4-5-20251001`, strip markdown fences before `JSON.parse`,
  soft-fallback on any error, return shape validated then mapped.
- **Vitest mock hoisting:** mocks referenced inside a `vi.mock(...)` factory whose
  variable name is NOT `mock`-prefixed must use `const x = vi.hoisted(() => vi.fn())`.
  (Bit us repeatedly.) Also: **run the FULL suite** before finishing — per-file runs
  hide cross-file fixture issues (a fixture using a fake URL where prod uses a path).
- **Next.js is non-standard** (`apps/web/AGENTS.md`): mirror existing route patterns
  (`export async function POST(req: Request)` → `NextResponse.json`); don't invent.
- **Images are private now.** Bucket `wardrobe-images` is private; images are served
  via signed URLs. `apps/web/src/lib/wardrobe-image.ts` exports:
  - `toObjectPath(value)` → bare bucket path (handles public/signed URLs + bare paths)
  - `signWardrobeImage(supabase, value, expiresIn)` → signed URL (or null); **passes
    external/non-bucket URLs through unsigned**
  - `isExternalUrl(value)` → true for http(s) URLs not pointing at the bucket
  Any NEW surface that displays a wardrobe image must sign the stored path.
- **Photoroom is disabled** (no API key) — images stored as-is.
- **Supabase MCP is connected to the WRONG org.** Reachable projects: Assemblio,
  Finly, Pac-Forge-v2. The fashun project is `pekyfnqkiqkglphqwpes` (see
  `apps/web/.env.local`) and is NOT in that org → **you cannot run live SQL/migrations
  against prod via MCP.** Hand the user SQL to run in their dashboard, or provide a
  migration file.
- **Known follow-ups (not blocking A/C):** try-on MODEL photo (`users.try_on_photo_url`,
  `try-on-photos` bucket) is still passed to Fashn raw — needs signing if that bucket
  is private (Feature B territory). `GET /api/wardrobe` signs N images per request with
  no pagination cap (fine for beta). `POST /api/wardrobe` 201 returns a raw snake_case
  row (pre-existing).

---

## Feature A — Claude web-fetch fallback (APPROVED, ready to plan)

### Problem
`from-link` URL mode does a direct server-side fetch (`lib/product-scraper.ts`).
Large AU retailers behind Akamai/Cloudflare block Vercel's datacenter IP. **Confirmed:**
Kmart returns `Fetch failed: 403`. When scrape throws, the route returns `mode:'manual'`.
This also dead-ends the describe-it search path (clicking a candidate re-submits its
URL → re-scrapes → 403 again).

### Approved approach
When the direct scrape fails, fall back to fetching the page via **Claude's server-side
`web_fetch` tool** (runs on Anthropic's infra, not Vercel's IP). Same `ExtractedProduct`
output, so everything downstream (image upload, colour resolution, confirm payload) is
unchanged. Fixing this also fixes the describe-it dead-end automatically.

**Honest caveat (told to user):** `web_fetch` does not render JS and Anthropic also
fetches server-side, so the most aggressive sites (possibly Kmart) may still fail →
falls through to `manual`. No regression; likely wins for many sites. If it proves
insufficient, the rejected-for-now alternative was a **paid scraping API**
(ScrapingBee / ScraperAPI / Zyte, residential IPs + JS challenge solving).

### Verified web_fetch API (checked against Anthropic docs 2026-06-04)
- Tool config: `{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 2 }`
  (newer `web_fetch_20260209` adds dynamic filtering but needs the code-execution tool —
  **not needed**, use `_20250910`).
- **No beta header**; standard `anthropic-version: 2023-06-01`. **No extra cost** beyond
  token usage of fetched content.
- **Constraint:** Claude may only fetch URLs that appear in the conversation → put the
  URL in the user message (we do). It cannot fetch model-generated URLs.
- Fetch errors come back as a `web_fetch_tool_result` block of type
  `web_fetch_tool_error` with `error_code` (e.g. `url_not_accessible`, `too_many_requests`);
  the API call itself still returns 200.
- Optional: `allowed_domains`, `blocked_domains`, `max_content_tokens`, `citations`.

### Concrete design
1. **New lib** `apps/web/src/lib/product-fetch-claude.ts`:
   ```ts
   import type { ExtractedProduct } from './product-extractor'
   export async function extractProductViaClaude(url: string): Promise<ExtractedProduct | null>
   ```
   - Calls Claude with the `web_fetch` tool, URL in the user message, instructing it to
     fetch the page and return ONLY product JSON matching `ExtractedProduct` (fields:
     `name, category, retailer, imageUrl, price, styleTags, colourVariants:{label,hex}[],
     colours:string[]`).
   - Parse the LAST text block (after tool-use blocks), strip fences, validate (reuse the
     same hex/category guards as `product-extractor.ts`). Return `null` on any
     `web_fetch_tool_error` / parse failure.
   - Model: start with `claude-haiku-4-5-20251001`; **verify web_fetch is supported on
     haiku** (docs examples used Opus). If not, use `claude-sonnet-4-6`. This is the one
     thing to confirm at implementation time.
2. **Route change** `apps/web/src/app/api/wardrobe/from-link/route.ts` (URL mode):
   ```ts
   let product: ExtractedProduct | null = null
   try {
     const page = await scrapeProductPage(url)
     product = await extractProduct(page)
   } catch {
     product = await extractProductViaClaude(url)   // <-- fallback
   }
   if (!product) {
     console.error('[from-link] both direct + claude fetch failed', url)
     return NextResponse.json({ mode: 'manual', storeUrl: url, reason: 'Could not read that page' })
   }
   // unchanged below: image upload (uploadImageFromUrl→signWardrobeImage preview),
   // colour resolution, confirm payload
   ```
   Keep the SSRF guard (`isPubliclyFetchable`) before either fetch.
3. Image still uploaded from Vercel via `uploadImageFromUrl` (image CDNs usually aren't
   IP-blocked). If that also fails → `processedImageUrl: null` → confirm shows the
   placeholder / Photo-tab hint (already handled).

### Effort & tests
~2 tasks: the lib (+ unit test mocking the Anthropic web_fetch response shape) and the
route wiring (+ a test: `scrapeProductPage` rejects → `extractProductViaClaude` mocked to
return a product → asserts `mode:'confirm'`; and both-fail → `mode:'manual'`). The
from-link route test already mocks the libs, so add a `vi.hoisted` mock for
`@/lib/product-fetch-claude`.

This is an enhancement to `specs/2026-06-04-add-item-by-link-design.md`.

---

## Feature C — photo → Claude identifies → use online stock image (NEEDS DESIGN)

### Intent (user's words, paraphrased)
In the **Photo** add flow, instead of just tagging the user's snapshot, have Claude
**analyse the image, identify the item** (e.g. "Timberland 6-inch premium boots"),
**search for it online**, and if found, **use the official stock product image** — because
clean stock images render far better in virtual try-on than a casual phone photo.

### Why it comes after A
It reuses A's machinery wholesale: `product-search.ts` (web search → candidates),
`extractProductViaClaude` / `product-extractor` (fetch + normalise), `store-image.ts`
(ingest the stock image to the bucket). Build A first, then C composes it.

### Open design questions (resolve in a brainstorming pass)
- **Entry point:** extend `/api/wardrobe/process` (+ `AddItemForm`) so that after Claude
  Vision tags the photo, it also produces an identification (brand/model/keywords) and a
  confidence.
- **Find flow:** identification keywords → `searchProduct(description, store?)` →
  candidate(s) → fetch/extract the best → stock image + variants + price.
- **UX:** show "We think this is **X** — use the official photo?" letting the user choose
  **their photo vs the found stock image** (and pick a colour variant). Default to the
  user's photo on low confidence or no match (current behaviour, zero regression).
- **Which image is stored** feeds try-on quality — that's the whole point, so make the
  stock image the wardrobe image when accepted (ingested via `store-image` → path →
  signed like everything else).
- **Cost note:** adds a Vision call + web search + fetch per photo add; gate it (only when
  the user opts in, or only when confidence is high) to control spend.
- **Scope guard (YAGNI):** v1 = single best match, user confirms. No multi-result
  galleries, no auto-replace without confirmation.

### Effort
Larger than A. Do a full brainstorm → spec → plan. Most logic is reuse; the new parts are
the identification prompt, the process-route orchestration, and the "your photo vs stock"
confirm UI.

---

## Pointers
- Add-by-link spec: `docs/superpowers/specs/2026-06-04-add-item-by-link-design.md`
- Add-by-link plan (reference style): `docs/superpowers/plans/2026-06-04-add-item-by-link.md`
- Image signing: `apps/web/src/lib/wardrobe-image.ts` (+ spec/plan dated 2026-06-04)
- Anthropic web_fetch docs: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/web-fetch-tool
