import { describe, it, expect, vi, afterEach } from 'vitest'
import { linkBelongsToShop, resolveShopLink, shopHasHost } from './shop-link'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('linkBelongsToShop', () => {
  it('accepts the shop\'s own site, with or without www or a subdomain', () => {
    expect(linkBelongsToShop('https://www.kmart.com.au/product/1', 'Kmart')).toBe(true)
    expect(linkBelongsToShop('https://kmart.com.au/p', 'Kmart')).toBe(true)
    expect(linkBelongsToShop('https://shop.bigw.com.au/p', 'Big W')).toBe(true)
    expect(linkBelongsToShop('https://www.theiconic.com.au/p', 'THE ICONIC')).toBe(true)
    expect(linkBelongsToShop('https://rmwilliams.com.au/p', 'R.M. Williams')).toBe(true)
    expect(linkBelongsToShop('https://www2.hm.com/en_au/p', 'H&M')).toBe(true)
    expect(linkBelongsToShop('https://target.com.au/p', 'Target Australia')).toBe(true)
  })
  it('refuses Google, other shops, look-alikes, plain http and junk', () => {
    expect(linkBelongsToShop('https://www.google.com.au/shopping/product/1', 'Kmart')).toBe(false)
    expect(linkBelongsToShop('https://www.google.com/search?q=kmart', 'Kmart')).toBe(false)
    expect(linkBelongsToShop('https://bigw.com.au/p', 'Kmart')).toBe(false)
    expect(linkBelongsToShop('https://kmart.example.com/p', 'Kmart')).toBe(false)
    expect(linkBelongsToShop('https://evil.com/kmart.com.au', 'Kmart')).toBe(false)
    expect(linkBelongsToShop('http://kmart.com.au/p', 'Kmart')).toBe(false)
    expect(linkBelongsToShop('not a link', 'Kmart')).toBe(false)
    expect(linkBelongsToShop(null, 'Kmart')).toBe(false)
    expect(linkBelongsToShop('https://kmart.com.au/p', '')).toBe(false)
  })
})

describe('linkBelongsToShop look-alikes', () => {
  it.each([
    ['https://www.target.com/p', 'Target'],
    ['https://kmart.com/p', 'Kmart'],
    ['https://kmart.xyz/p', 'Kmart'],
    ['https://kmart.shop/p', 'Kmart'],
    ['https://kmart.co.uk/p', 'Kmart'],
    ['https://myer.net/p', 'Myer'],
    ['https://uniqlo.co/p', 'Uniqlo'],
    ['https://notkmart.com.au/p', 'Kmart'],
    ['https://kmart.com.au.evil.com/p', 'Kmart'],
    ['https://user:pw@kmart.com.au/p', 'Kmart'],
  ])('refuses %s for %s', (link, shop) => {
    expect(linkBelongsToShop(link, shop)).toBe(false)
  })
  it.each([
    ['Kmart', 'kmart.com.au'], ['Target', 'target.com.au'], ['Big W', 'bigw.com.au'], ['Uniqlo', 'uniqlo.com'],
    ['Cotton On', 'cottonon.com'], ['H&M', 'hm.com'], ['Country Road', 'countryroad.com.au'], ['Myer', 'myer.com.au'],
    ['David Jones', 'davidjones.com'], ['THE ICONIC', 'theiconic.com.au'], ['Rodd & Gunn', 'roddandgunn.com'],
    ['R.M. Williams', 'rmwilliams.com.au'], ['M.J. Bale', 'mjbale.com'],
  ])('accepts %s on %s and its subdomains', (shop, host) => {
    expect(linkBelongsToShop(`https://${host}/p`, shop)).toBe(true)
    expect(linkBelongsToShop(`https://www.${host}/p`, shop)).toBe(true)
  })
})

const call = (f: ReturnType<typeof vi.fn>, n = 0) => new URL((f.mock.calls[n] as unknown as [string])[0])
const json = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))
const stores = (...links: string[]) => ({ product_results: { stores: links.map((link) => ({ name: 's', link })) } })

