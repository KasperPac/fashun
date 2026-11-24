import type { Department } from '@fashun/shared'
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
 * The search text for one shop's search: that one shop's name, the department and the category,
 * "Kmart men's shoes". Several shop names in one query returned almost nothing, so each tier shop
 * is searched on its own. No price or occasion words: Google Shopping treats extra words as required.
 * The tier, price, department and occasion filters run after the searches.
 */
export function buildSearchText(q: Pick<GapSearchQuery, 'category' | 'department' | 'shop'>): string {
  return [q.shop, DEPARTMENT_WORDS[q.department], CATEGORY_WORDS[q.category]].filter(Boolean).join(' ')
}

/** Results asked for in each shop's call (Google Shopping's page size, up to 100). */
export const SEARCH_RESULTS_WANTED = 100
