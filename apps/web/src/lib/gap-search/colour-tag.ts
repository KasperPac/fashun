import Anthropic from '@anthropic-ai/sdk'
import { extractJson } from '../extract-json'
import { mediaTypeFromBase64 } from '../image-media-type'
import { logClaudeError } from '../claude-log'
import { isPubliclyFetchable } from '../ssrf'
import { isHex, type ColourTagger } from './colour'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TIMEOUT_MS = 5_000

/** Same model and size limit as wardrobe tagging (lib/tagger.ts). */
const MODEL = 'claude-haiku-4-5-20251001'

async function loadPhoto(url: string): Promise<string> {
  if (!url.startsWith('https://') || !isPubliclyFetchable(url)) throw new Error('photo address not allowed')
  const res = await fetch(url, { headers: { Accept: 'image/*' }, redirect: 'error', signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) })
  if (!res.ok) throw new Error('photo could not be fetched')
  if (Number(res.headers.get('content-length') ?? 0) > MAX_PHOTO_BYTES) throw new Error('photo too large')
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) throw new Error('photo unreadable')
  return bytes.toString('base64')
}

const PROMPT = `Look at this product photo of one clothing item. Return ONLY valid JSON:
{
  "mainColour": "#hexcode of the main colour of the item itself (ignore the background, a model's skin and any other item)",
  "sure": true if one colour clearly covers most of the item; false if you are not sure,
  "multiColour": true if the item has a pattern, print, stripes or two or more strong colours
}
No markdown, no explanation, just the JSON.`

/**
 * The live tagger: the AI reads the main colour from the item's photo. Returns null for an unsure
 * or multi-colour reading. Throws when the photo or the AI call fails.
 */
export const tagPhotoColour: ColourTagger = async (imageUrl) => {
  const imageBase64 = await loadPhoto(imageUrl)
  let reading: unknown
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaTypeFromBase64(imageBase64), data: imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    })
    const content = message.content[0]
    reading = content?.type === 'text' ? extractJson<Record<string, unknown>>(content.text, 'object') : null
  } catch (err) {
    logClaudeError('gap-colour', err)
    throw new Error('colour tagging failed')
  }
  const r = reading as { mainColour?: unknown; sure?: unknown; multiColour?: unknown } | null
  if (!r || r.sure !== true || r.multiColour === true || !isHex(r.mainColour)) return null
  return r.mainColour.trim()
}
