import Anthropic from '@anthropic-ai/sdk'
import { mediaTypeFromBase64 } from './image-media-type'
import { logClaudeError, logClaudeFailure } from './claude-log'
import { extractJson } from './extract-json'
import { WornBoxSchema, TuckedSchema, type WornFit } from './worn-crop'

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
  return `This photo shows a person wearing several pieces of clothing. Look at ONE item only: ${describeItem(item)}. Find that item in the photo and ignore every other garment, shoe and accessory the person wears, even if it is more visible.
Reply with JSON only, no markdown, in exactly this shape:
{"notes": string or null, "box": {"left": number, "top": number, "right": number, "bottom": number} or null, "tucked": "tucked" or "untucked" or "unclear"}
- notes: short fit notes about that item only: how loose or slim it is, its length, where the sleeves or hem fall, cuffs rolled, buttoned or open, as far as they apply to that kind of item. Do not mention tucking in the notes. Never mention or judge the person's body, weight, shape, age, skin, face or anything else about them. Plain short sentences, at most 3, no lists. null if you cannot tell how it fits.
- box: where that item is, as fractions of the photo from its top left corner (0 to 1; left, top, right and bottom edges). Cover only that item: for trousers, skirts and shorts end at the ankle and leave out shoes; for a top, cover the top itself. null if the item is not visible.
- tucked: for a top, whether it is tucked into the bottoms. "unclear" for anything that is not a top, or if you cannot tell.`
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

/** What the worn photo told us about its item: short notes, where the item is, and whether it is tucked. */
export interface FitReading { notes: string | null; fit: WornFit }

/** Reads the model's JSON reply. A box or tucked field that isn't in the expected shape is dropped, never guessed. null when nothing usable. */
export function parseFitReading(raw: string): FitReading | null {
  const json = extractJson<Record<string, unknown>>(raw, 'object')
  if (!json || typeof json !== 'object') return null
  const notes = typeof json.notes === 'string' ? cleanFitNotes(json.notes) : null
  const box = WornBoxSchema.safeParse(json.box)
  const tucked = TuckedSchema.safeParse(json.tucked)
  const fit: WornFit = { box: box.success ? box.data : null, tucked: tucked.success ? tucked.data : 'unclear' }
  if (!notes && !fit.box) return null
  return { notes, fit }
}

/** The notes sent with a try-on. Tucking comes only from the stored field: nothing is said when it is unclear. */
export function notesWithTucking(notes: string | null, tucked: WornFit['tucked'] | null): string | null {
  const line = tucked === 'tucked' ? 'Worn tucked in.' : tucked === 'untucked' ? 'Worn untucked.' : null
  return [notes?.trim(), line].filter(Boolean).join(' ') || null
}

/**
 * The reading for the named item only, from a worn photo (base64), or null. A failure is silent to the person and
 * logs a fixed reason only: never the photo, the model's text or anything about the user.
 */
export async function makeFitNotes(imageBase64: string, item: FitNotesItem): Promise<FitReading | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
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
    const reading = parseFitReading(content.text)
    if (!reading) logClaudeFailure('fit-notes', 'no usable notes')
    return reading
  } catch (err) {
    logClaudeError('fit-notes', err)
    return null
  }
}
