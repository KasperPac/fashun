import Anthropic from '@anthropic-ai/sdk'
import type { WardrobeCategory } from '@fashun/shared'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface TagResult {
  category: WardrobeCategory
  colours: string[]   // hex codes
  styleTags: string[]
  suggestedName: string
}

const FALLBACK: TagResult = {
  category: 'tops',
  colours: [],
  styleTags: [],
  suggestedName: 'My item',
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
            source: { type: 'base64', media_type: 'image/png', data: imageBase64 },
          },
          {
            type: 'text',
            text: `Analyse this clothing item image. Return ONLY valid JSON:
{
  "category": "tops|bottoms|shoes|outerwear|bags|accessories",
  "colours": ["#hexcode1", "#hexcode2"],
  "styleTags": ["casual|smart-casual|business|streetwear|minimalist|athleisure|bohemian|glam"],
  "suggestedName": "Short descriptive name e.g. Navy Linen Shirt"
}
No markdown, no explanation, just the JSON.`,
          },
        ],
      }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return FALLBACK
    const parsed = JSON.parse(content.text.trim())
    return {
      category: parsed.category ?? FALLBACK.category,
      colours: Array.isArray(parsed.colours) ? parsed.colours : [],
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags : [],
      suggestedName: parsed.suggestedName ?? FALLBACK.suggestedName,
    }
  } catch {
    return FALLBACK
  }
}
