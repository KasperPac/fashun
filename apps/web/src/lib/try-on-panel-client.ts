import type { PanelProvider } from '@/lib/try-on-panel'
import { loadPhotoState } from '@/lib/try-on-photo-client'

/** The client stops waiting here (the server's own limit is also 90 seconds). */
export const PICTURE_TIMEOUT_MS = 90_000
/** The second step starts roughly here, so the status line moves on. FASHN gives no real progress. */
export const SECOND_STEP_AFTER_MS = 15_000
export const STILL_WORKING_AFTER_MS = 30_000

export const LOAD_FAILED = "Couldn't load your try-on."

export interface Picture {
  url: string
  /** ISO time the picture was made. */
  madeAt: string | null
}

export type PanelState =
  | { kind: 'off' }
  | { kind: 'error' }
  | { kind: 'ready'; hasPhoto: boolean; photoUrl: string | null; picture: Picture | null; paused: boolean; resumeOn: string | null; provider: PanelProvider }

export interface PanelApi {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
}

function parsePicture(json: { image_url?: unknown; made_at?: unknown }): Picture | null {
  return typeof json.image_url === 'string' ? { url: json.image_url, madeAt: typeof json.made_at === 'string' ? json.made_at : null } : null
}

/** The saved picture (free) and whether new pictures are paused, for an outfit that needs `images` FASHN images. "off" when try-on is switched off. */
export async function loadPanel(api: PanelApi, outfitId: string, images: 1 | 2): Promise<PanelState> {
  const photo = await loadPhotoState(api)
  if (photo.kind === 'off') return { kind: 'off' }
  if (photo.kind === 'error') return { kind: 'error' }
  if (photo.photoUrl === null) return { kind: 'ready', hasPhoto: false, photoUrl: null, picture: null, paused: false, resumeOn: null, provider: 'fashn' }
  try {
    const res = await api.fetch(`/api/outfits/try-on?outfit_id=${encodeURIComponent(outfitId)}&images=${images}`)
    if (res.status === 404) return { kind: 'off' }
    if (!res.ok) return { kind: 'error' }
    const json = (await res.json()) as { image_url?: unknown; made_at?: unknown; paused?: unknown; resume_on?: unknown; provider?: unknown }
    return {
      kind: 'ready',
      hasPhoto: true,
      photoUrl: photo.photoUrl,
      picture: parsePicture(json),
      paused: json.paused === true,
      resumeOn: typeof json.resume_on === 'string' ? json.resume_on : null,
      provider: json.provider === 'gemini' ? 'gemini' : 'fashn',
    }
  } catch {
    return { kind: 'error' }
  }
}

export type RunResult =
  | { kind: 'picture'; picture: Picture }
  | { kind: 'paused'; resumeOn: string | null }
  /** The person hasn't agreed to the current privacy note: show it, and ask again once they agree. Nothing was sent or charged. */
  | { kind: 'consent' }
  | { kind: 'failed' }
  /** No answer from the server (connection dropped or the wait ended): the picture may still be made. Never "nothing was charged". */
  | { kind: 'lost' }

/**
 * Asks for a picture. A saved picture is free; `regenerate` makes a new one. The wait ends at 90
 * seconds. If the connection drops or the wait ends, one look at the saved picture tells whether
 * the server finished anyway. If that look finds nothing new (or can't be made), the result is
 * 'lost', not 'failed': we can't know whether a picture was made or charged. Only an answer from
 * the server saying it failed is 'failed'. Nothing here ever sends a second POST. `previousMadeAt` is the picture's date before this request.
 */
export async function makePicture(
  api: PanelApi,
  outfitId: string,
  opts: { regenerate: boolean; previousMadeAt: string | null },
): Promise<RunResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PICTURE_TIMEOUT_MS)
  try {
    const res = await api.fetch('/api/outfits/try-on', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outfit_id: outfitId, regenerate: opts.regenerate }),
      signal: controller.signal,
    })
    const json = (await res.json().catch(() => null)) as { image_url?: unknown; made_at?: unknown; code?: unknown; resume_on?: unknown } | null
    if (res.ok && json) {
      const picture = parsePicture(json)
      return picture ? { kind: 'picture', picture } : { kind: 'failed' }
    }
    if (res.status === 409 && json?.code === 'CAP_REACHED') {
      return { kind: 'paused', resumeOn: typeof json.resume_on === 'string' ? json.resume_on : null }
    }
    if (res.status === 400 && json?.code === 'CONSENT_REQUIRED') return { kind: 'consent' }
    return { kind: 'failed' }
  } catch {
    return recover(api, outfitId, opts.previousMadeAt)
  } finally {
    clearTimeout(timer)
  }
}

export type CheckResult = { kind: 'picture'; picture: Picture } | { kind: 'none' } | { kind: 'unreachable' }

/** One look (GET, free) at the outfit's saved picture: is there one newer than `previousMadeAt`? */
export async function checkPicture(api: PanelApi, outfitId: string, previousMadeAt: string | null): Promise<CheckResult> {
  try {
    const res = await api.fetch(`/api/outfits/try-on?outfit_id=${encodeURIComponent(outfitId)}`)
    if (!res.ok) return { kind: 'unreachable' }
    const picture = parsePicture((await res.json()) as { image_url?: unknown; made_at?: unknown })
    return picture && picture.madeAt !== previousMadeAt ? { kind: 'picture', picture } : { kind: 'none' }
  } catch {
    return { kind: 'unreachable' }
  }
}

/** The saved picture again with a fresh address (free GET, never a new try-on), for when its image failed to load. Null if it can't be had right now. */
export async function reloadPicture(api: PanelApi, outfitId: string): Promise<Picture | null> {
  const found = await checkPicture(api, outfitId, null)
  return found.kind === 'picture' ? found.picture : null
}

/** Runs `handler` each time the phone comes back online. Returns the function that stops listening. */
export function whenOnline(handler: () => void, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window): () => void {
  target.addEventListener('online', handler)
  return () => target.removeEventListener('online', handler)
}

async function recover(api: PanelApi, outfitId: string, previousMadeAt: string | null): Promise<RunResult> {
  const found = await checkPicture(api, outfitId, previousMadeAt)
  return found.kind === 'picture' ? found : { kind: 'lost' }
}

/** Lets only one picture request run at a time: a second tap while one is running does nothing. */
export function createRunner(api: PanelApi) {
  let running = false
  return {
    start(outfitId: string, opts: { regenerate: boolean; previousMadeAt: string | null }): Promise<RunResult> | null {
      if (running) return null
      running = true
      return makePicture(api, outfitId, opts).finally(() => { running = false })
    },
  }
}

/** The status line under the picture while it is made. */
export function progressLines(images: 1 | 2, elapsedMs: number): { status: string; stillWorking: boolean } {
  const status = images === 2
    ? (elapsedMs < SECOND_STEP_AFTER_MS ? 'Putting on your top… (1 of 2)' : 'Adding your bottoms… (2 of 2)')
    : 'Putting it on you…'
  return { status, stillWorking: elapsedMs >= STILL_WORKING_AFTER_MS }
}
