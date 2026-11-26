import {
  BUDGET_TIER_DEFINITIONS,
  DEFAULT_BUDGETS,
  DEFAULT_DEPARTMENT,
  DEPARTMENT_NAMES,
  isBudgetTier,
  isDepartment,
  type BudgetTier,
  type CategoryBudgets,
  type Department,
  type WardrobeCategory,
} from '@fashun/shared'
import { isOccasion } from './style-me'

export const BUDGET_SAVE_FAILED = "Couldn't save. Check your connection and try again."
export const RANGES_SAVE_FAILED = "Couldn't save your price ranges. Check your connection and try again."
export const BUDGET_LOAD_FAILED = "Couldn't load your budget."
export const BUDGET_OFFLINE = "You're offline. Changes can't be saved until you reconnect."

export interface BudgetState {
  /** Null until the person picks a tier. The card says "Pick a budget to get suggestions". */
  tier: BudgetTier | null
  department: Department
  budgets: CategoryBudgets
}

const CATEGORIES: WardrobeCategory[] = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']

function isRange(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number'
}

/** The saved ranges, or the defaults when nothing usable is saved. */
export function parseBudgets(value: unknown): CategoryBudgets {
  if (typeof value !== 'object' || value === null) return DEFAULT_BUDGETS
  const row = value as Record<string, unknown>
  const out = { ...DEFAULT_BUDGETS }
  for (const key of CATEGORIES) {
    const range = row[key]
    if (isRange(range)) out[key] = [range[0], range[1]]
  }
  return out
}

/** Turns a users row into the budget screen's state. An unknown tier or department is treated as unset. */
export function parseBudgetRow(row: { budget_tier?: unknown; department?: unknown; budgets?: unknown }): BudgetState {
  return {
    tier: isBudgetTier(row.budget_tier) ? row.budget_tier : null,
    department: isDepartment(row.department) ? row.department : DEFAULT_DEPARTMENT,
    budgets: parseBudgets(row.budgets),
  }
}

/** The Profile row value: "Mid · Women's", or "Not set". */
export function budgetRowValue(tier: BudgetTier | null, department: Department): string {
  if (!tier) return 'Not set'
  return `${BUDGET_TIER_DEFINITIONS[tier].name} · ${DEPARTMENT_NAMES[department]}`
}

/** "A$40" */
export function dollars(amount: number): string {
  return `A$${amount.toLocaleString('en-AU')}`
}

/** "Tops about A$5–A$40" */
export function topsRangeLine(tier: BudgetTier): string {
  const [low, high] = BUDGET_TIER_DEFINITIONS[tier].ranges.tops
  return `Tops about ${dollars(low)}–${dollars(high)}`
}

export function tierPickedMessage(tier: BudgetTier): string {
  return `Price ranges set for ${BUDGET_TIER_DEFINITIONS[tier].name}. You can adjust them below.`
}

/** Where Back goes: Profile, or Style me with the same occasion when the page was opened from the card. */
export function budgetBackHref(from: string | null, occasion: string | null): string {
  if (from === 'style-me' && isOccasion(occasion)) return `/style-me?occasion=${occasion}`
  return '/profile'
}
