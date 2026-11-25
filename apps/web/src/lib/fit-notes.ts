import Anthropic from '@anthropic-ai/sdk'
import { mediaTypeFromBase64 } from './image-media-type'
import { logClaudeError, logClaudeFailure } from './claude-log'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const FIT_NOTES_MAX_CHARS = 400

const PROMPT = `This photo shows a person wearing one piece of clothing. Write short fit notes about the garment only: how loose or slim it is, its length, where the sleeves or hem fall, and how it is worn (tucked or untucked, cuffs rolled, buttoned or open).
Rules: describe only the garment. Never mention or judge the person's body, weight, shape, age, skin, face or anything else about them. Use plain short sentences, at most 3, no lists, no markdown.
Reply with the notes only. If you cannot tell how the garment fits, reply with exactly: NONE`

/** Tidies the model's reply into plain short text. null when there is nothing usable. */
export function cleanFitNotes(raw: string): string | null {
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text || /^none\.?$/i.test(text)) return null
  if (text.length <= FIT_NOTES_MAX_CHARS) return text
  const cut = text.slice(0, FIT_NOTES_MAX_CHARS)
  const lastStop = cut.lastIndexOf('.')
  return lastStop > 0 ? cut.slice(0, lastStop + 1) : cut.trimEnd()
}

/**
 * Garment-only fit notes from a worn photo (base64), or null. A failure is silent to the person and
 * logs a fixed reason only: never the photo, the model's text or anything about the user.
 */
export async function makeFitNotes(imageBase64: string): Promise<string | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaTypeFromBase64(imageBase64), data: imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    })
    const content = message.content[0]
    if (!content || content.type !== 'text') {
      logClaudeFailure('fit-notes', 'no text in reply')
      return null
    }
    const notes = cleanFitNotes(content.text)
    if (!notes) logClaudeFailure('fit-notes', 'no usable notes')
    return notes
  } catch (err) {
    logClaudeError('fit-notes', err)
    return null
  }
}
