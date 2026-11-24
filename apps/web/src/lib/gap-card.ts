import { BUDGET_TIER_DEFINITIONS, OCCASION_LABELS } from '@fashun/shared'
import type { BudgetTier, Department, OccasionTag, WardrobeItem } from '@fashun/shared'
import { wardrobeGaps, type GapCategory, type GapItem } from './wardrobe-gaps'
import { dollars } from './budget-view'

export const GAP_UNAVAILABLE_LINE = "Suggestions aren't available right now."
export const GAP_NO_TIER_LINE = 'Pick a budget to get suggestions.'
export const GAP_OFFLINE_LINE = "You're offline. Connect to the internet to see suggestions."
export const GAP_STILL_LOOKING_LINE = 'Still looking. This can take up to 15 seconds.'
export const GAP_OTHER_THINGS_WORK_LINE = 'Your wardrobe, outfits and saved outfits still work.'
export const GAP_LOAD_FAILED_LINE = "We couldn't load suggestions just now."
export const GAP_ALL_FOUND_LINE = "That's everything we found in your colours and price range."
export const GAP_PRICES_NOTE = 'Prices and stock can change at the shop.'

export type GapRow = {
  category: GapCategory
  kind: 'missing' | 'only-one'
  /** The row label and sheet title: "Work shoes", "Another Casual top". */
  label: string
  /** The plural noun phrase used in sentences: "Work shoes", "Casual tops". */
  findLabel: string
  /** "None yet" or "You have 1". */
  status: string
  /** Starts with the visible label (WCAG 2.5.3): "Work shoes, none yet, find suggestions". */
  ariaLabel: string
}

function missingLabel(category: GapCategory, occasion: OccasionTag, department: Department): string {
  const o = OCCASION_LABELS[occasion]
  if (category === 'tops') return occasion === 'formal' ? 'Formal shirts or tops' : `${o} tops`
  if (category === 'bottoms') return department === 'mens' ? `${o} trousers` : `${o} trousers or skirts`
  return `${o} shoes`
}

function onlyOneLabel(category: GapCategory, occasion: OccasionTag, department: Department): string {
  const o = OCCASION_LABELS[occasion]
  if (category === 'tops') return occasion === 'formal' ? 'Another formal shirt or top' : `Another ${o} top`
  if (category === 'bottoms') return department === 'mens' ? `Another pair of ${o} trousers` : `More ${o} trousers or skirts`
  return `Another pair of ${o} shoes`
}

/** `/api/wardrobe` items (camelCase) in the shape the gap count reads (`occasion_tags`). */
export function toGapItems(items: readonly WardrobeItem[]): GapItem[] {
  return items.map((i) => ({
    id: i.id, name: i.name, category: i.category, colours: i.colours, occasion_tags: i.occasionTags, ownership: i.ownership,
  }))
}

/** The gap rows for one occasion, from the owned items only. Empty means no card. */
export function gapRows(items: GapItem[], occasion: OccasionTag, department: Department): GapRow[] {
  return wardrobeGaps(items, occasion).map((gap) => {
    const missing = gap.kind === 'missing'
    const label = missing ? missingLabel(gap.category, occasion, department) : onlyOneLabel(gap.category, occasion, department)
    const status = missing ? 'None yet' : 'You have 1'
    return {
      category: gap.category,
      kind: gap.kind,
      label,
      findLabel: missingLabel(gap.category, occasion, department),
      status,
      ariaLabel: `${label}, ${missing ? 'none yet' : 'only one'}, find suggestions`,
    }
  })
}

/** "A, B and C" */
export function andList(shops: readonly string[]): string {
  return shops.length < 2 ? shops.join('') : `${shops.slice(0, -1).join(', ')} and ${shops[shops.length - 1]}`
}

/** "A, B or C" */
export function orList(shops: readonly string[]): string {
  return shops.length < 2 ? shops.join('') : `${shops.slice(0, -1).join(', ')} or ${shops[shops.length - 1]}`
}

export function tierShops(tier: BudgetTier): readonly string[] {
  return BUDGET_TIER_DEFINITIONS[tier].shops
}

/** The card's source line. */
export function cardSourceLine(tier: BudgetTier, seasonName: string): string {
  return `From ${andList(tierShops(tier))}, within your budget, in your ${seasonName} colours.`
}

export function rangeText(range: readonly [number, number]): string {
  return `${dollars(range[0])}–${dollars(range[1])}`
}

/** The sheet's intro. */
export function sheetIntro(tier: BudgetTier, range: readonly [number, number], seasonName: string): string {
  return `From ${andList(tierShops(tier))}, within ${rangeText(range)}, in your ${seasonName} colours.`
}

export function lookingLine(label: string, tier: BudgetTier): string {
  const text = label.replace(/^(Another|More)\b/, (w) => w.toLowerCase())
  return `Looking for ${text} at ${andList(tierShops(tier))}…`
}

/** The "nothing matched" body. */
export function nothingFoundLine(findLabel: string, category: GapCategory, tier: BudgetTier, range: readonly [number, number]): string {
  return `We couldn't find ${findLabel} at ${orList(tierShops(tier))} between ${dollars(range[0])} and ${dollars(range[1])} in your colours. Try a higher price range for ${category}, or a different budget.`
}

const amountText = (price: number): string =>
  price.toLocaleString('en-AU', Number.isInteger(price) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "A$49.95", or "A$49" for whole dollars. */
export function priceText(price: number): string {
  return `A$${amountText(price)}`
}

/** Screen-reader price: "35 Australian dollars". */
export function priceSpoken(price: number): string {
  return `${amountText(price)} Australian dollars`
}

/** "2026-12-01" -> "1 December" */
export function dayAndMonth(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function pausedLine(resumeOn: string): string {
  return `Suggestions are paused until ${dayAndMonth(resumeOn)}.`
}

/** What GET /api/gaps/status answers. It never searches. */
export type GapStatus =
  | { status: 'ready'; tier: BudgetTier; department: Department; ranges: Record<GapCategory, [number, number]> }
  | { status: 'no_tier' }
  | { status: 'paused'; resume_on: string }
  | { status: 'unavailable' }

/** The photo address for an item, through the app. Null when the item has no photo. */
export function photoHref(occasion: OccasionTag, category: GapCategory, imageUrl: string | null): string | null {
  if (!imageUrl) return null
  return `/api/gaps/photo?${new URLSearchParams({ occasion, category, u: imageUrl }).toString()}`
}

/** The suggestions address for one gap. */
export function suggestionsHref(occasion: OccasionTag, category: GapCategory): string {
  return `/api/gaps/suggestions?${new URLSearchParams({ occasion, category }).toString()}`
}

/** The address that opens one item on its shop's own website (the app looks the link up when it is tapped). */
export function shopLinkHref(occasion: OccasionTag, category: GapCategory, title: string): string {
  return `/api/gaps/shop-link?${new URLSearchParams({ occasion, category, t: title }).toString()}`
}

export function budgetHref(occasion: OccasionTag): string {
  return `/profile/budget?from=style-me&occasion=${occasion}`
}
