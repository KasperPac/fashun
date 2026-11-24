import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { BUDGET_TIER_DEFINITIONS, tierRanges, type BudgetTier, type Department } from '@fashun/shared'
import { findGapCandidates, findGapSuggestions, MAX_CANDIDATES, ProductSourceError, type GapSearchInput, type ProductSource, type RawProduct } from './index'
import { countFilterDrops, filterProducts, itemDepartment } from './filters'
import { titleColour } from './title-colour'
import { buildSearchText } from './query'
import { isShopInTier, normaliseShopName } from './shop-names'
import { parseShoppingResults, serpapiShopping } from './serpapi-shopping'

const input = (over: Partial<GapSearchInput> & Pick<GapSearchInput, 'category'>): GapSearchInput => {
  const tier = over.tier ?? 'budget'
  return {
    occasion: 'casual', tier, department: 'both',
    priceRange: tierRanges(tier)[over.category],
    ...over,
  }
}
const raw = (title: string, shop: string, price: number | null): RawProduct =>
  ({ title, shop, price, imageUrl: null, link: `https://example.test/${title}-${shop}-${price}`, productId: null })
const sourceOf = (products: RawProduct[]): ProductSource => ({ search: async () => products })

beforeEach(() => {
  vi.stubEnv('GAP_SEARCH_FIXTURES', '1')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network call in a test') }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const TIERS: BudgetTier[] = ['budget', 'high-street', 'mid', 'premium']

describe('items outside the slider range are dropped', () => {
  const gaps: GapSearchInput['category'][] = ['shoes', 'tops', 'bottoms']
  for (const tier of ['budget', 'premium'] as const) {
    for (const category of gaps) {
      it(`${category} at ${tier}: every price is inside the range`, async () => {
        const range = tierRanges(tier)[category]
        const items = await findGapCandidates(input({ category, tier }))
        expect(items.length).toBeGreaterThan(0)
        for (const i of items) {
          expect(i.price).toBeGreaterThanOrEqual(range[0])
          expect(i.price).toBeLessThanOrEqual(range[1])
        }
      })
    }
  }
  it('uses the user\'s moved slider, not the tier\'s start range', async () => {
    const items = await findGapCandidates(input({ category: 'shoes', tier: 'premium', priceRange: [300, 400] }))
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i) => i.price >= 300 && i.price <= 400)).toBe(true)
  })
  it('keeps items exactly on the min and max, drops a cent either side and items with no price', async () => {
    const products = [
      raw('Men Shoe A', 'Kmart', 14.99), raw('Men Shoe B', 'Kmart', 15), raw('Men Shoe C', 'Kmart', 60),
      raw('Men Shoe D', 'Kmart', 60.01), raw('Men Shoe E', 'Kmart', null), raw('Men Shoe F', 'Kmart', Number.NaN),
    ]
    const items = await findGapCandidates(input({ category: 'shoes' }), sourceOf(products))
    expect(items.map((i) => i.price)).toEqual([15, 60])
  })
})

describe('only shops in the chosen tier are shown', () => {
  const outOf: Record<BudgetTier, string[]> = {
    budget: ['Rodd & Gunn', 'R.M. Williams', 'M.J. Bale'],
    premium: ['Kmart', 'Target', 'Big W'],
    'high-street': [], mid: [],
  }
  for (const tier of TIERS) {
    it(`${tier}: every item is from the tier's shops`, async () => {
      for (const category of ['tops', 'bottoms', 'shoes'] as const) {
        const items = await findGapCandidates(input({ category, tier }))
        expect(items.length).toBeGreaterThan(0)
        for (const i of items) expect(isShopInTier(i.shop, tier)).toBe(true)
      }
    })
  }
  it('budget never returns Rodd & Gunn, R.M. Williams or M.J. Bale, even inside the price range', async () => {
    const products = outOf.budget.map((s) => raw('Men Shirt', s, 30)).concat(raw('Men Shirt', 'Kmart', 30))
    const items = await findGapCandidates(input({ category: 'tops', tier: 'budget' }), sourceOf(products))
    expect(items.map((i) => i.shop)).toEqual(['Kmart'])
  })
  it('premium never returns Kmart, Target or Big W, even inside the price range', async () => {
    const products = outOf.premium.map((s) => raw('Men Shirt', s, 150)).concat(raw('Men Shirt', 'Rodd & Gunn', 150))
    const items = await findGapCandidates(input({ category: 'tops', tier: 'premium' }), sourceOf(products))
    expect(items.map((i) => i.shop)).toEqual(['Rodd & Gunn'])
  })
  it('drops shops that only look like a tier shop', async () => {
    const products = ['Amazon.com.au', 'Kmart Home', 'Target Country', 'Big W Outlet', 'Kmartian'].map((s) => raw('Men Shirt', s, 30))
    expect(await findGapCandidates(input({ category: 'tops', tier: 'budget' }), sourceOf(products))).toEqual([])
  })
})

