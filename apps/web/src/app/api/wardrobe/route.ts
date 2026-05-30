import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { WardrobeItem } from '@fashun/shared'

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

  return NextResponse.json({ items: data as WardrobeItem[] })
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
  imageUrl: z.string().url(),
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
      image_url: parsed.data.imageUrl,
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
