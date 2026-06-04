import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { signWardrobeImage } from '@/lib/wardrobe-image'
import { z } from 'zod'

const FASHN_BASE = 'https://api.fashn.ai/v1'

const BodySchema = z.object({ item_id: z.string().uuid() })

const CATEGORY_MAP: Record<string, string> = {
  tops: 'tops',
  bottoms: 'bottoms',
  dresses: 'one-pieces',
  jumpsuits: 'one-pieces',
  outerwear: 'tops',
}

const UNSUPPORTED_CATEGORIES = new Set(['shoes', 'bags', 'accessories'])

async function pollFashn(predictionId: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${FASHN_BASE}/status/${predictionId}`, {
      headers: { Authorization: `Bearer ${process.env.FASHN_API_KEY}` },
    })
    const json = await res.json() as { status: string; output?: string[]; error?: string }
    if (json.status === 'completed' && json.output?.[0]) return json.output[0]
    if (json.status === 'failed') throw new Error(json.error ?? 'Render failed')
  }
  throw new Error('Try-on timed out after 60s')
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const [itemRes, profileRes] = await Promise.all([
    (supabase.from('wardrobe_items').select('image_url,category').eq('id', parsed.data.item_id).eq('user_id', user.id).single() as unknown as Promise<{ data: { image_url: string | null; category: string } | null; error: unknown }>),
    (supabase.from('users').select('try_on_photo_url').eq('id', user.id).single() as unknown as Promise<{ data: { try_on_photo_url: string | null } | null; error: unknown }>),
  ])

  if (!itemRes.data?.image_url) {
    return NextResponse.json({ error: 'Add a photo to this item to enable try-on', code: 'NO_ITEM_PHOTO' }, { status: 400 })
  }
  if (!profileRes.data?.try_on_photo_url) {
    return NextResponse.json({ error: 'No try-on photo found — add one in your profile settings', code: 'NO_PERSON_PHOTO' }, { status: 400 })
  }

  if (UNSUPPORTED_CATEGORIES.has(itemRes.data.category)) {
    return NextResponse.json(
      { error: 'Try-on is not supported for this item type', code: 'UNSUPPORTED_CATEGORY' },
      { status: 400 }
    )
  }

  const garmentImage = await signWardrobeImage(supabase, itemRes.data.image_url!, 600)
  if (!garmentImage) {
    return NextResponse.json({ error: 'Could not access item image', code: 'IMAGE_UNAVAILABLE' }, { status: 500 })
  }

  try {
    const runRes = await fetch(`${FASHN_BASE}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.FASHN_API_KEY}`,
      },
      body: JSON.stringify({
        model_image: profileRes.data.try_on_photo_url,
        garment_image: garmentImage,
        category: CATEGORY_MAP[itemRes.data.category] ?? 'tops',
      }),
    })

    const runJson = await runRes.json() as { id?: string; error?: string }
    if (!runJson.id) throw new Error(runJson.error ?? 'Failed to start try-on')

    const imageUrl = await pollFashn(runJson.id)
    return NextResponse.json({ image_url: imageUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Try-on failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
