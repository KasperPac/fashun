import { NextResponse } from 'next/server'
import { isBudgetTier, isDepartment, DEFAULT_DEPARTMENT } from '@fashun/shared'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { gapSuggestionsEnabled } from '@/lib/paid-extras'
import { gapSearchFixturesEnabled } from '@/lib/gap-search'
import { parseBudgets } from '@/lib/budget-view'
import { firstOfNextMonth, tryOnNow } from '@/lib/try-on'
import { gapSearchMonth, readGapSearchCap } from '@/lib/gap-suggestions'
import type { GapStatus } from '@/lib/gap-card'

const unavailable = (): NextResponse<GapStatus> => NextResponse.json({ status: 'unavailable' })

/**
 * GET: what the Fill the gaps card needs to know. It never searches and never counts a search.
 * status: ready (tier, department, the three price ranges) | no_tier | paused | unavailable.
 */
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!gapSuggestionsEnabled()) return unavailable()
  if (!process.env.SERPAPI_API_KEY && !gapSearchFixturesEnabled()) return unavailable()

  const { data: profile } = await supabase
    .from('users')
    .select('budget_tier,department,budgets')
    .eq('id', user.id)
    .maybeSingle()
  if (!isBudgetTier(profile?.budget_tier)) return NextResponse.json({ status: 'no_tier' } satisfies GapStatus)

  const month = gapSearchMonth(tryOnNow())
  try {
    const service = await createServiceClient()
    const { data, error } = await service.from('gap_search_usage').select('searches').eq('month', month).maybeSingle()
    if (error) throw new Error('count unreadable')
    if ((data?.searches ?? 0) >= readGapSearchCap()) {
      return NextResponse.json({ status: 'paused', resume_on: firstOfNextMonth(month) } satisfies GapStatus)
    }
  } catch {
    console.error('gap status failed: count_failed')
    return unavailable()
  }

  const budgets = parseBudgets(profile.budgets)
  return NextResponse.json({
    status: 'ready',
    tier: profile.budget_tier,
    department: isDepartment(profile.department) ? profile.department : DEFAULT_DEPARTMENT,
    ranges: { tops: budgets.tops, bottoms: budgets.bottoms, shoes: budgets.shoes },
  } satisfies GapStatus)
}
