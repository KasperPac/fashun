import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { removeBackground, PhotoroomError } from '@/lib/photoroom'
import { tagImage } from '@/lib/tagger'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const schema = z.object({ imageBase64: z.string().min(100) })

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid image' }, { status: 400 })

  // 1. Remove background via Photoroom
  let processedBase64: string
  try {
    processedBase64 = await removeBackground(parsed.data.imageBase64)
  } catch (err) {
    if (err instanceof PhotoroomError) {
      return NextResponse.json({ error: 'bg_removal_failed' }, { status: 502 })
    }
    throw err
  }

  // 2. Tag with Claude Vision (soft failure — returns fallback on error)
  const tags = await tagImage(processedBase64)

  // 3. Upload processed PNG to Supabase Storage
  const filename = `${user.id}/${randomUUID()}.png`
  const imageBytes = Buffer.from(processedBase64, 'base64')
  const { error: uploadError } = await supabase.storage
    .from('wardrobe-images')
    .upload(filename, imageBytes, { contentType: 'image/png', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('wardrobe-images')
    .getPublicUrl(filename)

  return NextResponse.json({
    processedImageUrl: publicUrl,
    category: tags.category,
    colours: tags.colours,
    styleTags: tags.styleTags,
    suggestedName: tags.suggestedName,
  })
}
