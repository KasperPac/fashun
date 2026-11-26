import { NextResponse } from 'next/server'
import { mediaTypeFromBytes } from '@/lib/try-on-images'

const MAX_BYTES = 10 * 1024 * 1024

export type PhotoUpload = { ok: true; bytes: Uint8Array; mediaType: string } | { ok: false; response: NextResponse }

/** Reads and checks the `file` field of an upload: a real JPEG, PNG or WebP under 10 MB. */
export async function readPhotoUpload(form: FormData | null): Promise<PhotoUpload> {
  const file = form?.get('file')
  if (!(file instanceof File)) return { ok: false, response: NextResponse.json({ error: 'Choose a photo' }, { status: 400 }) }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return { ok: false, response: NextResponse.json({ error: 'The photo must be under 10 MB', code: 'BAD_PHOTO' }, { status: 400 }) }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const mediaType = file.type === 'image/png' || file.type === 'image/webp' || (file.type === 'image/jpeg' && isJpeg)
    ? mediaTypeFromBytes(bytes)
    : null
  if (!mediaType || mediaType !== file.type) {
    return { ok: false, response: NextResponse.json({ error: 'Use a JPEG, PNG or WebP photo', code: 'BAD_PHOTO' }, { status: 400 }) }
  }
  return { ok: true, bytes, mediaType }
}
