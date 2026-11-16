import { OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, OccasionTag, WardrobeCategory } from '@fashun/shared'
import { colourName } from './colour-names'

export type OwnedItem = {
  id: string
  name: string
  category: string
  colours: string[] | null
  occasion_tags: string[] | null
}

export type OutfitPiece = {
  label: string
  colour_hex: string
  item_id: string
  in_wardrobe: true
  category: string
}

export type BuiltOutfit = {
  name: string
  occasion: OccasionTag
  pieces: OutfitPiece[]
  description: string
  reason: string
}

/** Every outfit needs one of each of these. */
export const REQUIRED_CATEGORIES = ['tops', 'bottoms', 'shoes'] as const satisfies readonly WardrobeCategory[]
export const OUTFIT_COUNT = 3

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Formal outfits never contain items tagged only casual, and casual outfits
 * never contain items tagged only formal. Untagged items are allowed.
 */
export function isEligibleForOccasion(item: Pick<OwnedItem, 'occasion_tags'>, occasion: OccasionTag): boolean {
  const tags = item.occasion_tags ?? []
  if (tags.length === 0) return true
  if (occasion === 'formal') return !tags.every((t) => t === 'casual')
  if (occasion === 'casual') return !tags.every((t) => t === 'formal')
  return true
}

export function eligibleItems(items: OwnedItem[], occasion: OccasionTag): OwnedItem[] {
  return items.filter((i) => isEligibleForOccasion(i, occasion))
}

/** Counts of eligible tops, bottoms and shoes, in REQUIRED_CATEGORIES order. */
function requiredCounts(eligible: OwnedItem[]): number[] {
  return REQUIRED_CATEGORIES.map((c) => eligible.filter((i) => i.category === c).length)
}

/**
 * How many different outfits to ask for: every top + bottom + shoes combination
 * the wardrobe allows, up to OUTFIT_COUNT. 0 when a top, bottom or shoes is missing.
 * Accessories and outerwear never add to this, because they do not make a different outfit.
 */
export function possibleOutfitCount(eligible: OwnedItem[]): number {
  return Math.min(OUTFIT_COUNT, requiredCounts(eligible).reduce((a, b) => a * b, 1))
}

/**
 * Says in plain words what the wardrobe is missing for this occasion, or
 * returns null when a top, bottom and shoes are all there (at least 1 outfit).
 */
export function describeShortfall(eligible: OwnedItem[], occasion: OccasionTag): string | null {
  const label = OCCASION_LABELS[occasion].toLowerCase()
  const words = { tops: `a ${label} top`, bottoms: `a pair of ${label} trousers or a skirt`, shoes: `a pair of ${label} shoes` }
  const counts = requiredCounts(eligible)
  const missing = REQUIRED_CATEGORIES.filter((_, idx) => counts[idx] === 0)
  if (missing.length > 0) {
    return `Not enough ${label} clothes yet. Add ${missing.map((c) => words[c]).join(' and ')}.`
  }
  return null
}

const ADD_WORDS = { tops: 'top', bottoms: 'pair of trousers or a skirt', shoes: 'pair of shoes' } as const

/**
 * When fewer than OUTFIT_COUNT different outfits are possible, says how many
 * and names the one piece to add for more. It names the category with the
 * fewest pieces (first of top, bottom, shoes on a tie): adding to it raises the
 * number of combinations the most, so the advice changes after every addition
 * until 3 outfits are possible. Null when there are already enough, or when
 * something is missing entirely (describeShortfall covers that).
 */
export function describeFewer(eligible: OwnedItem[], occasion: OccasionTag): string | null {
  const count = possibleOutfitCount(eligible)
  if (count === 0 || count >= OUTFIT_COUNT) return null
  const label = OCCASION_LABELS[occasion].toLowerCase()
  const [category] = missingCategories(eligible)
  return `Your clothes make ${count} different ${label} ${count === 1 ? 'outfit' : 'outfits'}. Add another ${label} ${ADD_WORDS[category]} for more.`
}

