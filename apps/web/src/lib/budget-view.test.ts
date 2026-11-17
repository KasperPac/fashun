import { describe, it, expect } from 'vitest'
import {
  BUDGET_TIERS,
  BUDGET_TIER_DEFINITIONS,
  DEFAULT_BUDGETS,
  tierRanges,
  type CategoryBudgets,
} from '@fashun/shared'
import {
  budgetBackHref,
  budgetRowAriaLabel,
  budgetRowValue,
  parseBudgetRow,
  tierPickedMessage,
  topsRangeLine,
} from './budget-view'
import { saveBudgetPatch } from './budget-client'

const CATEGORIES = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories'] as const

describe('budget tiers', () => {
  it('lists four tiers in order with their example shops', () => {
    expect(BUDGET_TIERS.map((t) => BUDGET_TIER_DEFINITIONS[t].name)).toEqual(['Budget', 'High street', 'Mid', 'Premium'])
    expect(BUDGET_TIER_DEFINITIONS.budget.shops.join(', ')).toBe('Kmart, Target, Big W')
    expect(BUDGET_TIER_DEFINITIONS['high-street'].shops.join(', ')).toBe('Uniqlo, Cotton On, H&M')
    expect(BUDGET_TIER_DEFINITIONS.mid.shops.join(', ')).toBe('Country Road, Myer, David Jones, THE ICONIC')
    expect(BUDGET_TIER_DEFINITIONS.premium.shops.join(', ')).toBe('Rodd & Gunn, R.M. Williams, M.J. Bale')
  })

  it('Budget starting ranges are lower than Premium for every category', () => {
    for (const c of CATEGORIES) {
      const budget = BUDGET_TIER_DEFINITIONS.budget.ranges[c]
      const premium = BUDGET_TIER_DEFINITIONS.premium.ranges[c]
      expect(budget[1]).toBeLessThan(premium[1])
      expect(budget[0]).toBeLessThanOrEqual(premium[0])
    }
  })

  it('every tier range has a low below its high, and tiers rise in order', () => {
    for (const t of BUDGET_TIERS) for (const c of CATEGORIES) {
      const [low, high] = BUDGET_TIER_DEFINITIONS[t].ranges[c]
      expect(low).toBeGreaterThanOrEqual(0)
      expect(low).toBeLessThan(high)
    }
    for (let i = 1; i < BUDGET_TIERS.length; i++) for (const c of CATEGORIES) {
      expect(BUDGET_TIER_DEFINITIONS[BUDGET_TIERS[i]].ranges[c][1]).toBeGreaterThan(BUDGET_TIER_DEFINITIONS[BUDGET_TIERS[i - 1]].ranges[c][1])
    }
  })

  it('tierRanges returns a copy', () => {
    const r = tierRanges('mid')
    r.tops[0] = 999
    expect(BUDGET_TIER_DEFINITIONS.mid.ranges.tops).toEqual([40, 150])
  })

  it('quotes each tier\'s Tops range', () => {
    expect(topsRangeLine('budget')).toBe('Tops about A$5–A$40')
    expect(topsRangeLine('premium')).toBe('Tops about A$90–A$300')
  })
})

describe('budget row and state', () => {
  it('reads Not set for a new user and "<Tier> · <Department>" once set', () => {
    expect(budgetRowValue(null, 'both')).toBe('Not set')
    expect(budgetRowValue('mid', 'womens')).toBe("Mid · Women's")
    expect(budgetRowValue('high-street', 'mens')).toBe("High street · Men's")
    expect(budgetRowValue('premium', 'both')).toBe('Premium · Both')
  })

  it('gives the row an accessible name', () => {
    expect(budgetRowAriaLabel(null, 'both')).toBe('Shopping budget, not set')
    expect(budgetRowAriaLabel('mid', 'womens')).toBe("Shopping budget, currently Mid, women's")
  })

  it('a user with no tier has a null tier and starts on Both', () => {
    const s = parseBudgetRow({ budget_tier: null, department: null, budgets: null })
    expect(s.tier).toBeNull()
    expect(s.department).toBe('both')
    expect(s.budgets).toEqual(DEFAULT_BUDGETS)
    expect(parseBudgetRow({}).tier).toBeNull()
  })

  it('treats an unknown tier or department as unset', () => {
    const s = parseBudgetRow({ budget_tier: 'luxury', department: 'kids' })
    expect(s.tier).toBeNull()
    expect(s.department).toBe('both')
  })

  it('keeps a saved tier, department and moved ranges', () => {
    const budgets: CategoryBudgets = { ...tierRanges('budget'), shoes: [15, 120] }
    const s = parseBudgetRow({ budget_tier: 'budget', department: 'womens', budgets })
    expect(s).toEqual({ tier: 'budget', department: 'womens', budgets })
  })

  it('falls back to defaults for any malformed range', () => {
    const s = parseBudgetRow({ budgets: { tops: 'x', shoes: [1] } })
    expect(s.budgets).toEqual(DEFAULT_BUDGETS)
  })

  it('words the tier toast', () => {
    expect(tierPickedMessage('mid')).toBe('Price ranges set for Mid. You can adjust them below.')
  })
})

describe('Back', () => {
  it('returns to Profile by default', () => {
    expect(budgetBackHref(null, null)).toBe('/profile')
    expect(budgetBackHref('style-me', null)).toBe('/profile')
    expect(budgetBackHref('style-me', 'nonsense')).toBe('/profile')
  })
  it('returns to Style me with the same occasion from the card', () => {
    expect(budgetBackHref('style-me', 'work')).toBe('/style-me?occasion=work')
    expect(budgetBackHref('style-me', 'smart-casual')).toBe('/style-me?occasion=smart-casual')
  })
})

describe('saveBudgetPatch', () => {
  it('sends the patch and reports success', async () => {
    let seen: { input: string; init: RequestInit } | null = null
    const ok = await saveBudgetPatch({ department: 'mens' }, async (input, init) => { seen = { input, init }; return new Response('{}', { status: 200 }) })
    expect(ok).toBe(true)
    expect(seen!.input).toBe('/api/onboarding/profile')
    expect(seen!.init.method).toBe('PATCH')
    expect(seen!.init.body).toBe('{"department":"mens"}')
  })
  it('reports failure for a refusal or a blocked network', async () => {
    expect(await saveBudgetPatch({}, async () => new Response('{}', { status: 400 }))).toBe(false)
    expect(await saveBudgetPatch({}, async () => { throw new TypeError('offline') })).toBe(false)
  })
})
