import Anthropic from '@anthropic-ai/sdk'
import { mediaTypeFromBase64 } from './image-media-type'
import { logClaudeError, logClaudeFailure } from './claude-log'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const FIT_NOTES_MAX_CHARS = 400

export interface FitNotesItem { name: string; category: string }

/** Names the one item the notes are about, as plain text. Quotes and control characters are removed so a name can't act as an instruction. */
function describeItem(item: FitNotesItem): string {
  const clean = (v: string, max: number) => v.replace(/[\u0000-\u001f\u007f"]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  const name = clean(item.name, 80)
  const category = clean(item.category, 30)
  return [name && `"${name}"`, category && `(category: ${category})`].filter(Boolean).join(' ') || 'the named item'
}

export function fitNotesPrompt(item: FitNotesItem): string {
  return `This photo shows a person wearing several pieces of clothing. Write short fit notes about ONE item only: ${describeItem(item)}. Find that item in the photo and ignore every other garment, shoe and accessory the person wears, even if it is more visible.
Describe how that item fits: how loose or slim it is, its length, where the sleeves or hem fall, and how it is worn (tucked or untucked, cuffs rolled, buttoned or open), as far as they apply to that kind of item.
Rules: describe only that item. Never mention or judge the person's body, weight, shape, age, skin, face or anything else about them. Use plain short sentences, at most 3, no lists, no markdown.
Reply with the notes only. If that item is not visible or you cannot tell how it fits, reply with exactly: NONE`
}

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
 * Fit notes for the named item only, from a worn photo (base64), or null. A failure is silent to the person and
 * logs a fixed reason only: never the photo, the model's text or anything about the user.
 */
export async function makeFitNotes(imageBase64: string, item: FitNotesItem): Promise<string | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaTypeFromBase64(imageBase64), data: imageBase64 } },
          { type: 'text', text: fitNotesPrompt(item) },
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
