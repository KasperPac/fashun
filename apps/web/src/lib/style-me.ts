import { OCCASIONS, OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, OccasionTag } from '@fashun/shared'

export type RequiredCategory = 'tops' | 'bottoms' | 'shoes'

export const OCCASION_DESCRIPTIONS: Record<OccasionTag, string> = {
  casual: 'Weekends, errands, relaxed days',
  'smart-casual': 'Dinner, drinks, a nice lunch',
  work: 'Office days and meetings',
  formal: 'Weddings, events, black tie',
}

/** Decorative bar beside the reason line, one per season (design spec, team notes). */
export const SEASON_ACCENTS: Record<ColourSeason, string> = {
  autumn: '#A0461E',
  spring: '#E8735A',
  summer: '#5B7A9D',
  winter: '#2448A8',
}

export function isOccasion(value: unknown): value is OccasionTag {
  return typeof value === 'string' && (OCCASIONS as readonly string[]).includes(value)
}

const lower = (occasion: OccasionTag) => OCCASION_LABELS[occasion].toLowerCase()

/** One line per missing piece, e.g. "a pair of formal shoes". */
export function missingPieceLine(category: RequiredCategory, occasion: OccasionTag): string {
  const occ = lower(occasion)
  switch (category) {
    case 'tops':
      return occasion === 'formal' ? 'a formal shirt or top' : `a ${occ} top`
    case 'bottoms':
      return `${occ} trousers or a skirt`
    case 'shoes':
      return `a pair of ${occ} shoes`
  }
}

export function notEnoughTitle(occasion: OccasionTag): string {
  return `Not enough for ${OCCASION_LABELS[occasion]} yet`
}

export function notEnoughIntro(occasion: OccasionTag): string {
  return `To make ${OCCASION_LABELS[occasion]} outfits, add:`
}

const HAVE_WORDS: Record<RequiredCategory, (o: OccasionTag) => string> = {
  tops: (o) => (o === 'formal' ? 'shirt' : 'top'),
  bottoms: () => 'trousers',
  shoes: () => 'shoes',
}

/** "Your formal shirt and trousers are ready.", or null when nothing is ready yet. */
export function readyLine(occasion: OccasionTag, have: RequiredCategory[]): string | null {
  const words = (['tops', 'bottoms', 'shoes'] as const).filter((c) => have.includes(c)).map((c) => HAVE_WORDS[c](occasion))
  if (words.length === 0) return null
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
  return `Your ${lower(occasion)} ${list} ${words.length === 1 && words[0] !== 'shoes' && words[0] !== 'trousers' ? 'is' : 'are'} ready.`
}

/** When the model, not the wardrobe, returned fewer than 3: "We only got 2 Work outfits this time. Try again for more." */
export function fewerFromModelMessage(count: number, occasion: OccasionTag): string {
  return `We only got ${count} ${OCCASION_LABELS[occasion]} ${count === 1 ? 'outfit' : 'outfits'} this time. Try again for more.`
}

/** When the wardrobe is the limit: "We could only make 2 Work outfits from your wardrobe. Add a work top for more choice." */
export function fewerMessage(count: number, occasion: OccasionTag, missing: RequiredCategory | null): string {
  const base = `We could only make ${count} ${OCCASION_LABELS[occasion]} ${count === 1 ? 'outfit' : 'outfits'} from your wardrobe.`
  return missing ? `${base} Add ${missingPieceLine(missing, occasion)} for more choice.` : base
}

export function loadingLine(occasion: OccasionTag): string {
  return `Putting together ${OCCASION_LABELS[occasion]} outfits from your wardrobe…`
}

export function pickerSubtitle(season: ColourSeason | null): string {
  if (!season) return 'Up to 3 outfits from your own clothes, in your colours.'
  return `Up to 3 outfits from your own clothes, in your ${season.charAt(0).toUpperCase()}${season.slice(1)} palette.`
}

export function styleButtonLabel(occasion: OccasionTag | null): string {
  return occasion ? `Style me for ${OCCASION_LABELS[occasion]}` : 'Style me'
}

/** Keeps a position inside 0..count-1; 0 when there is nothing to show. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(Math.max(index, 0), count - 1)
}

/** Which of `count` equal-width slides is showing, from the scroll position. */
export function slideIndex(scrollLeft: number, slideWidth: number, count: number): number {
  if (slideWidth <= 0) return 0
  return clampIndex(Math.round(scrollLeft / slideWidth), count)
}

export interface StyledPiece {
  label: string
  colour_hex: string
  item_id: string
  in_wardrobe: true
  category: string
  image_url: string | null
}

export interface StyledOutfit {
  name: string
  occasion: OccasionTag
  description: string
  reason: string
  pieces: StyledPiece[]
}

/** Order on a hang tag: top, bottom, shoes always, then outerwear, bag, accessory. */
const PIECE_ORDER = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']

export function sortPieces<T extends { category: string | null }>(pieces: T[]): T[] {
  const rank = (c: string | null) => {
    const i = c ? PIECE_ORDER.indexOf(c) : -1
    return i === -1 ? PIECE_ORDER.length : i
  }
  return [...pieces].sort((a, b) => rank(a.category) - rank(b.category))
}

/** The body for POST /api/outfits when the user taps Save. */
export function saveBody(outfit: StyledOutfit, season: ColourSeason | null) {
  return {
    name: outfit.name,
    occasion: outfit.occasion,
    description: outfit.description,
    reason: outfit.reason,
    ...(season ? { season } : {}),
    pieces: outfit.pieces.map(({ label, colour_hex, item_id, in_wardrobe }) => ({ label, colour_hex, item_id, in_wardrobe })),
  }
}

export type StyleResult =
  | { kind: 'outfits'; outfits: StyledOutfit[]; season: ColourSeason | null; missing: RequiredCategory | null; limited: boolean }
  | { kind: 'not-enough'; missing: RequiredCategory[]; have: RequiredCategory[] }
  | { kind: 'no-profile' }
  | { kind: 'error' }

const REQUIRED: RequiredCategory[] = ['tops', 'bottoms', 'shoes']
const asRequired = (value: unknown): RequiredCategory[] =>
  Array.isArray(value) ? REQUIRED.filter((c) => value.includes(c)) : []

/** Turns an /api/outfits/generate response into what the screen shows. */
export function readGenerateResponse(status: number, json: unknown): StyleResult {
  const body = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  if (status === 422 && body.code === 'not_enough_items') {
    return { kind: 'not-enough', missing: asRequired(body.missing), have: asRequired(body.have) }
  }
  if (status === 422 && body.code === 'no_colour_profile') return { kind: 'no-profile' }
  if (status < 200 || status >= 300 || !Array.isArray(body.suggestions) || body.suggestions.length === 0) return { kind: 'error' }
  const season = ['spring', 'summer', 'autumn', 'winter'].includes(body.season as string) ? (body.season as ColourSeason) : null
  return { kind: 'outfits', outfits: body.suggestions as StyledOutfit[], season, missing: asRequired(body.missing)[0] ?? null, limited: body.limited === true }
}

/** The data-occasion theme name for an occasion. */
export function occasionTheme(occasion: OccasionTag): 'casual' | 'smart' | 'work' | 'formal' {
  return occasion === 'smart-casual' ? 'smart' : occasion
}