/**
 * Which of top, bottom, shoes to ask the user to add: every category with
 * nothing eligible, or, when each has something, the category with the fewest
 * pieces (first of top, bottom, shoes on a tie), which raises the number of
 * different outfits the most.
 */
export function missingCategories(eligible: OwnedItem[]): Array<(typeof REQUIRED_CATEGORIES)[number]> {
  const counts = REQUIRED_CATEGORIES.map((c) => ({ c, n: eligible.filter((i) => i.category === c).length }))
  const empty = counts.filter((x) => x.n === 0).map((x) => x.c)
  if (empty.length > 0) return empty
  const fewest = counts.reduce((a, b) => (b.n < a.n ? b : a))
  return [fewest.c]
}

/** Categories (top, bottom, shoes) the user already has for this occasion. */
export function presentCategories(eligible: OwnedItem[]): Array<(typeof REQUIRED_CATEGORIES)[number]> {
  return REQUIRED_CATEGORIES.filter((c) => eligible.some((i) => i.category === c))
}

export const REASON_MAX_LENGTH = 140

/**
 * The reason must be one sentence of at most 140 characters that names the
 * user's season as "your {Season} palette" or "your best {Season} colours".
 * Anything else is replaced by a plain reason built from the outfit's own colours.
 */
export function finaliseReason(reason: string, season: ColourSeason, colourHexes: string[]): string {
  const label = seasonLabel(season)
  const text = reason.trim().replace(/\s+/g, ' ')
  const names = [...new Set(colourHexes.filter((h) => HEX.test(h)).map((h) => colourName(h)))]
  const namesSeason = new RegExp(`your (${label} palette|best ${label} colours)`, 'i').test(text)
  const oneSentence = !/[.!?]\s+\S/.test(text)
  if (text && namesSeason && oneSentence && text.length <= REASON_MAX_LENGTH) return text
  if (names.length >= 2) return `${names[0]} and ${names[1]} are both in your ${label} palette.`
  if (names.length === 1) return `${names[0]} is one of your best ${label} colours.`
  return `This outfit is built from your ${label} palette.`
}

export function seasonLabel(season: ColourSeason): string {
  return season.charAt(0).toUpperCase() + season.slice(1)
}

type RawSuggestion = { name: string; description: string; reason: string; item_ids: string[] }

/**
 * Turns the model's suggestions into outfits we can trust. Items are looked up
 * by id in the user's own eligible items only; anything else rejects the whole
 * outfit. Outfits must have a top, bottom and shoes, and must be different from
 * each other (by their tops, bottoms and shoes), up to `limit`. The reason is guaranteed to name the user's colour season.
 */
export function validateSuggestions(
  raw: RawSuggestion[],
  eligible: OwnedItem[],
  occasion: OccasionTag,
  season: ColourSeason,
  seen: Set<string> = new Set(),
  limit: number = OUTFIT_COUNT,
): BuiltOutfit[] {
  const byId = new Map(eligible.map((i) => [i.id, i]))
  const out: BuiltOutfit[] = []
  for (const s of raw) {
    const ids = [...new Set(s.item_ids)]
    const items = ids.map((id) => byId.get(id))
    if (items.length === 0 || items.some((i) => !i)) continue
    const owned = items as OwnedItem[]
    if (!REQUIRED_CATEGORIES.every((c) => owned.some((i) => i.category === c))) continue
    // Different means a different top, bottom or shoes; an extra jacket or watch does not count.
    const key = owned.filter((i) => (REQUIRED_CATEGORIES as readonly string[]).includes(i.category)).map((i) => i.id).sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const colourHexes = owned.map((i) => (i.colours ?? []).find((c) => HEX.test(c)) ?? '')
    const reason = finaliseReason(s.reason, season, colourHexes)
    out.push({
      name: s.name,
      occasion,
      pieces: owned.map((i) => ({
        label: i.name,
        colour_hex: (i.colours ?? []).find((c) => HEX.test(c)) ?? '#888888',
        item_id: i.id,
        in_wardrobe: true,
        category: i.category,
      })),
      description: s.description,
      reason,
    })
    if (out.length === limit) break
  }
  return out
}
