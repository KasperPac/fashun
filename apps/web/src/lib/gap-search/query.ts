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
 * The one search text for a gap: the department and category only, "men's shoes" or "tops".
 * No shop names, price or occasion words: Google Shopping treats extra words as required, so they
 * left live searches nearly empty. The tier, price, department and occasion filters run after the search.
 */
export function buildSearchText(q: Pick<GapSearchQuery, 'category' | 'department'>): string {
  return [DEPARTMENT_WORDS[q.department], CATEGORY_WORDS[q.category]].filter(Boolean).join(' ')
}

/** Results asked for in the one call (Google Shopping's page size, up to 100). */
export const SEARCH_RESULTS_WANTED = 100
