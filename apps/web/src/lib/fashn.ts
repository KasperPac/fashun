/**
 * FASHN Try-On v1.6. Photos go in as base64 (never as links, so FASHN's request log
 * holds no link to a person's photo) and the result comes back as base64 too.
 * Docs: https://docs.fashn.ai/api-reference/tryon-v1-6
 */
const FASHN_BASE = 'https://api.fashn.ai/v1'
const POLL_MS = 2000
/** Per picture. A two-step outfit stays inside the 90 second route limit. */
const STEP_TIMEOUT_MS = 40_000

export class FashnError extends Error {}

export interface TryOnImage {
  mediaType: string
  base64: string
}

export function toDataUri(image: TryOnImage): string {
  return `data:${image.mediaType};base64,${image.base64}`
}

function fromDataUri(value: string): TryOnImage {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(value)
  if (!m) throw new FashnError('Unexpected try-on result')
  return { mediaType: m[1], base64: m[2] }
}

function errorText(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message
  return 'Try-on failed'
}

interface RunResponse { id?: string; error?: unknown }
interface StatusResponse { status?: string; output?: string[]; error?: unknown }

/** Draws one garment onto the person. Throws FashnError on failure or timeout. */
export async function runTryOn(args: {
  person: TryOnImage
  garment: TryOnImage
  category: 'tops' | 'bottoms' | 'one-pieces'
  apiKey: string
}): Promise<TryOnImage> {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${args.apiKey}` }

  const runRes = await fetch(`${FASHN_BASE}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model_name: 'tryon-v1.6',
      inputs: {
        model_image: toDataUri(args.person),
        garment_image: toDataUri(args.garment),
        category: args.category,
        return_base64: true,
      },
    }),
  })
  const run = await runRes.json().catch(() => ({})) as RunResponse
  if (!runRes.ok || !run.id) throw new FashnError(errorText(run.error))

  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    const res = await fetch(`${FASHN_BASE}/status/${run.id}`, { headers: { Authorization: headers.Authorization } })
    const status = await res.json().catch(() => ({})) as StatusResponse
    if (status.status === 'completed' && status.output?.[0]) return fromDataUri(status.output[0])
    if (status.status === 'failed') throw new FashnError(errorText(status.error))
  }
  throw new FashnError('Try-on timed out')
}
