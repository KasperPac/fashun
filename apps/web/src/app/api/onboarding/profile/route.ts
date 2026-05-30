import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const StylePrefsSchema = z.array(
  z.enum(['casual', 'smart-casual', 'business', 'streetwear', 'minimalist', 'athleisure', 'bohemian', 'glam'])
).min(1, 'Select at least one style')

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

const BodySchema = z.object({
  style_prefs: StylePrefsSchema.optional(),
  budgets: BudgetsSchema.optional(),
}).refine(data => data.style_prefs || data.budgets, {
  message: 'Provide style_prefs or budgets',
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

  const updates: Record<string, unknown> = {}
  if (parsed.data.style_prefs) updates.style_prefs = parsed.data.style_prefs
  if (parsed.data.budgets) updates.budgets = parsed.data.budgets

  const { error } = await supabase.from('users').update(updates).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