describe('resolveShopLink with a Google page token', () => {
  it('makes one google_immersive_product call and picks the first store on the shop\'s own site', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    const f = json(stores('https://www.google.com/x', 'https://www.bigw.com.au/product/1', 'https://www.bigw.com.au/product/2'))
    vi.stubGlobal('fetch', f)
    const r = await resolveShopLink({ title: 'Tee', shop: 'BIG W', token: 'TOK' })
    expect(r).toMatchObject({ link: 'https://www.bigw.com.au/product/1', reason: null, path: 'token', candidates: 3 })
    expect(f).toHaveBeenCalledTimes(1)
    const u = call(f)
    expect(u.searchParams.get('engine')).toBe('google_immersive_product')
    expect(u.searchParams.get('page_token')).toBe('TOK')
  })
  it('refuses a look-alike store and reports no_store_on_shop_host with hosts only', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    vi.stubGlobal('fetch', json(stores('https://bigw.com/secret/path?x=1', 'https://bigw.com.au.evil.com/p', 'http://bigw.com.au/p')))
    const r = await resolveShopLink({ title: 'Tee', shop: 'BIG W', token: 'TOK' })
    expect(r.link).toBeNull()
    expect(r.reason).toBe('no_store_on_shop_host')
    expect(r.candidates).toBe(3)
    expect(r.hosts).toEqual(['bigw.com', 'bigw.com.au.evil.com', 'bigw.com.au'])
    expect(JSON.stringify(r)).not.toMatch(/secret|test-key/)
  })
  it('reports at most 5 distinct hosts', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    vi.stubGlobal('fetch', json(stores(...Array.from({ length: 8 }, (_, i) => `https://shop${i}.example/p`), 'https://shop0.example/q')))
    const r = await resolveShopLink({ title: 'Tee', shop: 'Kmart', token: 'TOK' })
    expect(r.hosts).toHaveLength(5)
    expect(r.candidates).toBe(9)
  })
  it('reports no_results when the answer lists no stores', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    vi.stubGlobal('fetch', json({ product_results: {} }))
    expect(await resolveShopLink({ title: 'Tee', shop: 'Kmart', token: 'TOK' })).toMatchObject({ link: null, reason: 'no_results', candidates: 0, hosts: [] })
  })
  it('reports http_<status>, timeout and unreadable', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    vi.stubGlobal('fetch', json({ error: 'x' }, 429))
    expect((await resolveShopLink({ title: 'Tee', shop: 'Kmart', token: 'T' })).reason).toBe('http_429')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('t', 'TimeoutError') }))
    expect((await resolveShopLink({ title: 'Tee', shop: 'Kmart', token: 'T' })).reason).toBe('timeout')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })))
    expect((await resolveShopLink({ title: 'Tee', shop: 'Kmart', token: 'T' })).reason).toBe('unreadable')
  })
})

describe('resolveShopLink without a token', () => {
  it('makes one search limited to the shop\'s own site and returns the first result on it', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    const f = json({ organic_results: [{ link: 'https://www.google.com/x' }, { link: 'https://www.kmart.com.au/product/1' }] })
    vi.stubGlobal('fetch', f)
    const r = await resolveShopLink({ title: "Women's Loafers", shop: 'Kmart' })
    expect(r).toMatchObject({ link: 'https://www.kmart.com.au/product/1', path: 'site' })
    expect(f).toHaveBeenCalledTimes(1)
    expect(call(f).searchParams.get('q')).toBe("Women's Loafers site:kmart.com.au")
    expect(call(f).searchParams.get('engine')).toBe('google')
  })
  it('reports no_token when the site search finds nothing on the shop\'s site', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    vi.stubGlobal('fetch', json({ organic_results: [{ link: 'https://www.google.com/x' }] }))
    expect(await resolveShopLink({ title: 'Tee', shop: 'Kmart' })).toMatchObject({ link: null, reason: 'no_token', path: 'site', hosts: ['www.google.com'] })
  })
  it('makes no call for a shop that is not an example shop', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    const f = json({ organic_results: [{ link: 'https://evil.com/x' }] })
    vi.stubGlobal('fetch', f)
    expect((await resolveShopLink({ title: 'Tee', shop: 'Unknown Shop', token: 'T' })).reason).toBe('no_store_on_shop_host')
    expect(f).not.toHaveBeenCalled()
    expect(shopHasHost('Unknown Shop')).toBe(false)
    expect(shopHasHost('Kmart')).toBe(true)
  })
})
