import type { BudgetTier, Department } from '@fashun/shared'
import { filterProducts, MAX_CANDIDATES } from './filters'
import { gapSearchFixturesEnabled, serpapiShopping } from './serpapi-shopping'
import { tagPhotoColour } from './colour-tag'
import { ColourTaggingError, MAX_TAGGED, matchBestColour, reasonLine, type ColourTagger, type GapPalette } from './colour'
import { colourName } from '../colour-names'
import type { GapCandidate, GapSearchCategory, GapSearchQuery, ProductSource } from './product-source'

export type { GapCandidate, GapSearchCategory, GapSearchQuery, ProductSource, RawProduct } from './product-source'
export { ProductSourceError } from './product-source'
export { MAX_CANDIDATES } from './filters'
export { gapSearchFixturesEnabled } from './serpapi-shopping'
export { ColourTaggingError, matchBestColour, reasonLine, MAX_TAGGED, type ColourTagger, type GapPalette } from './colour'

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

/** A suggested item: a candidate plus its main colour (one of the user's best) and the reason line. */
export interface GapSuggestion {
  title: string
  shop: string
  price: number
  imageUrl: string | null
  link: string | null
  productId: string | null
  /** The user's best colour the item's photo matched, "#RRGGBB". */
  colour: string
  colourName: string
  /** "Navy, one of your Winter colours." */
  reason: string
}

export interface GapSuggestionInput extends GapSearchInput {
  palette: GapPalette
}

export interface GapSuggestionDeps {
  source?: ProductSource
  tagger?: ColourTagger
}

/**
 * Up to 6 items for one gap, each in one of the user's best colours. After the tier, price, department
 * and occasion filters, the 12 cheapest candidates get their colour read from the photo (in fixture mode
 * from the saved colour, with no AI call). Unsure, pattern, avoid and neither-list colours are dropped.
 * Throws ProductSourceError when the source fails, and ColourTaggingError when no photo could be tagged.
 */
export async function findGapSuggestions(
  input: GapSuggestionInput,
  { source = serpapiShopping, tagger = tagPhotoColour }: GapSuggestionDeps = {},
): Promise<GapSuggestion[]> {
  const query: GapSearchQuery = {
    occasion: input.occasion,
    category: input.category,
    department: input.department,
    priceRange: input.priceRange,
  }
  const products = await source.search(query)
  const passed = filterProducts(products, query, input.tier, Number.POSITIVE_INFINITY)
  // The 12 cheapest are tagged; they keep the source's order.
  const cheapest = new Set([...passed].sort((a, b) => a.price - b.price).slice(0, MAX_TAGGED))
  const toTag = passed.filter((c) => cheapest.has(c))

  const fixtures = gapSearchFixturesEnabled()
  const readings = await Promise.allSettled(
    toTag.map((c): Promise<string | null> => {
      if (fixtures) return Promise.resolve(c.fixtureColour ?? null)
      if (!c.imageUrl) return Promise.resolve(null)
      return tagger(c.imageUrl)
    }),
  )
  // Every photo failing means the tagging itself is down: show "not available", not untagged items.
  if (!fixtures && toTag.some((c) => c.imageUrl) && readings.every((r, i) => !toTag[i].imageUrl || r.status === 'rejected')) {
    throw new ColourTaggingError('No photo could be colour-tagged')
  }

  const out: GapSuggestion[] = []
  toTag.forEach((c, i) => {
    const r = readings[i]
    if (out.length >= MAX_CANDIDATES || r.status !== 'fulfilled' || !r.value) return
    const colour = matchBestColour(r.value, input.palette)
    if (!colour) return
    out.push({
      title: c.title, shop: c.shop, price: c.price, imageUrl: c.imageUrl, link: c.link, productId: c.productId,
      colour, colourName: colourName(colour), reason: reasonLine(colour, input.palette.season),
    })
  })
  return out
}
