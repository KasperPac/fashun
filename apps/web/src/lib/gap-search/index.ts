import { BUDGET_TIER_DEFINITIONS, type BudgetTier, type Department } from '@fashun/shared'
import { countFilterDrops, filterProducts, MAX_CANDIDATES, type FilterDrops } from './filters'
import { gapSearchFixturesEnabled, searchParams, serpapiShopping } from './serpapi-shopping'
import { tagPhotoColour } from './colour-tag'
import { ColourTaggingError, MAX_TAGGED, TITLE_MATCH_DISTANCE, matchBestColour, reasonLine, type ColourTagger, type GapPalette } from './colour'
import { titleColour } from './title-colour'
import { colourName } from '../colour-names'
import { ProductSourceError, type GapCandidate, type GapSearchCategory, type GapSearchQuery, type ProductSource, type RawProduct } from './product-source'

export type { GapCandidate, GapSearchCategory, GapSearchQuery, ProductSource, RawProduct } from './product-source'
export { ProductSourceError } from './product-source'
export { MAX_CANDIDATES } from './filters'
export type { FilterDrops } from './filters'
export { gapSearchFixturesEnabled } from './serpapi-shopping'
export { ColourTaggingError, matchBestColour, reasonLine, MAX_TAGGED, type ColourTagger, type GapPalette } from './colour'

export interface GapSearchInput {
  occasion: GapSearchQuery['occasion']
  category: GapSearchCategory
  tier: BudgetTier
  department: Department
  /** The user's slider range for the category in A$, ends included. */
  priceRange: readonly [number, number]
  /** The tier shops to search, one search each. Defaults to all of the tier's shops; fewer when the month's allowance is short. */
  shops?: readonly string[]
}

/** One shop's search, kept for the log line. `raw` is null when the call failed. */
interface ShopAnswer {
  shop: string
  products: RawProduct[] | null
}

/**
 * One search per shop, all at once. A shop whose search fails is left out; only when every search
 * fails does it throw. The answers are merged shop by shop in turns (first item of each shop, then
 * the second, and so on) so the items are spread across the shops, with a shop's own order kept.
 */
async function searchEachShop(source: ProductSource, query: GapSearchQuery, shops: readonly string[]): Promise<{ answers: ShopAnswer[]; merged: RawProduct[] }> {
  const settled = await Promise.allSettled(shops.map((shop) => source.search({ ...query, shop })))
  const answers: ShopAnswer[] = settled.map((r, i) => ({ shop: shops[i], products: r.status === 'fulfilled' ? r.value : null }))
  if (answers.length > 0 && answers.every((a) => a.products === null)) {
    throw new ProductSourceError('Product search failed for every shop')
  }
  const lists = answers.map((a) => a.products ?? [])
  const merged: RawProduct[] = []
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length) merged.push(l[i])
  }
  return { answers, merged }
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
    tier: input.tier,
    priceRange: input.priceRange,
  }
  const { merged } = await searchEachShop(source, query, input.shops ?? BUDGET_TIER_DEFINITIONS[input.tier].shops)
  return filterProducts(merged, query, input.tier)
}

/** A suggested item: a candidate plus its main colour (one of the user's best) and the reason line. */
export interface GapSuggestion {
  title: string
  shop: string
  price: number
  imageUrl: string | null
  link: string | null
  productId: string | null
  /** Google's page token for the item, kept so the shop link can list its stores with one call. */
  immersiveToken?: string
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
  /** Diagnosis only: called when the answer is empty, with the counts dropped at each step. */
  onEmpty?: (counts: EmptyCounts) => void
  /** Called once per search, empty or not, with what was sent and what each step kept. */
  onSearch?: (log: SearchLog) => void
}

/** One shop's search, explained: the parameters sent (no key), whether it worked, the shops that came back and the count left after each filter. */
export interface SearchLog {
  shop: string
  /** False when this shop's search failed (error or timeout); the other shops still show. */
  ok: boolean
  params: Record<string, string>
  counts: FilterDrops
  /** Distinct shop names in the raw answer, at most 30. */
  shops: string[]
}

