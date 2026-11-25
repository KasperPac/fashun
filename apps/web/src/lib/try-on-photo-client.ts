import { formatUsd, toUnits } from '@/lib/try-on'

/**
 * DRAFT wording for the Gemini provider (KAS-693), from the Researcher's facts (KAS-652). The
 * Product Owner signs off the final text; until then this is not final.
 */
export const PRIVACY_NOTE =
  'To show clothes on you, Fashun sends this photo and your clothing photos to Google, whose Gemini AI makes your picture. Google doesn\'t use them to train its AI. It keeps them for up to 55 days to check for misuse, and may process them in any country. Fashun keeps your photo and your try-on pictures privately in your account until you delete them. You can delete them at any time under Profile. Try-on is for people aged 18 and over.'

/** Which privacy note a person agreed to. Agreeing to an earlier note (the FASHN one has no version) doesn't count: they agree again. */
export const PRIVACY_NOTE_VERSION = 'gemini-1'

/** True when the person has agreed to the current privacy note. */
export function hasAgreed(profile: { try_on_consent_at?: string | null; try_on_consent_note?: string | null } | null | undefined): boolean {
  return !!profile?.try_on_consent_at && profile.try_on_consent_note === PRIVACY_NOTE_VERSION
}

/** Where the person's own try-on photo lives; an item's worn photo is at {@link wornPhotoUrl}. */
export const TRY_ON_PHOTO_URL = '/api/try-on/photo'

/** The address of one wardrobe item's "photo of me wearing it". */
export const wornPhotoUrl = (itemId: string) => `/api/wardrobe/${encodeURIComponent(itemId)}/worn-photo`

export const UPLOAD_FAILED = "Couldn't add your photo. Check your connection and try again."
export const BAD_PHOTO = "That file isn't a photo we can use. Choose a JPG or PNG photo."
export const DELETE_FAILED = "Couldn't delete your photo. Try again."
export const LOAD_FAILED = "Couldn't load your try-on photo."
export const WORN_LOAD_FAILED = "Couldn't load your photo."
export const CONSENT_FAILED = "Couldn't save that. Check your connection and try again."

/** Long edge of the photo sent to the server, in px. */
export const PHOTO_MAX_EDGE = 1536

export type PhotoState =
  | { kind: 'off' }
  | { kind: 'error' }
  | { kind: 'ready'; photoUrl: string | null; consented: boolean; fitNotes?: string | null }

export interface PhotoApi {
  fetch: typeof fetch
  /** Shrinks the picked file to a JPEG. Rejects when it isn't a readable image. */
  resize: (file: File) => Promise<Blob>
}

/** Reads the person's photo state. "off" when try-on is switched off (the section is then not shown). */
export async function loadPhotoState(api: { fetch: (input: string) => Promise<Response> }, url = TRY_ON_PHOTO_URL): Promise<PhotoState> {
  try {
    const res = await api.fetch(url)
    if (res.status === 404) return { kind: 'off' }
    if (!res.ok) return { kind: 'error' }
    const json: unknown = await res.json()
    if (typeof json !== 'object' || json === null) return { kind: 'error' }
    const { image_url, consented, fit_notes } = json as { image_url?: unknown; consented?: unknown; fit_notes?: unknown }
    return {
      kind: 'ready',
      photoUrl: typeof image_url === 'string' ? image_url : null,
      consented: consented === true,
      ...(typeof fit_notes === 'string' && fit_notes.trim() ? { fitNotes: fit_notes } : {}),
    }
  } catch {
    return { kind: 'error' }
  }
}

/** The owner row's value, e.g. "US$3.15 of US$7.50". null for anyone else (the address answers 404). */
export async function loadSpendLine(api: Pick<PhotoApi, 'fetch'>): Promise<string | null> {
  try {
    const res = await api.fetch('/api/try-on/spend')
    if (!res.ok) return null
    const json = (await res.json()) as { spent_usd?: unknown; cap_usd?: unknown }
    if (typeof json.spent_usd !== 'number') return null
    const spent = formatUsd(toUnits(json.spent_usd))
    return typeof json.cap_usd === 'number' ? `${spent} of ${formatUsd(toUnits(json.cap_usd))}` : spent
  } catch {
    return null
  }
}

/** "I agree": saves the agreement on the account. */
export async function recordConsent(api: Pick<PhotoApi, 'fetch'>): Promise<boolean> {
  try {
    return (await api.fetch('/api/try-on/photo', { method: 'PUT' })).ok
  } catch {
    return false
  }
}

export type UploadResult = { ok: true } | { ok: false; message: string }

/** Shrinks the photo on the device, then adds or replaces it. */
export async function uploadPhoto(file: File, api: PhotoApi, url = TRY_ON_PHOTO_URL): Promise<UploadResult> {
  let blob: Blob
  try {
    blob = await api.resize(file)
  } catch {
    return { ok: false, message: BAD_PHOTO }
  }
  const form = new FormData()
  form.set('file', new File([blob], 'try-on.jpg', { type: 'image/jpeg' }))
  try {
    const res = await api.fetch(url, { method: 'POST', body: form })
    if (res.ok) return { ok: true }
    const json = (await res.json().catch(() => null)) as { code?: unknown } | null
    return { ok: false, message: json?.code === 'BAD_PHOTO' ? BAD_PHOTO : UPLOAD_FAILED }
  } catch {
    return { ok: false, message: UPLOAD_FAILED }
  }
}

/** Deletes the photo and every try-on picture made from it (or, with an item's worn-photo address, that one photo). */
export async function deletePhoto(api: Pick<PhotoApi, 'fetch'>, url = TRY_ON_PHOTO_URL): Promise<boolean> {
  try {
    return (await api.fetch(url, { method: 'DELETE' })).ok
  } catch {
    return false
  }
}

/** Which sheet step Add photo / Replace opens: the privacy note until the person has agreed, then straight to take or choose. */
export function firstSheetStep(consented: boolean): 'privacy' | 'pick' {
  return consented ? 'pick' : 'privacy'
}
