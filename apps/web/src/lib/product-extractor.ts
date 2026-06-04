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
