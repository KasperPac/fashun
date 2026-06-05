import Anthropic from '@anthropic-ai/sdk'
import type { WardrobeCategory } from '@fashun/shared'
import { extractJson } from './extract-json'
import { mediaTypeFromBase64 } from './image-media-type'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface TagResult {
  category: WardrobeCategory
  colours: string[]   // hex codes
  styleTags: string[]
  suggestedName: string
  searchQuery: string  // product search query if identifiable, else ''
}

const FALLBACK: TagResult = {
  category: 'tops',
  colours: [],
  styleTags: [],
  suggestedName: 'My item',
  searchQuery: '',
}

export async function tagImage(imageBase64: string): Promise<TagResult> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaTypeFromBase64(imageBase64), data: imageBase64 },
          },
          {
            type: 'text',
            text: `Analyse this clothing item image. Return ONLY valid JSON:
{
  "category": "tops|bottoms|shoes|outerwear|bags|accessories",
  "colours": ["#hexcode1", "#hexcode2"],
  "styleTags": ["casual|smart-casual|business|streetwear|minimalist|athleisure|bohemian|glam"],
  "suggestedName": "Short descriptive name e.g. Navy Linen Shirt",
  "searchQuery": "If you can identify the specific product (brand + model), a concise web search query e.g. 'Timberland 6-inch premium boots'. Empty string if you cannot identify it."
}
No markdown, no explanation, just the JSON.`,
          },
        ],
      }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return FALLBACK
    // The model may wrap the JSON in prose/a fence; extract the object out of it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = extractJson<any>(content.text, 'object')
    if (!parsed) return FALLBACK
    return {
      category: parsed.category ?? FALLBACK.category,
      colours: Array.isArray(parsed.colours) ? parsed.colours : [],
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags : [],
      suggestedName: parsed.suggestedName ?? FALLBACK.suggestedName,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
    }
  } catch {
    return FALLBACK
  }
}
