import type { createServerClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

const BUCKET = 'wardrobe-images'
const MARKER = `/${BUCKET}/`

/**
 * Reduces a public URL, signed URL, or bare path to the bucket object path
 * `{userId}/{uuid}.ext`. Handles /object/public/ and /object/sign/ forms and
 * strips any query string (e.g. ?token=).
 */
export function toObjectPath(value: string): string {
  const i = value.indexOf(MARKER)
  let path = i >= 0 ? value.slice(i + MARKER.length) : value
  const q = path.indexOf('?')
  if (q >= 0) path = path.slice(0, q)
  return path
}

/** True for a full http(s) URL that does NOT point at our wardrobe-images bucket
 *  (i.e. an external/retailer image saved directly, not a bucket object). */
export function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && !value.includes(MARKER)
}

/**
 * Generates a signed URL for a wardrobe-images object. Accepts a path or any
 * URL form (normalized internally). Returns null on failure.
 * External URLs (not pointing at our bucket) are returned as-is without signing.
 */
export async function signWardrobeImage(
  supabase: ServerClient,
  value: string,
  expiresIn: number,
): Promise<string | null> {
  if (isExternalUrl(value)) return value
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(toObjectPath(value), expiresIn)
  if (error || !data) return null
  return data.signedUrl
}