describe('shop name matching', () => {
  it.each([
    ['Kmart Australia', 'kmart'], ['KMART', 'kmart'], ['Target AU', 'target'], ['Big W', 'bigw'],
    ['R.M. Williams', 'rmwilliams'], ['rmwilliams.com.au', 'rmwilliams'], ['Rodd & Gunn', 'roddandgunn'],
    ['Rodd and Gunn Australia', 'roddandgunn'], ['M.J. Bale', 'mjbale'], ['H&M', 'handm'], ['THE ICONIC', 'theiconic'],
    ['Cotton On Official Store', 'cottonon'], ['  ', ''],
  ])('%s -> %s', (name, expected) => expect(normaliseShopName(name)).toBe(expected))
  it('matches the display name and common source spellings to the same tier', () => {
    expect(isShopInTier('Kmart Australia', 'budget')).toBe(true)
    expect(isShopInTier('MYER', 'mid')).toBe(true)
    expect(isShopInTier('David Jones', 'mid')).toBe(true)
    expect(isShopInTier('H&M', 'high-street')).toBe(true)
    expect(isShopInTier('Kmart', 'premium')).toBe(false)
    expect(isShopInTier('', 'budget')).toBe(false)
  })
})

describe('items unsuitable for the occasion are dropped', () => {
  const titles = (items: { title: string }[]) => items.map((i) => i.title.toLowerCase())
  for (const tier of ['budget', 'premium'] as const) {
    it(`Formal shoes never return sneakers or thongs (${tier})`, async () => {
      const items = await findGapCandidates(input({ category: 'shoes', occasion: 'formal', tier }))
      expect(items.length).toBeGreaterThan(0)
      for (const t of titles(items)) expect(t).not.toMatch(/sneaker|trainer|running|thong|flip|slide/)
    })
    it(`Work tops never return a hoodie (${tier})`, async () => {
      const items = await findGapCandidates(input({ category: 'tops', occasion: 'work', tier }))
      expect(items.length).toBeGreaterThan(0)
      for (const t of titles(items)) expect(t).not.toMatch(/hood|sweatshirt/)
    })
  }
  it('drops them from a list that mixes good and bad items', async () => {
    const shoes = [
      "Men's Canvas Sneakers", 'Rubber Thongs', "Women's Flip Flops", 'Running Trainers', 'Pool Slides', "Men's Leather Oxford Shoes",
    ].map((t) => raw(t, 'Kmart', 30))
    const items = await findGapCandidates(input({ category: 'shoes', occasion: 'formal' }), sourceOf(shoes))
    expect(items.map((i) => i.title)).toEqual(["Men's Leather Oxford Shoes"])
    const tops = ["Men's Pullover Hoodie", 'Hooded Jacket Top', "Men's Oxford Shirt"].map((t) => raw(t, 'Kmart', 30))
    const out = await findGapCandidates(input({ category: 'tops', occasion: 'work' }), sourceOf(tops))
    expect(out.map((i) => i.title)).toEqual(["Men's Oxford Shirt"])
  })
  it('does not exclude sneakers or hoodies for Casual', async () => {
    const items = await findGapCandidates(
      input({ category: 'shoes', occasion: 'casual' }),
      sourceOf([raw("Men's Canvas Sneakers", 'Kmart', 30)]),
    )
    expect(items).toHaveLength(1)
  })
})

