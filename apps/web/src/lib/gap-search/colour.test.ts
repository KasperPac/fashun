import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProfileColours } from '@fashun/shared'
import { ColourTaggingError, findGapSuggestions, matchBestColour, MAX_TAGGED, type GapSuggestionInput, type ProductSource, type RawProduct } from './index'

const SPRING = getProfileColours('spring')
const AUTUMN = getProfileColours('autumn')
const palette = { season: 'spring' as const, ...SPRING }

const item = (n: number, price = 20 + n): RawProduct => ({
  title: `Women's top ${n}`, shop: 'Kmart', price, imageUrl: `https://img.example/${n}.jpg`, link: `https://kmart.com.au/p/${n}`, productId: String(n),
})
const input = (over: Partial<GapSuggestionInput> = {}): GapSuggestionInput => ({
  occasion: 'casual', category: 'tops', tier: 'budget', department: 'womens', priceRange: [0, 500], palette, ...over,
})
const sourceOf = (items: RawProduct[]): ProductSource => ({ search: vi.fn(async () => items) })

afterEach(() => vi.unstubAllEnvs())

describe('matching a reading to the user\'s palette', () => {
  it('a reading near a best colour counts as that best colour', () => {
    expect(matchBestColour('#FFB347', SPRING)).toBe('#FFB347')
    expect(matchBestColour('#ffb050', SPRING)).toBe('#FFB347')
  })
  it('a reading nearest an avoid colour, or near neither list, is not kept', () => {
    expect(matchBestColour(SPRING.avoid[0], SPRING)).toBeNull()
    expect(matchBestColour('#00FF00', SPRING)).toBeNull()
  })
  it('an unreadable reading is not kept', () => {
    for (const bad of ['', 'unsure', 'navy', '#FFF']) expect(matchBestColour(bad, SPRING)).toBeNull()
  })
  it('an empty palette keeps nothing', () => {
    expect(matchBestColour('#FFB347', { best: [], avoid: [] })).toBeNull()
  })
})

describe('only items in a best colour are kept', () => {
  const tagByUrl = (map: Record<string, string | null>) => vi.fn(async (url: string) => {
    if (!(url in map)) throw new Error('unreadable')
    return map[url]
  })

  it('keeps best, drops avoid, neither, unsure and a photo that fails', async () => {
    const items = [1, 2, 3, 4, 5].map((n) => item(n))
    const tagger = tagByUrl({
      'https://img.example/1.jpg': SPRING.best[0],
      'https://img.example/2.jpg': SPRING.avoid[0],
      'https://img.example/3.jpg': '#00FF00',
      'https://img.example/4.jpg': null,
    })
    const out = await findGapSuggestions(input(), { source: sourceOf(items), tagger })
    expect(out.map((i) => i.productId)).toEqual(['1'])
    expect(out.every((i) => SPRING.best.includes(i.colour))).toBe(true)
  })

  it('uses the user\'s own palette: the same photo is kept for Autumn and dropped for Spring', async () => {
    const tagger = tagByUrl({ 'https://img.example/1.jpg': AUTUMN.best[0] })
    const items = [item(1)]
    expect(await findGapSuggestions(input({ palette: { season: 'autumn', ...AUTUMN } }), { source: sourceOf(items), tagger })).toHaveLength(1)
    expect(await findGapSuggestions(input(), { source: sourceOf(items), tagger })).toHaveLength(0)
  })

  it('tags at most 12 candidates, the cheapest, and returns at most 6', async () => {
    const items = Array.from({ length: 20 }, (_, i) => item(i, 100 - i))
    const tagger = vi.fn(async () => SPRING.best[0])
    const out = await findGapSuggestions(input(), { source: sourceOf(items), tagger })
    expect(tagger).toHaveBeenCalledTimes(MAX_TAGGED)
    expect(out).toHaveLength(6)
    expect(out.every((i) => i.price <= 92)).toBe(true)
  })

  it('does not tag items the filters already dropped', async () => {
    const tagger = vi.fn(async () => SPRING.best[0])
    const out = await findGapSuggestions(input(), { source: sourceOf([{ ...item(1), shop: 'Rodd & Gunn' }, { ...item(2), price: 9999 }]), tagger })
    expect(out).toEqual([])
    expect(tagger).not.toHaveBeenCalled()
  })

  it('an item with no photo is unsure and dropped without an AI call', async () => {
    const tagger = vi.fn(async () => SPRING.best[0])
    expect(await findGapSuggestions(input(), { source: sourceOf([{ ...item(1), imageUrl: null }]), tagger })).toEqual([])
    expect(tagger).not.toHaveBeenCalled()
  })

  it('a tagging failure for the whole batch is an error, not untagged items', async () => {
    const tagger = vi.fn(async () => { throw new Error('down') })
    await expect(findGapSuggestions(input(), { source: sourceOf([item(1), item(2)]), tagger })).rejects.toBeInstanceOf(ColourTaggingError)
  })
})

describe('each item shows photo, name, shop, AUD price and reason', () => {
  it('carries every field and a reason naming the colour and season', async () => {
    const tagger = vi.fn(async () => '#0A1A7A')
    const out = await findGapSuggestions(input({ palette: { season: 'winter', best: ['#000080', '#800020'], avoid: ['#C19A6B'] } }), { source: sourceOf([item(1)]), tagger })
    expect(out).toEqual([{
      title: "Women's top 1", shop: 'Kmart', price: 21, imageUrl: 'https://img.example/1.jpg',
      link: 'https://kmart.com.au/p/1', productId: '1',
      colour: '#000080', colourName: 'Navy', reason: 'Navy, one of your Winter colours.',
    }])
  })
  it('names each season in its own words', async () => {
    const tagger = vi.fn(async () => AUTUMN.best[0])
    const [one] = await findGapSuggestions(input({ palette: { season: 'autumn', ...AUTUMN } }), { source: sourceOf([item(1)]), tagger })
    expect(one.reason).toMatch(/^.+, one of your Autumn colours\.$/)
  })
})

describe('fixture mode makes no AI call', () => {
  it('uses the saved colour: keeps best, drops avoid and unsure, never calls the tagger', async () => {
    vi.stubEnv('GAP_SEARCH_FIXTURES', '1')
    const items: RawProduct[] = [
      { ...item(1), fixtureColour: SPRING.best[0] },
      { ...item(2), fixtureColour: SPRING.avoid[0] },
      { ...item(3), fixtureColour: 'unsure' },
      item(4),
    ]
    const tagger = vi.fn(async () => SPRING.best[0])
    const out = await findGapSuggestions(input(), { source: sourceOf(items), tagger })
    expect(out.map((i) => i.productId)).toEqual(['1'])
    expect(tagger).not.toHaveBeenCalled()
  })

  it('the saved results give best, avoid and unsure items for a Spring and an Autumn user, in every category', async () => {
    vi.stubEnv('GAP_SEARCH_FIXTURES', '1')
    const tagger = vi.fn()
    for (const category of ['tops', 'bottoms', 'shoes'] as const) {
      for (const [season, colours] of [['spring', SPRING], ['autumn', AUTUMN]] as const) {
        const out = await findGapSuggestions(input({ category, department: 'both', tier: 'mid', occasion: 'casual', palette: { season, ...colours } }))
        expect(out.length, `${category} ${season}`).toBeGreaterThan(0)
        expect(out.every((i) => colours.best.includes(i.colour) && i.reason.endsWith(`one of your ${season[0].toUpperCase()}${season.slice(1)} colours.`))).toBe(true)
      }
    }
    expect(tagger).not.toHaveBeenCalled()
  })
})
