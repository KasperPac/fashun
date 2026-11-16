import Anthropic from '@anthropic-ai/sdk'
import { sanitiseOccasionTags, type OccasionTag, type WardrobeCategory } from '@fashun/shared'
import { extractJson } from './extract-json'
import { mediaTypeFromBase64 } from './image-media-type'
import { logClaudeError, logClaudeFailure } from './claude-log'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface TagResult {
  isClothing: boolean // false when the photo isn't a piece of clothing, footwear, a bag or an accessory
  category: WardrobeCategory
  colours: string[]   // hex codes
  styleTags: string[]
  occasionTags: OccasionTag[]  // always at least one
  suggestedName: string
  searchQuery: string  // product search query if identifiable, else ''
}

const CATEGORIES: WardrobeCategory[] = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']

function occasionsOrDefault(value: unknown): OccasionTag[] {
  const tags = sanitiseOccasionTags(value)
  return tags.length ? tags : FALLBACK.occasionTags
}

const FALLBACK: TagResult = {
  isClothing: true,
  category: 'tops',
  colours: [],
  styleTags: [],
  occasionTags: ['casual'],
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
  "isClothing": true if the photo shows a piece of clothing, footwear, a bag or an accessory; false if it shows something else (a person with no item in focus, food, a pet, a room, a screenshot),
  "category": "tops|bottoms|shoes|outerwear|bags|accessories",
  "colours": ["#hexcode1", "#hexcode2"],
  "styleTags": ["casual|smart-casual|business|streetwear|minimalist|athleisure|bohemian|glam"],
  "occasionTags": ["one or more of: casual|smart-casual|work|formal"],
  "suggestedName": "Short descriptive name e.g. Navy Linen Shirt",
  "searchQuery": "If you can identify the specific product (brand + model), a concise web search query e.g. 'Timberland 6-inch premium boots'. Empty string if you cannot identify it."
}
No markdown, no explanation, just the JSON.`,
          },
        ],
      }],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      logClaudeFailure('tagger', 'no text in reply')
      return FALLBACK
    }
    // The model may wrap the JSON in prose/a fence; extract the object out of it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = extractJson<any>(content.text, 'object')
    if (!parsed) {
      logClaudeFailure('tagger', 'no JSON in reply')
      return FALLBACK
    }
    return {
      isClothing: parsed.isClothing !== false,
      category: CATEGORIES.includes(parsed.category) ? parsed.category : FALLBACK.category,
      colours: Array.isArray(parsed.colours) ? parsed.colours : [],
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags : [],
      occasionTags: occasionsOrDefault(parsed.occasionTags),
      suggestedName: parsed.suggestedName ?? FALLBACK.suggestedName,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
    }
  } catch (err) {
    logClaudeError('tagger', err)
    return FALLBACK
  }
}
