import type { BudgetTier, Department } from '@fashun/shared'
import { filterProducts } from './filters'
import { serpapiShopping } from './serpapi-shopping'
import type { GapCandidate, GapSearchCategory, GapSearchQuery, ProductSource } from './product-source'

export type { GapCandidate, GapSearchCategory, GapSearchQuery, ProductSource, RawProduct } from './product-source'
export { ProductSourceError } from './product-source'
export { MAX_CANDIDATES } from './filters'

export interface GapSearchInput {
  occasion: GapSearchQuery['occasion']
  category: GapSearchCategory
  tier: BudgetTier
  department: Department
  /** The user's slider range for the category in A$, ends included. */
  priceRange: readonly [number, number]
}

/**
 * Up to 6 candidate items for one gap, from the tier's shops, inside the price
 * range, for the department and suited to the occasion. Empty is a normal answer.
 * Throws ProductSourceError only when the source itself fails.
 */
export async function findGapCandidates(input: GapSearchInput, source: ProductSource = serpapiShopping): Promise<GapCandidate[]> {
  const query: GapSearchQuery = {
    occasion: input.occasion,
    category: input.category,
    department: input.department,
    priceRange: input.priceRange,
  }
  const products = await source.search(query)
  return filterProducts(products, query, input.tier)
}