/** Why a live search ended empty: raw results, then what each filter dropped. */
export interface EmptyCounts extends FilterDrops {
  /** Passed the filters but dropped at the colour step (no photo, unsure, pattern, avoid or neither-list colour). */
  colourDropped: number
  /** Of those, how many had a colour word in the title that isn't one of the user's best colours. */
  titleColourDropped: number
}

/**
 * Up to 6 items for one gap, each in one of the user's best colours. After the tier, price, department
 * and occasion filters, the 12 cheapest candidates get their colour read from the photo (in fixture mode
 * from the saved colour, with no AI call). Unsure, pattern, avoid and neither-list colours are dropped.
 * Throws ProductSourceError when the source fails, and ColourTaggingError when no photo could be tagged.
 */
export async function findGapSuggestions(
  input: GapSuggestionInput,
  { source = serpapiShopping, tagger = tagPhotoColour, onEmpty, onSearch }: GapSuggestionDeps = {},
): Promise<GapSuggestion[]> {
  const query: GapSearchQuery = {
    occasion: input.occasion,
    category: input.category,
    department: input.department,
    tier: input.tier,
    priceRange: input.priceRange,
  }
  const shops = input.shops ?? BUDGET_TIER_DEFINITIONS[input.tier].shops
  const { answers, merged: products } = await searchEachShop(source, query, shops)
  const passed = filterProducts(products, query, input.tier, Number.POSITIVE_INFINITY)
  // The 12 cheapest are tagged; they keep the source's order.
  const cheapest = new Set([...passed].sort((a, b) => a.price - b.price).slice(0, MAX_TAGGED))
  const toTag = passed.filter((c) => cheapest.has(c))

  const fixtures = gapSearchFixturesEnabled()
  const readings = await Promise.allSettled(
    toTag.map((c): Promise<string | null> => {
      if (titleColour(c.title)) return Promise.resolve(null)
      if (fixtures) return Promise.resolve(c.fixtureColour ?? null)
      if (!c.imageUrl) return Promise.resolve(null)
      return tagger(c.imageUrl)
    }),
  )
  // Every photo failing means the tagging itself is down: show "not available", not untagged items.
  const photoRead = (i: number) => !titleColour(toTag[i].title) && !!toTag[i].imageUrl
  if (!fixtures && toTag.some((_, i) => photoRead(i)) && readings.every((r, i) => !photoRead(i) || r.status === 'rejected')) {
    throw new ColourTaggingError('No photo could be colour-tagged')
  }

  const out: GapSuggestion[] = []
  toTag.forEach((c, i) => {
    const r = readings[i]
    // A colour word in the title is the item's colour; the photo reading is used only when the title has none.
    const word = titleColour(c.title)
    if (out.length >= MAX_CANDIDATES || (!word && (r.status !== 'fulfilled' || !r.value))) return
    const reading = word ?? (r as PromiseFulfilledResult<string | null>).value
    const colour = reading ? matchBestColour(reading, input.palette, word ? TITLE_MATCH_DISTANCE : undefined) : null
    // The title's word and the colour the reason names must be the same colour, or the card contradicts itself.
    if (!colour || (word && colourName(colour) !== colourName(word))) return
    out.push({
      title: c.title, shop: c.shop, price: c.price, imageUrl: c.imageUrl, link: c.link, productId: c.productId,
      ...(c.immersiveToken ? { immersiveToken: c.immersiveToken } : {}),
      colour, colourName: colourName(colour), reason: reasonLine(colour, input.palette.season),
    })
  })
  if (out.length === 0 && onEmpty) {
    const drops = countFilterDrops(products, query, input.tier)
    const titleColourDropped = passed.filter((c) => titleColour(c.title)).length
    onEmpty({ ...drops, colourDropped: drops.passed, titleColourDropped })
  }
  if (onSearch) {
    for (const a of answers) {
      const shopQuery = { ...query, shop: a.shop }
      const list = a.products ?? []
      onSearch({
        shop: a.shop,
        ok: a.products !== null,
        params: searchParams(shopQuery),
        counts: countFilterDrops(list, shopQuery, input.tier),
        shops: [...new Set(list.map((p) => p.shop))].slice(0, 30),
      })
    }
  }
  return out
}
