import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isBudgetTier, isDepartment, DEFAULT_DEPARTMENT, OCCASIONS } from '@fashun/shared'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { gapSuggestionsEnabled } from '@/lib/paid-extras'
import { ColourTaggingError, findGapSuggestions, gapSearchFixturesEnabled, ProductSourceError, type GapPalette, type GapSuggestion } from '@/lib/gap-search'
import { SEASON_NAMES } from '@/lib/profile-view'
import { parseBudgets } from '@/lib/budget-view'
import { firstOfNextMonth, tryOnNow } from '@/lib/try-on'
import {
  GAP_NO_TIER_MESSAGE, GAP_SEARCH_TIMEOUT_MS, GAP_UNAVAILABLE_MESSAGE,
  gapDay, gapSearchMonth, readGapSearchCap, reserveGapSearch, withTimeout,
} from '@/lib/gap-suggestions'

// The source has 12 s to answer; leave room for the database.
export const maxDuration = 30

const QuerySchema = z.object({
  occasion: z.enum(OCCASIONS),
  category: z.enum(['tops', 'bottoms', 'shoes']),
})

/** One fixed reason per failure. Never the error text, which could hold a search address or key. */
function logFailure(reason: 'cache_read_failed' | 'count_failed' | 'source_failed' | 'source_timeout' | 'tagging_failed' | 'no_palette' | 'store_failed') {
  console.error(`gap suggestions failed: ${reason}`)
}

function unavailable() {
  return NextResponse.json({ status: 'unavailable', message: GAP_UNAVAILABLE_MESSAGE }, { status: 503 })
}

/** "2026-12-01" -> "1 December" */
function dayAndMonth(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

/**
 * GET ?occasion=&category= : up to 6 suggested items for one gap.
 * The tier, department and price range come from the signed-in user's own saved settings, never from the request.
 * status: ok (items, maybe none) | no_tier | paused (until the 1st of next month) | unavailable (HTTP 503).
 */
export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Switch off: no search, no stored answer, nothing else is even read.
  if (!gapSuggestionsEnabled()) return unavailable()

  const params = new URL(req.url).searchParams
  const parsed = QuerySchema.safeParse({ occasion: params.get('occasion'), category: params.get('category') })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid gap' }, { status: 400 })
  const { occasion, category } = parsed.data

  const { data: profile } = await supabase
    .from('users')
    .select('budget_tier,department,budgets,colour_season,best_colours,avoid_colours')
    .eq('id', user.id)
    .maybeSingle()
  if (!isBudgetTier(profile?.budget_tier)) {
    return NextResponse.json({ status: 'no_tier', message: GAP_NO_TIER_MESSAGE })
  }
  const tier = profile.budget_tier
  const department = isDepartment(profile.department) ? profile.department : DEFAULT_DEPARTMENT
  const priceRange = parseBudgets(profile.budgets)[category]

  const now = tryOnNow()
  const day = gapDay(now)

  // A gap stored today costs nothing, whatever the month's count says.
  const { data: stored, error: readError } = await supabase
    .from('gap_suggestions')
    .select('items')
    .eq('user_id', user.id)
    .eq('occasion', occasion)
    .eq('category', category)
    .eq('tier', tier)
    .eq('department', department)
    .eq('price_min', priceRange[0])
    .eq('price_max', priceRange[1])
    .eq('day', day)
    .maybeSingle()
  if (readError) {
    logFailure('cache_read_failed')
    return unavailable()
  }
  if (stored) {
    return NextResponse.json({ status: 'ok', items: stored.items as unknown as GapSuggestion[], stored: true })
  }

  if (!process.env.SERPAPI_API_KEY && !gapSearchFixturesEnabled()) return unavailable()

  // One search per opening, taken from the month's count before it is made.
  // The colour step needs the user's palette: no palette, no search and no cost.
  const season = profile.colour_season
  const colourList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : [])
  const palette: GapPalette | null = season && season in SEASON_NAMES && colourList(profile.best_colours).length > 0
    ? { season: season as GapPalette['season'], best: colourList(profile.best_colours), avoid: colourList(profile.avoid_colours) }
    : null
  if (!palette) {
    logFailure('no_palette')
    return unavailable()
  }

  const month = gapSearchMonth(now)
  const service = await createServiceClient()
  let count: number | null
  try {
    count = await reserveGapSearch(service, month, readGapSearchCap())
  } catch {
    logFailure('count_failed')
    return unavailable()
  }
  if (count === null) {
    const resumeOn = firstOfNextMonth(month)
    return NextResponse.json({
      status: 'paused',
      message: `Suggestions are paused until ${dayAndMonth(resumeOn)}`,
      resume_on: resumeOn,
    })
  }

  let items: GapSuggestion[]
  try {
    items = await withTimeout(
      findGapSuggestions({ occasion, category, tier, department, priceRange, palette }),
      GAP_SEARCH_TIMEOUT_MS,
      () => new ProductSourceError('Product search timed out'),
    )
  } catch (err) {
    logFailure(
      err instanceof ColourTaggingError ? 'tagging_failed'
        : err instanceof ProductSourceError && err.message === 'Product search timed out' ? 'source_timeout'
        : 'source_failed',
    )
    return unavailable()
  }

  // Stored for the day, even when empty. If storing fails the person still sees the items.
  const { error: storeError } = await service.from('gap_suggestions').upsert(
    {
      user_id: user.id, occasion, category, tier, department,
      price_min: priceRange[0], price_max: priceRange[1], day,
      items: JSON.parse(JSON.stringify(items)),
    },
    { onConflict: 'user_id,occasion,category,tier,department,price_min,price_max,day' },
  )
  if (storeError) logFailure('store_failed')

  return NextResponse.json({ status: 'ok', items, stored: false })
}
