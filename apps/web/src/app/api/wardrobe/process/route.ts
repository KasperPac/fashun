import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { tagImage } from '@/lib/tagger'
import { searchProduct } from '@/lib/product-search'
import type { ProductCandidate } from '@/lib/product-search'
import { signWardrobeImage } from '@/lib/wardrobe-image'
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

  // 1. Use original image (Photoroom bg removal disabled — add PHOTOROOM_API_KEY to enable)
  const processedBase64 = parsed.data.imageBase64

  // 2. Tag with Claude Vision (soft failure — returns fallback on error)
  const tags = await tagImage(processedBase64)

  // 3. Upload to Supabase Storage
  // Detect format from base64 header (JPEG starts with /9j, PNG with iVBOR)
  const isJpeg = processedBase64.startsWith('/9j') || processedBase64.startsWith('data:image/jpeg')
  const ext = isJpeg ? 'jpg' : 'png'
  const contentType = isJpeg ? 'image/jpeg' : 'image/png'
  const filename = `${user.id}/${randomUUID()}.${ext}`
  const imageBytes = Buffer.from(processedBase64, 'base64')
  const { error: uploadError } = await supabase.storage
    .from('wardrobe-images')
    .upload(filename, imageBytes, { contentType, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  // Private bucket: return a short-lived signed URL for the confirm preview.
  // The saved value is normalized to the object path by POST /api/wardrobe.
  const processedImageUrl = await signWardrobeImage(supabase, filename, 3600)

  // 4. If Vision identified the item, find candidate stock images (soft-fail to []).
  let candidates: ProductCandidate[] = []
  if (tags.searchQuery) {
    try {
      candidates = await searchProduct(tags.searchQuery, '')
    } catch {
      candidates = []
    }
  }

  return NextResponse.json({
    processedImageUrl,
    category: tags.category,
    colours: tags.colours,
    styleTags: tags.styleTags,
    suggestedName: tags.suggestedName,
    searchQuery: tags.searchQuery,
    candidates,
  })
}
