import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { occasionFromText } from '@fashun/shared'
import { signWardrobeImage } from '@/lib/wardrobe-image'
import { joinPieces, type WardrobeLookup } from '@/lib/saved-outfits'

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
  reason: z.string().max(280).optional(),
  season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),
})

const DeleteSchema = z.object({ id: z.string().uuid() })

export async function GET(_req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await (supabase
    .from('outfits')
    .select('id,item_id,item_ids,name,occasion,pieces,description,reason,season,created_at,wardrobe_items(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }) as unknown as Promise<{ data: Array<Record<string, unknown> & { wardrobe_items: { name: string } | null }> | null; error: unknown }>)

  if (error) return NextResponse.json({ error: 'Failed to fetch outfits' }, { status: 500 })

  const rows = data ?? []

  // Look up the pieces in the user's own wardrobe for photos and categories.
  const wanted = [...new Set(rows.flatMap((o) =>
    Array.isArray(o.pieces) ? (o.pieces as Array<{ item_id?: unknown }>).flatMap((p) => (typeof p.item_id === 'string' ? [p.item_id] : [])) : [],
  ))]
  const wardrobe = new Map<string, WardrobeLookup>()
  if (wanted.length > 0) {
    const { data: items, error: itemsError } = await (supabase
      .from('wardrobe_items')
      .select('id,category,image_url')
      .eq('user_id', user.id)
      .in('id', wanted) as unknown as Promise<{ data: Array<{ id: string; category: string; image_url: string | null }> | null; error: unknown }>)
    if (itemsError) return NextResponse.json({ error: 'Failed to fetch outfits' }, { status: 500 })
    await Promise.all((items ?? []).map(async (i) => {
      const imageUrl = i.image_url ? await signWardrobeImage(supabase, i.image_url, 3600) : null
      wardrobe.set(i.id, { category: i.category, imageUrl })
    }))
  }

  // Flatten the join: move wardrobe_items.name → item_name, and join the pieces.
  const outfits = rows.map(({ wardrobe_items, pieces, ...rest }) => ({
    ...rest,
    item_name: wardrobe_items?.name ?? null,
    pieces: joinPieces(pieces, wardrobe),
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
      reason: parsed.data.reason ?? null,
      season: parsed.data.season ?? null,
    })
    .select()
    .single() as unknown as Promise<{ data: unknown; error: unknown }>)

  if (error) return NextResponse.json({ error: 'Failed to save outfit' }, { status: 500 })
  return NextResponse.json({ outfit: data }, { status: 201 })
}

export async function DELETE(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await (supabase
    .from('outfits')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .select('id') as unknown as Promise<{ data: Array<{ id: string }> | null; error: unknown }>)
  if (error) return NextResponse.json({ error: 'Failed to remove outfit' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Outfit not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
