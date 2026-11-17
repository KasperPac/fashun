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
export function buildSearchText(q: Pick<GapSearchQuery, 'occasion' | 'category' | 'department'>): string {
  return [DEPARTMENT_WORDS[q.department], OCCASION_WORDS[q.occasion], CATEGORY_WORDS[q.category]]
    .filter(Boolean)
    .join(' ')
}
