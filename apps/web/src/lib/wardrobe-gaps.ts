import { OCCASION_LABELS } from '@fashun/shared'
import type { OccasionTag } from '@fashun/shared'
import { REQUIRED_CATEGORIES, eligibleItems, type OwnedItem } from './outfit-builder'

export type GapCategory = (typeof REQUIRED_CATEGORIES)[number]

export type WardrobeGap = {
  category: GapCategory
  occasion: OccasionTag
  kind: 'missing' | 'only-one'
  /** Short wording: "Work shoes" (missing) or "another Casual top" (only one). */
  label: string
  /** Card wording: "No Work shoes yet" (missing) or "another Casual top" (only one). */
  card: string
}

/** An item for gap counting: wishlist items are not owned and never count. */
export type GapItem = OwnedItem & { ownership?: string | null }

const MISSING_NOUN = { tops: 'tops', bottoms: 'bottoms', shoes: 'shoes' } as const satisfies Record<GapCategory, string>

function anotherWording(category: GapCategory, label: string): string {
  if (category === 'shoes') return `another pair of ${label} shoes`
  return `another ${label} ${category === 'tops' ? 'top' : 'bottom'}`
}

/**
 * The tops, bottoms and shoes a suggestion search should fill for one occasion:
 * `missing` when none is owned for it, `only-one` when exactly one is. Only
 * owned items count; outerwear, bags and accessories never produce a gap.
 */
export function wardrobeGaps(items: GapItem[], occasion: OccasionTag): WardrobeGap[] {
  const owned = items.filter((i) => i.ownership == null || i.ownership === 'owned')
  const eligible = eligibleItems(owned, occasion)
  const label = OCCASION_LABELS[occasion]
  const gaps: WardrobeGap[] = []
  for (const category of REQUIRED_CATEGORIES) {
    const count = eligible.filter((i) => i.category === category).length
    if (count === 0) {
      const text = `${label} ${MISSING_NOUN[category]}`
      gaps.push({ category, occasion, kind: 'missing', label: text, card: `No ${text} yet` })
    } else if (count === 1) {
      const text = anotherWording(category, label)
      gaps.push({ category, occasion, kind: 'only-one', label: text, card: text })
    }
  }
  return gaps
}
