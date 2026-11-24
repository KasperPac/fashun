import { BUDGET_TIER_DEFINITIONS, type BudgetTier } from '@fashun/shared'

const NOISE_WORDS = new Set(['au', 'australia', 'official', 'store', 'online', 'www', 'com', 'net'])

/**
 * Makes a shop name comparable: lower case, "&" read as "and", the web address
 * ending (".com.au") and filler words ("Australia", "AU", "Official", "Store")
 * dropped, everything else but letters and digits removed.
 * "Kmart Australia" -> "kmart", "R.M. Williams" -> "rmwilliams", "H&M" -> "handm".
 */
export function normaliseShopName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/\.com(\.au)?\b/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\./g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !NOISE_WORDS.has(t))
  return tokens.join('')
}

/** True when the shop is one of the tier's example shops (whole-name match after normalising). */
export function isShopInTier(shop: string, tier: BudgetTier): boolean {
  const wanted = normaliseShopName(shop)
  if (!wanted) return false
  return BUDGET_TIER_DEFINITIONS[tier].shops.some((s) => normaliseShopName(s) === wanted)
}
