import type { createServerClient } from '@/lib/supabase/server'
import type { TryOnImage } from '@/lib/fashn'
import { isExternalUrl, toObjectPath } from '@/lib/wardrobe-image'
import { isPubliclyFetchable } from '@/lib/ssrf'

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

export const TRY_ON_BUCKET = 'try-on-photos'
/** How long a private try-on link (try-on photo, worn photo, saved picture) opens, in seconds. */
export const TRY_ON_LINK_SECONDS = 300
const MAX_BYTES = 10 * 1024 * 1024

/** Why a photo could not be used, for the server log only. */
export type PhotoFailure = 'not_found' | 'too_big' | 'unreadable' | 'link_not_allowed' | 'link_failed'
type OnFail = (reason: PhotoFailure) => void

export function mediaTypeFromBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp'
  return 'image/jpeg'
}

function toImage(bytes: Uint8Array): TryOnImage {
  return { mediaType: mediaTypeFromBytes(bytes), base64: Buffer.from(bytes).toString('base64') }
}

/** Reads a stored object (the signed-in user's own, by row-level security). null when missing. */
async function downloadFrom(supabase: ServerClient, bucket: string, path: string, onFail?: OnFail): Promise<TryOnImage | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) { onFail?.('not_found'); return null }
  const bytes = new Uint8Array(await data.arrayBuffer())
  if (bytes.byteLength === 0) { onFail?.('unreadable'); return null }
  if (bytes.byteLength > MAX_BYTES) { onFail?.('too_big'); return null }
  return toImage(bytes)
}

/** The person's try-on photo, as bytes to send to FASHN. */
export function loadPersonPhoto(supabase: ServerClient, path: string, onFail?: OnFail): Promise<TryOnImage | null> {
  return downloadFrom(supabase, TRY_ON_BUCKET, path, onFail)
}

/** A wardrobe item's photo: our bucket, or a retailer image saved by link. null when unreadable. */
export async function loadGarmentPhoto(supabase: ServerClient, ref: string, onFail?: OnFail): Promise<TryOnImage | null> {
  if (!isExternalUrl(ref)) return downloadFrom(supabase, 'wardrobe-images', toObjectPath(ref), onFail)
  if (!isPubliclyFetchable(ref)) { onFail?.('link_not_allowed'); return null }
  const res = await fetch(ref, { headers: { Accept: 'image/*' } })
  if (!res.ok) { onFail?.('link_failed'); return null }
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_BYTES) { onFail?.('too_big'); return null }
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) { onFail?.('unreadable'); return null }
  if (bytes.byteLength > MAX_BYTES) { onFail?.('too_big'); return null }
  return toImage(bytes)
}
