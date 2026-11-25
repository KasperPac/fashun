/**
 * One-request try-on with Google's Gemini image model: the person's photo and every garment
 * photo go in together as base64 (never links) and one picture comes back as base64.
 * Same TryOnImage in and out as fashn.ts. Docs: https://ai.google.dev/gemini-api/docs/image-generation
 */
import type { TryOnImage } from '@/lib/fashn'
import type { GarmentKind } from '@/lib/try-on'

export const GEMINI_MODEL = 'gemini-nano-banana-2.1'
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'
/**
 * Spike timings (KAS-692): 17-23 s typical, one slow call of 46 s. Gives up well after that and
 * inside the route's 90 second limit, which also covers reading the photos and saving the picture.
 */
export const GEMINI_TIMEOUT_MS = 65_000

export class ImageTryOnError extends Error {}

/** Gemini did not answer in time. A separate type so the log can name the reason without logging Gemini's text. */
export class ImageTryOnTimeoutError extends ImageTryOnError {}

const KIND_TEXT: Record<GarmentKind, string> = {
  top: 'a top',
  bottom: 'bottoms',
  'one-piece': 'a dress or jumpsuit',
  outerwear: 'a jacket or coat, worn over the top',
  shoes: 'shoes',
}

/** The instruction text. Says what each picture shows by kind only, never by the person's own labels. */
export function tryOnPrompt(kinds: GarmentKind[]): string {
  const shown = kinds.map((k, i) => `picture ${i + 2} is ${KIND_TEXT[k]}`).join('; ')
  return (
    "Edit the first picture, which shows a person. Keep the person's face, body, pose and background exactly as they are. " +
    `Dress the person in the garments shown in the other pictures (${shown}). ` +
    "Keep each garment's colour, pattern, fabric and hardware (buttons, belt loops, pockets, zips) exactly as photographed. " +
    'Dress them naturally: tuck or untuck each garment as it suits. ' +
    "Keep the person's own shoes exactly as they are in the first picture unless shoes are shown in the other pictures. " +
    'Return one photo-realistic picture of the person wearing the outfit.'
  )
}

interface GeminiPart { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }
interface GeminiResponse { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> }

/** The address Gemini is called at: GEMINI_BASE_URL, or Google's own. */
export function geminiBaseUrl(): string {
  return (process.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

/** Draws the whole outfit onto the person in one request. Throws ImageTryOnError on failure or timeout; its message never holds Gemini's text. */
export async function runImageTryOn(args: {
  person: TryOnImage
  garments: Array<TryOnImage & { kind: GarmentKind }>
  apiKey: string
  timeoutMs?: number
}): Promise<TryOnImage> {
  const parts: unknown[] = [{ text: tryOnPrompt(args.garments.map((g) => g.kind)) }]
  for (const img of [args.person, ...args.garments]) {
    parts.push({ inline_data: { mime_type: img.mediaType, data: img.base64 } })
  }

  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new ImageTryOnTimeoutError('Try-on timed out'))
    }, args.timeoutMs ?? GEMINI_TIMEOUT_MS)
  })

  const call = async (): Promise<TryOnImage> => {
    let res: Response
    try {
      res = await fetch(`${geminiBaseUrl()}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': args.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'] } }),
        signal: controller.signal,
      })
    } catch {
      throw new ImageTryOnError('Try-on request failed')
    }
    if (!res.ok) throw new ImageTryOnError('Try-on was refused')
    const json = (await res.json().catch(() => ({}))) as GeminiResponse
    for (const part of json.candidates?.[0]?.content?.parts ?? []) {
      const data = part.inlineData?.data ?? part.inline_data?.data
      if (data) return { mediaType: part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png', base64: data }
    }
    throw new ImageTryOnError('Try-on returned no picture')
  }

  try {
    return await Promise.race([call(), timeout])
  } finally {
    clearTimeout(timer)
  }
}
