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
