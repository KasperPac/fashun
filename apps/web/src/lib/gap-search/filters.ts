import type { BudgetTier, Department } from '@fashun/shared'
import { isShopInTier } from './shop-names'
import type { GapCandidate, GapSearchCategory, GapSearchQuery, RawProduct } from './product-source'

export const MAX_CANDIDATES = 6

const WOMENS = /\b(women|womens|woman|ladies|lady|girls?|female|her)\b/i
const MENS = /\b(men|mens|man|gents|boys?|male|him)\b/i

/** Which department a title is written for. Neither word, or both, means unisex. */
export function itemDepartment(title: string): 'mens' | 'womens' | 'unisex' {
  const text = title.replace(/['’]s\b/gi, 's')
  const w = WOMENS.test(text)
  const m = MENS.test(text)
  if (w && !m) return 'womens'
  if (m && !w) return 'mens'
  return 'unisex'
}

export function matchesDepartment(title: string, department: Department): boolean {
  if (department === 'both') return true
  const d = itemDepartment(title)
  return d === 'unisex' || d === department
}

type Occasion = GapSearchQuery['occasion']

const SNEAKERS = /sneaker|trainer|runner|running|athletic|basketball|\bsport/i
const OPEN_CASUAL = /\bthongs?\b|flip[\s-]?flops?|\bslides?\b|slippers?|\bcrocs?\b|\bclogs?\b|\bscuffs?\b/i
const HOODIES = /hoodie|hoody|\bhooded\b|sweatshirt|\bcrew\s?sweat/i
const VESTS = /singlet|tank top|\btank\b|crop top|muscle tee/i
const SPORT_BOTTOMS = /jogger|track\s?pants?|trackies|sweat\s?pants?|leggings?|board\s?shorts?|gym shorts?/i
const SHORTS = /\bshorts\b/i

/**
 * Words that make an item wrong for the occasion, by category. Heuristic on the
 * title, since the source gives no style data. Casual has no exclusions.
 */
const EXCLUSIONS: Record<GapSearchCategory, Partial<Record<Occasion, RegExp[]>>> = {
  shoes: {
    formal: [SNEAKERS, OPEN_CASUAL],
    work: [OPEN_CASUAL],
    'smart-casual': [OPEN_CASUAL],
  },
  tops: {
    formal: [HOODIES, VESTS],
    work: [HOODIES, VESTS],
    'smart-casual': [HOODIES, VESTS],
  },
  bottoms: {
    formal: [SPORT_BOTTOMS, SHORTS],
    work: [SPORT_BOTTOMS, SHORTS],
    'smart-casual': [SPORT_BOTTOMS],
  },
}

export function suitsOccasion(title: string, category: GapSearchCategory, occasion: Occasion): boolean {
  const rules = EXCLUSIONS[category][occasion] ?? []
  return !rules.some((re) => re.test(title))
}

export function inRange(price: number | null, range: readonly [number, number]): price is number {
  return price !== null && Number.isFinite(price) && price >= range[0] && price <= range[1]
}

/** True when the item's link, or its shop and title, was already seen; otherwise records both. */
function isDuplicate(p: RawProduct, seen: Set<string>): boolean {
  const byShopTitle = `st:${p.shop}|${p.title}`.toLowerCase()
  const byLink = p.link ? `l:${p.link}` : null
  if (seen.has(byShopTitle) || (byLink !== null && seen.has(byLink))) return true
  seen.add(byShopTitle)
  if (byLink !== null) seen.add(byLink)
  return false
}

/**
 * Keeps items from the tier's shops, priced inside the range (ends included),
 * for the department and suited to the occasion. Drops duplicates (same link or
 * same shop and title), keeps the source's order and returns at most `limit` (6).
 */
export function filterProducts(products: RawProduct[], query: GapSearchQuery, tier: BudgetTier, limit = MAX_CANDIDATES): GapCandidate[] {
  const seen = new Set<string>()
  const out: GapCandidate[] = []
  for (const p of products) {
    if (out.length >= limit) break
    if (!isShopInTier(p.shop, tier)) continue
    if (!inRange(p.price, query.priceRange)) continue
    if (!matchesDepartment(p.title, query.department)) continue
    if (!suitsOccasion(p.title, query.category, query.occasion)) continue
    if (isDuplicate(p, seen)) continue
    out.push({
      title: p.title, shop: p.shop, price: p.price, imageUrl: p.imageUrl, link: p.link, productId: p.productId,
      ...(p.immersiveToken ? { immersiveToken: p.immersiveToken } : {}),
      ...(p.fixtureColour ? { fixtureColour: p.fixtureColour } : {}),
    })
  }
  return out
}

/** How many raw results each filter dropped, in filter order (an item is counted at the first filter that drops it). */
export interface FilterDrops {
  raw: number
  notTierShop: number
  outOfPrice: number
  wrongDepartmentOrOccasion: number
  duplicate: number
  passed: number
}

/** Diagnosis only: the counts behind an empty answer. Applies the same filters as filterProducts. */
export function countFilterDrops(products: RawProduct[], query: GapSearchQuery, tier: BudgetTier): FilterDrops {
  const drops: FilterDrops = { raw: products.length, notTierShop: 0, outOfPrice: 0, wrongDepartmentOrOccasion: 0, duplicate: 0, passed: 0 }
  const seen = new Set<string>()
  for (const p of products) {
    if (!isShopInTier(p.shop, tier)) { drops.notTierShop++; continue }
    if (!inRange(p.price, query.priceRange)) { drops.outOfPrice++; continue }
    if (!matchesDepartment(p.title, query.department) || !suitsOccasion(p.title, query.category, query.occasion)) { drops.wrongDepartmentOrOccasion++; continue }
    if (isDuplicate(p, seen)) { drops.duplicate++; continue }
    drops.passed++
  }
  return drops
}
