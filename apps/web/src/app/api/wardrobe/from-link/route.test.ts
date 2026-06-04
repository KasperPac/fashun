import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

const scrapeProductPage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/product-scraper', () => ({ scrapeProductPage }))

const extractProduct = vi.hoisted(() => vi.fn())
vi.mock('@/lib/product-extractor', () => ({ extractProduct }))

const uploadImageFromUrl = vi.hoisted(() => vi.fn())
vi.mock('@/lib/store-image', () => ({ uploadImageFromUrl }))

const matchVariantToPhoto = vi.hoisted(() => vi.fn())
vi.mock('@/lib/variant-matcher', () => ({ matchVariantToPhoto }))

const searchProduct = vi.hoisted(() => vi.fn())
vi.mock('@/lib/product-search', () => ({ searchProduct }))

import { POST } from './route'

const extracted = {
  name: 'Rust Linen Shirt', category: 'tops', retailer: 'THE ICONIC',
  imageUrl: 'https://cdn.shop.com/shirt.jpg', price: 89.95, styleTags: ['smart-casual'],
  colourVariants: [{ label: 'Rust', hex: '#B7410E' }, { label: 'Olive', hex: '#556B2F' }],
  colours: ['#B7410E'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  scrapeProductPage.mockResolvedValue({ url: 'https://shop.com/p/1', imageUrl: extracted.imageUrl })
  extractProduct.mockResolvedValue(extracted)
  uploadImageFromUrl.mockResolvedValue('https://supa.co/wardrobe/u1/x.jpg')
  matchVariantToPhoto.mockResolvedValue(null)
  searchProduct.mockResolvedValue([])
})

function post(body: unknown) {
  return POST(new Request('http://localhost/api/wardrobe/from-link', {
    method: 'POST', body: JSON.stringify(body),
  }))
}

describe('POST /api/wardrobe/from-link (URL mode)', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await post({ url: 'https://shop.com/p/1' })).status).toBe(401)
  })

  it('returns 400 when neither url nor description provided', async () => {
    expect((await post({})).status).toBe(400)
  })

  it('returns a confirm payload for a valid url', async () => {
    const res = await post({ url: 'https://shop.com/p/1' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mode).toBe('confirm')
    expect(json.product.suggestedName).toBe('Rust Linen Shirt')
    expect(json.product.processedImageUrl).toBe('https://supa.co/wardrobe/u1/x.jpg')
    expect(json.product.storeUrl).toBe('https://shop.com/p/1')
    expect(json.product.colourVariants).toHaveLength(2)
    expect(json.product.colours).toEqual(['#B7410E']) // first variant default, no photo
  })

  it('returns mode manual when scraping throws', async () => {
    scrapeProductPage.mockRejectedValueOnce(new Error('403'))
    const res = await post({ url: 'https://shop.com/blocked' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mode).toBe('manual')
    expect(json.storeUrl).toBe('https://shop.com/blocked')
  })

  it('returns 400 for a loopback/private url (SSRF guard)', async () => {
    expect((await post({ url: 'http://localhost/admin' })).status).toBe(400)
    expect((await post({ url: 'http://169.254.169.254/latest/meta-data' })).status).toBe(400)
    expect((await post({ url: 'http://10.0.0.5/internal' })).status).toBe(400)
  })

  it('uses the photo-matched variant colour when a photo is attached', async () => {
    matchVariantToPhoto.mockResolvedValueOnce({ label: 'Olive', hex: '#556B2F' })
    const res = await post({ url: 'https://shop.com/p/1', itemPhotoBase64: 'BASE64DATA' })
    const json = await res.json()
    expect(matchVariantToPhoto).toHaveBeenCalled()
    expect(json.product.colours).toEqual(['#556B2F'])
  })

  it('returns candidates in search mode', async () => {
    searchProduct.mockResolvedValueOnce([
      { url: 'https://theiconic.com.au/p/1', title: 'Black Nike Pegasus', imageUrl: null, retailer: 'THE ICONIC' },
    ])
    const res = await post({ description: 'black Nike running shoes', store: 'THE ICONIC' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mode).toBe('candidates')
    expect(json.candidates).toHaveLength(1)
  })

  it('returns 404 when search finds nothing', async () => {
    searchProduct.mockResolvedValueOnce([])
    const res = await post({ description: 'nonexistent thing', store: 'Nowhere' })
    expect(res.status).toBe(404)
  })
})
