import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getProfileColours, HAIR_COLOURS, EYE_COLOURS, STYLE_PREFS } from '@fashun/shared'
import { z } from 'zod'

const StylePrefsSchema = z.array(z.enum(STYLE_PREFS)).min(1, 'Select at least one style')

const BudgetRangeSchema = z.tuple([z.number().min(0), z.number()]).refine(
  ([min, max]) => min < max,
  { message: 'Min must be less than max' }
)

const BudgetsSchema = z.object({
  tops: BudgetRangeSchema,
  bottoms: BudgetRangeSchema,
  shoes: BudgetRangeSchema,
  outerwear: BudgetRangeSchema,
  bags: BudgetRangeSchema,
  accessories: BudgetRangeSchema,
})

const HexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colours must be 6-digit hex values')

const BodySchema = z.object({
  style_prefs: StylePrefsSchema.optional(),
  budgets: BudgetsSchema.optional(),
  skin_undertone: z.enum(['warm', 'cool', 'neutral']).optional(),
  skin_depth: z.enum(['light', 'medium', 'deep']).optional(),
  hair_colour: z.enum(HAIR_COLOURS).optional(),
  eye_colour: z.enum(EYE_COLOURS).optional(),
  colour_season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),
  best_colours: z.array(HexSchema).min(6, 'Choose at least 6 best colours').optional(),
  avoid_colours: z.array(HexSchema).min(4, 'Choose at least 4 colours to avoid').optional(),
  suggested_styles: StylePrefsSchema.optional(),
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: 'Provide at least one profile field',
})

export async function PATCH(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const updates: Record<string, unknown> = { ...parsed.data }

  // Changing the season refreshes the colours to match, unless the user
  // supplied their own colours in the same request.
  if (parsed.data.colour_season) {
    const { best, avoid } = getProfileColours(parsed.data.colour_season)
    if (!parsed.data.best_colours) updates.best_colours = best
    if (!parsed.data.avoid_colours) updates.avoid_colours = avoid
  }

  const { error } = await supabase.from('users').update(updates).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
