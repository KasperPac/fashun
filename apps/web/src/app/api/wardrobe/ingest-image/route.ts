import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { uploadImageFromUrl } from '@/lib/store-image'
import { signWardrobeImage } from '@/lib/wardrobe-image'
import { isPubliclyFetchable } from '@/lib/ssrf'
import { z } from 'zod'

const Schema = z.object({ imageUrl: z.string().url() })

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Provide an imageUrl' }, { status: 400 })
  if (!isPubliclyFetchable(parsed.data.imageUrl)) {
    return NextResponse.json({ error: 'That URL cannot be fetched' }, { status: 400 })
  }

  try {
    const path = await uploadImageFromUrl(supabase, parsed.data.imageUrl, user.id)
    const imageUrl = await signWardrobeImage(supabase, path, 3600)
    return NextResponse.json({ imageUrl, path })
  } catch (err) {
    console.error('[ingest-image] failed', parsed.data.imageUrl, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not ingest that image' }, { status: 502 })
  }
}
