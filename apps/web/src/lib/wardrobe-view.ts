import { OCCASIONS, OCCASION_LABELS, isColourInSeason } from '@fashun/shared'
import type { ColourSeason, OccasionTag, WardrobeCategory } from '@fashun/shared'
import { isEligibleForOccasion } from './outfit-builder'
import { colourName } from './colour-names'
import { SEASON_NAMES } from './profile-view'

export const CATEGORIES: WardrobeCategory[] = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']

export const CATEGORY_LABELS: Record<WardrobeCategory, string> = {
  tops: 'Tops',
  bottoms: 'Bottoms',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  bags: 'Bags',
  accessories: 'Accessories',
}

export type CategoryFilter = WardrobeCategory | 'all'
export type OccasionFilter = OccasionTag | 'all'

interface FilterableItem {
  category: WardrobeCategory
  occasionTags: OccasionTag[]
}

/** Keeps items matching both filters. 'all' matches everything. */
export function filterItems<T extends FilterableItem>(items: T[], category: CategoryFilter, occasion: OccasionFilter): T[] {
  return items.filter(
    (i) => (category === 'all' || i.category === category) && (occasion === 'all' || i.occasionTags.includes(occasion)),
  )
}

/** "No formal shoes yet.", "No shoes yet." or "No formal pieces yet." */
export function noMatchMessage(category: CategoryFilter, occasion: OccasionFilter): string {
  const occ = occasion === 'all' ? '' : `${OCCASION_LABELS[occasion].toLowerCase()} `
  const cat = category === 'all' ? 'pieces' : CATEGORY_LABELS[category].toLowerCase()
  return `No ${occ}${cat} yet.`
}

export function pieceCount(count: number): string {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** "Navy" or "Navy +1". Pieces with no usable colour read "No colour". */
export function firstColourLabel(colours: string[]): string {
  const valid = colours.filter((c) => HEX.test(c))
  if (valid.length === 0) return 'No colour'
  const extra = valid.length - 1
  return extra > 0 ? `${colourName(valid[0])} +${extra}` : colourName(valid[0])
}

/** The palette line for an item, or null when there is no season or no colour to judge. */
export function paletteLine(colours: string[], season: ColourSeason | null | undefined): string | null {
  if (!season) return null
  const valid = colours.filter((c) => HEX.test(c))
  if (valid.length === 0) return null
  const name = SEASON_NAMES[season]
  return valid.some((c) => isColourInSeason(c, season))
    ? `✓ In your ${name} palette`
    : `Outside your ${name} palette. It can still be used in outfits.`
}

const READY_SLOTS = [
  { category: 'tops', status: 'Needs a top' },
  { category: 'bottoms', status: 'Needs a bottom' },
  { category: 'shoes', status: 'Needs shoes' },
] as const

export interface Readiness {
  occasion: OccasionTag
  ready: boolean
  /** The first of top, bottom, shoes with nothing for this occasion; null when ready. */
  missing: 'tops' | 'bottoms' | 'shoes' | null
  /** Short status for the tile, e.g. "Ready" or "Needs shoes". */
  status: string
}

/** One entry per occasion, using the same eligibility rule Style me uses. */
export function outfitReadiness(items: Array<{ category: string; occasionTags: OccasionTag[] }>): Readiness[] {
  return OCCASIONS.map((occasion) => {
    const eligible = items.filter((i) => isEligibleForOccasion({ occasion_tags: i.occasionTags }, occasion))
    const slot = READY_SLOTS.find((s) => !eligible.some((i) => i.category === s.category))
    if (!slot) return { occasion, ready: true, missing: null, status: 'Ready' }
    return { occasion, ready: false, missing: slot.category, status: slot.status }
  })
}

/** CSS colour for an occasion, from the design tokens. */
export function occasionColour(occasion: OccasionTag): string {
  const token = { casual: 'casual', 'smart-casual': 'smart', work: 'work', formal: 'formal' }[occasion]
  return `var(--color-occ-${token})`
}

/** Formal is dark, so text on it must be white. */
export const isDarkOccasion = (occasion: OccasionTag): boolean => occasion === 'formal'

/** Where a "Needs …" tile or button sends the user. */
export function addHref(category: WardrobeCategory | null, occasion: OccasionTag | null, from?: 'onboarding'): string {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (occasion) params.set('occasion', occasion)
  if (from) params.set('from', from)
  const query = params.toString()
  return query ? `/wardrobe/add?${query}` : '/wardrobe/add'
}

/** Reads the category and occasion presets from the Add page's query string. Unknown values are ignored. */
export function readPresets(params: { get(name: string): string | null }): {
  category: WardrobeCategory | null
  occasion: OccasionTag | null
} {
  const category = params.get('category')
  const occasion = params.get('occasion')
  return {
    category: CATEGORIES.find((c) => c === category) ?? null,
    occasion: OCCASIONS.find((o) => o === occasion) ?? null,
  }
}
