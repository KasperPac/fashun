import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const PieceSchema = z.object({
  label: z.string(),
  colour_hex: z.string(),
  item_id: z.string().nullable(),
  in_wardrobe: z.boolean(),
})

const SaveOutfitSchema = z.object({
  item_id: z.string().uuid(),
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
    .select('id,item_id,name,occasion,pieces,description,try_on_image_url,created_at,wardrobe_items(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }) as unknown as Promise<{ data: Array<Record<string, unknown> & { wardrobe_items: { name: string } | null }> | null; error: unknown }>)

  if (error) return NextResponse.json({ error: 'Failed to fetch outfits' }, { status: 500 })

  // Flatten the join: move wardrobe_items.name → item_name
  const outfits = (data ?? []).map(o => ({
    ...o,
    item_name: o.wardrobe_items?.name ?? null,
    wardrobe_items: undefined,
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

  const { data, error } = await (supabase
    .from('outfits')
    .insert({
      user_id: user.id,
      item_id: parsed.data.item_id,
      name: parsed.data.name,
      occasion: parsed.data.occasion ?? null,
      pieces: parsed.data.pieces,
      description: parsed.data.description ?? null,
    })
    .select()
    .single() as unknown as Promise<{ data: unknown; error: unknown }>)

  if (error) return NextResponse.json({ error: 'Failed to save outfit' }, { status: 500 })
  return NextResponse.json({ outfit: data }, { status: 201 })
}
