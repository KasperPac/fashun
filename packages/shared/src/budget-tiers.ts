import type { CategoryBudgets } from './types'

export const BUDGET_TIERS = ['budget', 'high-street', 'mid', 'premium'] as const
export type BudgetTier = (typeof BUDGET_TIERS)[number]

export const DEPARTMENTS = ['mens', 'womens', 'both'] as const
export type Department = (typeof DEPARTMENTS)[number]

/** New users shop for both: "Both" shows everything. */
export const DEFAULT_DEPARTMENT: Department = 'both'

export const DEPARTMENT_NAMES: Record<Department, string> = {
  mens: "Men's",
  womens: "Women's",
  both: 'Both',
}

export interface BudgetTierDefinition {
  code: BudgetTier
  name: string
  /** The example shops, as shown to the user. Suggestions only come from these. */
  shops: readonly string[]
  /** Starting price ranges in A$ (low, high) for every category. */
  ranges: CategoryBudgets
}

/** In display order, cheapest first. Ranges are the team's draft and can be tuned. */
export const BUDGET_TIER_DEFINITIONS: Record<BudgetTier, BudgetTierDefinition> = {
  budget: {
    code: 'budget',
    name: 'Budget',
    shops: ['Kmart', 'Target', 'Big W'],
    ranges: { tops: [5, 40], bottoms: [10, 50], shoes: [15, 60], outerwear: [20, 80], bags: [10, 40], accessories: [5, 25] },
  },
  'high-street': {
    code: 'high-street',
    name: 'High street',
    shops: ['Uniqlo', 'Cotton On', 'H&M'],
    ranges: { tops: [15, 70], bottoms: [25, 90], shoes: [30, 130], outerwear: [50, 180], bags: [20, 80], accessories: [10, 40] },
  },
  mid: {
    code: 'mid',
    name: 'Mid',
    shops: ['Country Road', 'Myer', 'David Jones', 'THE ICONIC'],
    ranges: { tops: [40, 150], bottoms: [60, 200], shoes: [90, 300], outerwear: [150, 450], bags: [60, 250], accessories: [20, 100] },
  },
  premium: {
    code: 'premium',
    name: 'Premium',
    shops: ['Rodd & Gunn', 'R.M. Williams', 'M.J. Bale'],
    ranges: { tops: [90, 300], bottoms: [130, 350], shoes: [200, 700], outerwear: [350, 1000], bags: [150, 800], accessories: [50, 300] },
  },
}

export function isBudgetTier(value: unknown): value is BudgetTier {
  return typeof value === 'string' && (BUDGET_TIERS as readonly string[]).includes(value)
}

export function isDepartment(value: unknown): value is Department {
  return typeof value === 'string' && (DEPARTMENTS as readonly string[]).includes(value)
}

/** A copy of the tier's starting ranges, so callers can't change the definition. */
export function tierRanges(tier: BudgetTier): CategoryBudgets {
  const r = BUDGET_TIER_DEFINITIONS[tier].ranges
  return {
    tops: [...r.tops], bottoms: [...r.bottoms], shoes: [...r.shoes],
    outerwear: [...r.outerwear], bags: [...r.bags], accessories: [...r.accessories],
  }
}

/** "Kmart, Target, Big W" */
export function shopsList(tier: BudgetTier): string {
  return BUDGET_TIER_DEFINITIONS[tier].shops.join(', ')
}