describe('department filters items', () => {
  const mixed = (): RawProduct[] => [
    raw("Men's Oxford Shirt", 'Kmart', 20), raw("Women's Poplin Shirt", 'Kmart', 20), raw('Cotton Crew Neck Tee', 'Kmart', 20),
    raw('Womens Linen Blouse', 'Kmart', 20), raw('Mens Polo', 'Kmart', 20), raw("Men's and Women's Tee", 'Kmart', 20),
  ]
  const run = async (department: Department) =>
    (await findGapCandidates(input({ category: 'tops', department }), sourceOf(mixed()))).map((i) => i.title)

  it("men's returns no women's item", async () => {
    const t = await run('mens')
    expect(t).toEqual(["Men's Oxford Shirt", 'Cotton Crew Neck Tee', 'Mens Polo', "Men's and Women's Tee"])
  })
  it("women's returns no men's item", async () => {
    const t = await run('womens')
    expect(t).toEqual(["Women's Poplin Shirt", 'Cotton Crew Neck Tee', 'Womens Linen Blouse', "Men's and Women's Tee"])
  })
  it('both returns either', async () => {
    expect(await run('both')).toHaveLength(6)
  })
  it('reads the department from the title, and "women" is not "men"', () => {
    expect(itemDepartment("Women's Shirt")).toBe('womens')
    expect(itemDepartment("Men's Shirt")).toBe('mens')
    expect(itemDepartment('Ladies Boots')).toBe('womens')
    expect(itemDepartment('Boys Tee')).toBe('mens')
    expect(itemDepartment('Crew Tee')).toBe('unisex')
    expect(itemDepartment("Men's & Women's Tee")).toBe('unisex')
  })
  it('on the saved results, men\'s and women\'s never see the other\'s items', async () => {
    for (const category of ['tops', 'bottoms', 'shoes'] as const) {
      for (const tier of TIERS) {
        const m = await findGapCandidates(input({ category, tier, department: 'mens' }))
        const w = await findGapCandidates(input({ category, tier, department: 'womens' }))
        expect(m.length).toBeGreaterThan(0)
        expect(w.length).toBeGreaterThan(0)
        for (const i of m) expect(itemDepartment(i.title)).not.toBe('womens')
        for (const i of w) expect(itemDepartment(i.title)).not.toBe('mens')
      }
    }
  })
})

describe('result size', () => {
  it('returns at most 6 items', async () => {
    const many = Array.from({ length: 10 }, (_, k) => raw(`Men Shirt ${k}`, 'Kmart', 20))
    expect(await findGapCandidates(input({ category: 'tops' }), sourceOf(many))).toHaveLength(MAX_CANDIDATES)
    expect(MAX_CANDIDATES).toBe(6)
    const fromFixture = await findGapCandidates(input({ category: 'tops' }))
    expect(fromFixture).toHaveLength(6)
  })
  it('an empty result is a normal answer, not an error', async () => {
    expect(await findGapCandidates(input({ category: 'tops' }), sourceOf([]))).toEqual([])
    expect(await findGapCandidates(input({ category: 'tops', priceRange: [9000, 9999] }))).toEqual([])
  })
  it('drops a repeated listing', async () => {
    const a = raw('Men Shirt', 'Kmart', 20)
    expect(await findGapCandidates(input({ category: 'tops' }), sourceOf([a, { ...a }]))).toHaveLength(1)
  })
})

