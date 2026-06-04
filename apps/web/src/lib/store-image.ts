import { randomUUID } from 'crypto'
import type { createServerClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

/** Fetches an image by URL and uploads it to the wardrobe-images bucket. Returns the object path (`{userId}/{uuid}.ext`). */
export async function uploadImageFromUrl(
  supabase: ServerClient,
  imageUrl: string,
  userId: string,
): Promise<string> {
  const res = await fetch(imageUrl, { headers: { Accept: 'image/*' } })
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`)

  const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_BYTES) throw new Error('Image too large')

  const contentType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) throw new Error('Image too large')
  const filename = `${userId}/${randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('wardrobe-images')
    .upload(filename, bytes, { contentType, upsert: false })
  if (error) throw new Error(`Upload failed: ${error.message}`)

  return filename
}
