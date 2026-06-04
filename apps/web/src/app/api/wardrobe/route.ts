import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { WardrobeItem } from '@fashun/shared'
import { signWardrobeImage, toObjectPath, isExternalUrl } from '@/lib/wardrobe-image'

export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const category = url.searchParams.get('category')
  const ownership = url.searchParams.get('ownership') ?? 'owned'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', user.id)
    .eq('ownership', ownership)
    .order('created_at', { ascending: false })

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    id: string; user_id: string; ownership: string; category: string; name: string
    colours: string[] | null; style_tags: string[] | null; occasion_tags: string[] | null
    image_url: string | null; store_url: string | null; affiliate_url: string | null
    price: number | null; retailer: string | null; last_worn_at: string | null; created_at: string
  }
  const rows = (data ?? []) as Row[]

  const items: WardrobeItem[] = await Promise.all(rows.map(async (row) => ({
    id: row.id,
    userId: row.user_id,
    ownership: row.ownership as WardrobeItem['ownership'],
    category: row.category as WardrobeItem['category'],
    name: row.name,
    colours: row.colours ?? [],
    styleTags: row.style_tags ?? [],
    occasionTags: (row.occasion_tags ?? []) as WardrobeItem['occasionTags'],
    imageUrl: row.image_url ? (await signWardrobeImage(supabase, row.image_url, 3600)) ?? '' : '',
    storeUrl: row.store_url ?? undefined,
    affiliateUrl: row.affiliate_url ?? undefined,
    price: row.price ?? undefined,
    retailer: row.retailer ?? undefined,
    lastWornAt: row.last_worn_at ?? undefined,
    createdAt: row.created_at,
  })))

  return NextResponse.json({ items })
}

export async function DELETE(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('wardrobe_items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

const CreateItemSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']),
  colours: z.array(z.string()).default([]),
  styleTags: z.array(z.string()).default([]),
  occasionTags: z.array(z.enum(['work', 'casual', 'dinner', 'event'])).default([]),
  imageUrl: z.string().min(1), // path or URL — normalized to an object path on store
  ownership: z.enum(['owned', 'wishlist']).default('owned'),
  storeUrl: z.string().url().optional(),
  price: z.number().optional(),
  retailer: z.string().optional(),
})

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = CreateItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('wardrobe_items')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      category: parsed.data.category,
      colours: parsed.data.colours,
      style_tags: parsed.data.styleTags,
      occasion_tags: parsed.data.occasionTags,
      image_url: isExternalUrl(parsed.data.imageUrl)
        ? parsed.data.imageUrl
        : toObjectPath(parsed.data.imageUrl),
      ownership: parsed.data.ownership,
      store_url: parsed.data.storeUrl,
      price: parsed.data.price,
      retailer: parsed.data.retailer,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}