describe('saved results (fixture mode)', () => {
  it('answers from saved results and makes no network call', async () => {
    const fetchSpy = vi.mocked(fetch)
    for (const category of ['tops', 'bottoms', 'shoes'] as const) {
      const found = await serpapiShopping.search({ occasion: 'work', category, department: 'both', tier: 'budget', priceRange: [0, 1000] })
      expect(found.length).toBeGreaterThan(20)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('the saved results cover every tier shop in every category, with items to drop', () => {
    for (const category of ['tops', 'bottoms', 'shoes'] as const) {
      const file = path.join(__dirname, 'fixtures', `google-shopping-au-${category}.json`)
      const products = parseShoppingResults(JSON.parse(readFileSync(file, 'utf8')))
      for (const tier of TIERS) {
        for (const shop of BUDGET_TIER_DEFINITIONS[tier].shops) {
          expect(products.some((p) => normaliseShopName(p.shop) === normaliseShopName(shop))).toBe(true)
        }
      }
      expect(products.some((p) => p.price === null)).toBe(true)
    }
  })
})

describe('the live source', () => {
  it('asks Google Shopping Australia with the price range and no fixture setting', async () => {
    vi.stubEnv('GAP_SEARCH_FIXTURES', '')
    vi.stubEnv('SERPAPI_API_KEY', 'test-key-not-real')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ shopping_results: [{ title: "Men's Shirt", source: 'Kmart', extracted_price: 20, thumbnail: 'https://x.test/t.jpg', link: 'https://www.kmart.com.au/p/1' }] })))
    vi.stubGlobal('fetch', fetchMock)
    const found = await serpapiShopping.search({ occasion: 'formal', category: 'shoes', department: 'mens', tier: 'budget', priceRange: [20, 80] })
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0])
    expect(url.searchParams.get('engine')).toBe('google_shopping')
    expect(url.searchParams.get('gl')).toBe('au')
    expect(url.searchParams.get('location')).toBe('Australia')
    expect(url.searchParams.get('q')).toBe("men's formal shoes (Kmart OR Target OR Big W)")
    expect(url.searchParams.get('min_price')).toBe('20')
    expect(url.searchParams.get('max_price')).toBe('80')
    expect(found).toEqual([{ title: "Men's Shirt", shop: 'Kmart', price: 20, imageUrl: 'https://x.test/t.jpg', link: 'https://www.kmart.com.au/p/1', productId: null, immersiveToken: null }])
  })
  it('throws a ProductSourceError without a key, on HTTP failure and on an unreadable answer', async () => {
    vi.stubEnv('GAP_SEARCH_FIXTURES', '')
    vi.stubEnv('SERPAPI_API_KEY', '')
    const q = { occasion: 'work', category: 'tops', department: 'both', tier: 'budget', priceRange: [0, 100] } as const
    await expect(serpapiShopping.search(q)).rejects.toBeInstanceOf(ProductSourceError)
    vi.stubEnv('SERPAPI_API_KEY', 'test-key-not-real')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 429 })))
    await expect(serpapiShopping.search(q)).rejects.toBeInstanceOf(ProductSourceError)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>')))
    await expect(serpapiShopping.search(q)).rejects.toBeInstanceOf(ProductSourceError)
  })
  it('a response with no shopping_results is an empty list; a price string is read when there is no number', () => {
    expect(parseShoppingResults({ error: 'Google hasn\'t returned any results for this query.' })).toEqual([])
    expect(parseShoppingResults(null)).toEqual([])
    const [p] = parseShoppingResults({ shopping_results: [{ title: 'A', source: 'Kmart', price: 'A$1,200.50' }, { title: 'B' }] })
    expect(p.price).toBe(1200.5)
  })
  it('builds the search words', () => {
    expect(buildSearchText({ occasion: 'smart-casual', category: 'bottoms', department: 'womens', tier: 'mid' })).toBe("women's smart casual pants (Country Road OR Myer OR David Jones OR THE ICONIC)")
    expect(buildSearchText({ occasion: 'work', category: 'tops', department: 'both', tier: 'budget' })).toBe('work tops (Kmart OR Target OR Big W)')
  })
  it.each([
    ['budget', 'work shoes (Kmart OR Target OR Big W)'],
    ['high-street', 'work shoes (Uniqlo OR Cotton On OR H&M)'],
    ['mid', 'work shoes (Country Road OR Myer OR David Jones OR THE ICONIC)'],
    ['premium', 'work shoes (Rodd & Gunn OR R.M. Williams OR M.J. Bale)'],
  ] as const)('the one search for the %s tier names that tier\'s shops', async (tier, words) => {
    vi.stubEnv('GAP_SEARCH_FIXTURES', '')
    vi.stubEnv('SERPAPI_API_KEY', 'test-key-not-real')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ shopping_results: [] })))
    vi.stubGlobal('fetch', fetchMock)
    await findGapCandidates({ occasion: 'work', category: 'shoes', tier, department: 'both', priceRange: [20, 700] }, serpapiShopping)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL((fetchMock.mock.calls[0] as unknown as [string])[0]).searchParams.get('q')).toBe(words)
  })
  it.each(['mid', 'premium'] as const)('saved results give %s items only from that tier\'s shops', async (tier) => {
    vi.stubEnv('GAP_SEARCH_FIXTURES', '1')
    const found = await findGapCandidates({ occasion: 'work', category: 'shoes', tier, department: 'both', priceRange: [0, 1000] })
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((c) => isShopInTier(c.shop, tier))).toBe(true)
  })
})

