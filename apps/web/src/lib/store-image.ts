import { randomUUID } from 'crypto'
import type { createServerClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

/** Fetches an image by URL and uploads it to the wardrobe-images bucket. Returns the public URL. */
export async function uploadImageFromUrl(
  supabase: ServerClient,
  imageUrl: string,
  userId: string,
): Promise<string> {
  const res = await fetch(imageUrl, { headers: { Accept: 'image/*' } })
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`)

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const bytes = Buffer.from(await res.arrayBuffer())
  const filename = `${userId}/${randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('wardrobe-images')
    .upload(filename, bytes, { contentType, upsert: false })
  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data } = supabase.storage.from('wardrobe-images').getPublicUrl(filename)
  return data.publicUrl
}
