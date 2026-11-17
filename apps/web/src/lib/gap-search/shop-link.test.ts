import { describe, it, expect, vi, afterEach } from 'vitest'
import { linkBelongsToShop, searchShopLink } from './shop-link'

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

describe('searchShopLink', () => {
  const answer = (organic: unknown) => vi.fn(async () => new Response(JSON.stringify({ organic_results: organic })))
  it('makes one search and returns the first result on the shop\'s own site', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    const f = answer([{ link: 'https://www.google.com/x' }, { link: 'https://other.com/x' }, { link: 'https://www.kmart.com.au/product/1' }])
    vi.stubGlobal('fetch', f)
    expect(await searchShopLink({ title: 'Loafers', shop: 'Kmart' })).toBe('https://www.kmart.com.au/product/1')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('returns null when no result is on the shop\'s site', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    vi.stubGlobal('fetch', answer([{ link: 'https://www.google.com/x' }]))
    expect(await searchShopLink({ title: 'Loafers', shop: 'Kmart' })).toBeNull()
  })
})