describe('the adapter is the only place that knows about SerpApi', () => {
  it('no file outside gap-search imports the adapter or its fixtures', () => {
    const root = path.resolve(__dirname, '../..')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(name)) files.push(full)
      }
    }
    walk(root)
    const offenders = files.filter((f) => !f.includes(`${path.sep}gap-search${path.sep}`) && /serpapi-shopping|google-shopping-au/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('the shop link fields of a Shopping result', () => {
  const base = { title: 'Tee', source: 'BIG W', extracted_price: 10 }
  it('keeps immersive_product_page_token, and the page_token from serpapi_immersive_product_api when there is no token', () => {
    const [a, b, c, d] = parseShoppingResults({ shopping_results: [
      { ...base, immersive_product_page_token: 'TOK1', serpapi_immersive_product_api: 'https://serpapi.com/search.json?engine=google_immersive_product&page_token=OTHER' },
      { ...base, serpapi_immersive_product_api: 'https://serpapi.com/search.json?engine=google_immersive_product&page_token=TOK2&api_key=leak' },
      { ...base, serpapi_immersive_product_api: 'not a url' },
      { ...base, link: 'https://www.bigw.com.au/p/1', product_link: 'https://www.google.com.au/shopping/product/1' },
    ] })
    expect(a.immersiveToken).toBe('TOK1')
    expect(b.immersiveToken).toBe('TOK2')
    expect(c.immersiveToken).toBeNull()
    expect(d.immersiveToken).toBeNull()
    expect(d.link).toBe('https://www.bigw.com.au/p/1')
  })
  it('the saved results carry the real shape (a token on every item), and a candidate keeps it', async () => {
    const [first] = await findGapCandidates(input({ category: 'tops' }))
    expect(first.immersiveToken).toMatch(/^FIXTURETOKEN/)
  })
})

describe('the same item listed under different links', () => {
  it('shows it once, in the list and in the diagnosis counts', () => {
    const a = { ...raw('Men Shirt', 'Kmart', 20), link: 'https://google.test/a' }
    const b = { ...raw('Men Shirt', 'Kmart', 20), link: 'https://google.test/b' }
    const c = { ...raw('Men Shirt', 'kmart', 20), link: null }
    const d = { ...raw('Men Shirt Two', 'Kmart', 20), link: 'https://google.test/a' }
    const q = { occasion: 'work', category: 'tops', department: 'mens', priceRange: [10, 50], tier: 'budget' } as const
    expect(filterProducts([a, b, c, raw('Men Shirt Three', 'Kmart', 20)], q, 'budget')).toHaveLength(2)
    expect(filterProducts([a, d], q, 'budget')).toHaveLength(1)
    expect(countFilterDrops([a, b, c], q, 'budget').duplicate).toBe(2)
  })
})

describe('diagnosis of an empty answer', () => {
  it('counts what each filter dropped, in filter order', () => {
    const q = { occasion: 'work', category: 'tops', department: 'mens', priceRange: [10, 50], tier: 'budget' } as const
    const products: RawProduct[] = [
      raw('Men Shirt', 'Kmart', 20), raw('Men Shirt B', 'Kmart', 20),
      raw('Men Shirt', 'Rodd & Gunn', 20),
      raw('Men Shirt', 'Kmart', 500),
      raw("Women's Shirt", 'Kmart', 20),
      raw('Men Hoodie', 'Kmart', 20),
    ]
    const dup = { ...products[0] }
    expect(countFilterDrops([...products, dup], q, 'budget')).toEqual({
      raw: 7, notTierShop: 1, outOfPrice: 1, wrongDepartmentOrOccasion: 2, duplicate: 1, passed: 2,
    })
  })
  it('onEmpty is called with the counts when every item is dropped, and not when there are items', async () => {
    const onEmpty = vi.fn()
    const items = await findGapSuggestions(
      { ...input({ category: 'tops' }), palette: { season: 'winter', best: ['#FFB347'], avoid: [] } },
      { source: sourceOf([raw('Men Shirt', 'Rodd & Gunn', 20), raw('Men Shirt', 'Kmart', 900)]), onEmpty },
    )
    expect(items).toEqual([])
    expect(onEmpty).toHaveBeenCalledWith({ raw: 2, notTierShop: 1, outOfPrice: 1, wrongDepartmentOrOccasion: 0, duplicate: 0, passed: 0, colourDropped: 0, titleColourDropped: 0 })
    onEmpty.mockClear()
    await findGapSuggestions({ ...input({ category: 'tops' }), palette: { season: 'winter', best: ['#FFB347'], avoid: [] } }, { onEmpty })
    expect(onEmpty).not.toHaveBeenCalled()
  })
  it('passed items that all fail the colour step are counted as colourDropped', async () => {
    const onEmpty = vi.fn()
    const items = await findGapSuggestions(
      { ...input({ category: 'tops' }), palette: { season: 'winter', best: ['#FFB347'], avoid: [] } },
      { source: sourceOf([raw('Men Shirt', 'Kmart', 20)]), onEmpty },
    )
    expect(items).toEqual([])
    expect(onEmpty).toHaveBeenCalledWith(expect.objectContaining({ raw: 1, passed: 1, colourDropped: 1 }))
  })
})

describe('a colour word in the title is the item\'s colour', () => {
  const OLIVE = '#808000'
  const CAMEL = '#C8A96E'
  const palette = (best: string[], avoid: string[] = []) => ({ season: 'spring' as const, best, avoid })
  const zasel = (title = 'Zasel Mens Cotton Canvas Shoes - KHAKI') => ({ ...raw(title, 'Kmart', 20), fixtureColour: CAMEL })

  it('wins over the photo reading, and the reason names the title colour family', async () => {
    const [s] = await findGapSuggestions(
      { ...input({ category: 'shoes' }), palette: palette([OLIVE, CAMEL]) },
      { source: sourceOf([zasel()]) },
    )
    expect(s.colour).toBe(OLIVE)
    expect(s.reason).toBe('Olive, one of your Spring colours.')
    expect(s.reason).not.toContain('camel')
  })
  it('an item whose title colour is not a best colour is dropped and counted, even if its photo reads as a best colour', async () => {
    const onEmpty = vi.fn()
    const out = await findGapSuggestions(
      { ...input({ category: 'shoes' }), palette: palette([CAMEL]) },
      { source: sourceOf([zasel()]), onEmpty },
    )
    expect(out).toEqual([])
    expect(onEmpty).toHaveBeenCalledWith(expect.objectContaining({ passed: 1, colourDropped: 1, titleColourDropped: 1 }))
  })
  it('an avoid colour in the title drops the item', async () => {
    const out = await findGapSuggestions(
      { ...input({ category: 'shoes' }), palette: palette([CAMEL], [OLIVE]) },
      { source: sourceOf([zasel()]) },
    )
    expect(out).toEqual([])
  })
  it('an item with no colour word still uses the photo reading', async () => {
    const [s] = await findGapSuggestions(
      { ...input({ category: 'shoes' }), palette: palette([OLIVE, CAMEL]) },
      { source: sourceOf([zasel('Zasel Mens Cotton Canvas Shoes')]) },
    )
    expect(s.colour).toBe(CAMEL)
  })
  it('a title with two colour words, or a word only inside another word, uses the photo reading', () => {
    expect(titleColour('Stripe Tee Navy / White')).toBeNull()
    expect(titleColour('Standard Tangled Tee')).toBeNull()
    expect(titleColour('Mens Chino - NAVY')).toBe('#000080')
    expect(titleColour('Sky Blue Shirt')).toBe('#87CEEB')
  })
})
