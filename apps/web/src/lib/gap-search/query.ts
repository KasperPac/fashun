import { BUDGET_TIER_DEFINITIONS, type Department } from '@fashun/shared'
import type { GapSearchCategory, GapSearchQuery } from './product-source'

const OCCASION_WORDS: Record<GapSearchQuery['occasion'], string> = {
  casual: 'casual',
  'smart-casual': 'smart casual',
  work: 'work',
  formal: 'formal',
}
const CATEGORY_WORDS: Record<GapSearchCategory, string> = { tops: 'tops', bottoms: 'pants', shoes: 'shoes' }
const DEPARTMENT_WORDS: Record<Department, string> = { mens: "men's", womens: "women's", both: '' }

/** "men's formal shoes". Both searches without a department word. */
export function buildItemWords(q: Pick<GapSearchQuery, 'occasion' | 'category' | 'department'>): string {
  return [DEPARTMENT_WORDS[q.department], OCCASION_WORDS[q.occasion], CATEGORY_WORDS[q.category]]
    .filter(Boolean)
    .join(' ')
}

/**
 * The one search text for a gap: the item words plus the tier's shops, so Google answers from them:
 * "men's formal shoes (Rodd & Gunn OR R.M. Williams OR M.J. Bale)".
 */
export function buildSearchText(q: Pick<GapSearchQuery, 'occasion' | 'category' | 'department' | 'tier'>): string {
  return `${buildItemWords(q)} (${BUDGET_TIER_DEFINITIONS[q.tier].shops.join(' OR ')})`
}
