import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { occasionFromText } from '@fashun/shared'

const PieceSchema = z.object({
  label: z.string(),
  colour_hex: z.string(),
  item_id: z.string().nullable(),
  in_wardrobe: z.boolean(),
})

const SaveOutfitSchema = z.object({
  item_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  occasion: z.string().optional(),
  pieces: z.array(PieceSchema).min(1),
  description: z.string().optional(),
})

export async function GET(_req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await (supabase
    .from('outfits')
    .select('id,item_id,item_ids,name,occasion,pieces,description,try_on_image_url,created_at,wardrobe_items(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }) as unknown as Promise<{ data: Array<Record<string, unknown> & { wardrobe_items: { name: string } | null }> | null; error: unknown }>)

  if (error) return NextResponse.json({ error: 'Failed to fetch outfits' }, { status: 500 })

  // Flatten the join: move wardrobe_items.name → item_name
  const outfits = (data ?? []).map(({ wardrobe_items, ...rest }) => ({
    ...rest,
    item_name: wardrobe_items?.name ?? null,
  }))

  return NextResponse.json({ outfits })
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = SaveOutfitSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  // Every wardrobe item an outfit points at must belong to this user. A chosen
  // anchor item that is not theirs is an error; a piece pointing at an item that
  // is not theirs (or does not exist) is kept only as a plain suggestion.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const claimedIds = [...new Set([
    ...(parsed.data.item_id ? [parsed.data.item_id] : []),
    ...parsed.data.pieces.flatMap(p => (p.in_wardrobe && p.item_id && UUID.test(p.item_id) ? [p.item_id] : [])),
  ])]
  let ownedIds = new Set<string>()
  if (claimedIds.length > 0) {
    const { data: owned, error: ownedError } = await (supabase
      .from('wardrobe_items')
      .select('id')
      .eq('user_id', user.id)
      .in('id', claimedIds) as unknown as Promise<{ data: Array<{ id: string }> | null; error: unknown }>)
    if (ownedError) return NextResponse.json({ error: 'Failed to save outfit' }, { status: 500 })
    ownedIds = new Set((owned ?? []).map(i => i.id))
  }
  if (parsed.data.item_id && !ownedIds.has(parsed.data.item_id)) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }
  const pieces = parsed.data.pieces.map(p =>
    p.in_wardrobe && !(p.item_id && ownedIds.has(p.item_id)) ? { ...p, item_id: null, in_wardrobe: false } : p,
  )
  const itemIds = [...new Set(pieces.flatMap(p => (p.item_id ? [p.item_id] : [])))]

  const { data, error } = await (supabase
    .from('outfits')
    .insert({
      user_id: user.id,
      item_id: parsed.data.item_id ?? null,
      item_ids: itemIds,
      name: parsed.data.name,
      occasion: occasionFromText(parsed.data.occasion),
      pieces,
      description: parsed.data.description ?? null,
    })
    .select()
    .single() as unknown as Promise<{ data: unknown; error: unknown }>)

  if (error) return NextResponse.json({ error: 'Failed to save outfit' }, { status: 500 })
  return NextResponse.json({ outfit: data }, { status: 201 })
}
