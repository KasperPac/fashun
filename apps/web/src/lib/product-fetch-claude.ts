import Anthropic from '@anthropic-ai/sdk'
import type { WardrobeCategory } from '@fashun/shared'
import type { ExtractedProduct, ColourVariant } from './product-extractor'
import { extractJson } from './extract-json'

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
      // max_uses: 2 allows one redirect/retry without runaway fetches
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
    // 'web_fetch_tool_result' is not yet in the SDK's ContentBlock union
    const fetchFailed = message.content.some(
      (b: { type: string; content?: { type?: string } }) =>
        b.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_tool_error',
    )
    if (fetchFailed) return null

    // Final text block is the answer (tool-use / tool-result blocks precede it).
    const texts = message.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    const last = texts[texts.length - 1]
    if (!last) return null

    // The model may narrate before the JSON (esp. after a tool call), so extract
    // the object out of any prose/fence rather than parsing the whole block.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = extractJson<any>(last.text, 'object')
    if (!parsed) return null

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
