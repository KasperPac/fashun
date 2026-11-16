import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

// Real scraper + real extractor + real route, run against saved HTML fixtures.
// Only the network (fetch), Claude and Supabase are faked: no live fetches.

const mockGetUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed/preview.jpg' }, error: null }) }) },
  }),
}))

const uploadImageFromUrl = vi.hoisted(() => vi.fn())
vi.mock('@/lib/store-image', () => ({ uploadImageFromUrl }))
vi.mock('@/lib/variant-matcher', () => ({ matchVariantToPhoto: vi.fn() }))
vi.mock('@/lib/product-search', () => ({ searchProduct: vi.fn().mockResolvedValue([]) }))

const extractProductViaClaude = vi.hoisted(() => vi.fn())
vi.mock('@/lib/product-fetch-claude', () => ({ extractProductViaClaude }))

const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } },
}))

import { POST } from './route'

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, '../../../../lib/__fixtures__/shops', name), 'utf8')

const SHOPS = [
  {
    shop: 'Kmart', file: 'kmart-linen-blend-shirt.html', url: 'https://www.kmart.com.au/product/linen-blend-shirt-43000000/',
    image: 'https://assets.kmart.com.au/fixtures/linen-blend-shirt-sage.jpg', name: 'Sage Linen Blend Shirt', hex: '#9CAF88',
  },
  {
    shop: 'Country Road', file: 'country-road-oxford-shirt.html', url: 'https://www.countryroad.com.au/organically-grown-cotton-oxford-shirt-60000000',
    image: 'https://www.countryroad.com.au/fixtures/oxford-shirt-navy.jpg', name: 'Navy Oxford Shirt', hex: '#1F2A44',
  },
  {
    shop: 'Rodd & Gunn', file: 'rodd-and-gunn-sheffield-shirt.html', url: 'https://www.roddandgunn.com/au/sheffield-linen-shirt',
    image: 'https://www.roddandgunn.com/fixtures/sheffield-linen-shirt-stone.jpg', name: 'Stone Linen Shirt', hex: '#C8B99A',
  },
]

function post(url: string) {
  return POST(new Request('http://localhost/api/wardrobe/from-link', { method: 'POST', body: JSON.stringify({ url }) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  uploadImageFromUrl.mockResolvedValue('u1/x.jpg')
  extractProductViaClaude.mockResolvedValue(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('POST /api/wardrobe/from-link against saved shop pages', () => {
  for (const s of SHOPS) {
    it(`fills name, image and colour from a ${s.shop} product page`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => fixture(s.file) }))
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          name: s.name, category: 'tops', styleTags: ['smart-casual'], occasionTags: ['casual'],
          colourVariants: [{ label: 'Main', hex: s.hex }], colours: [s.hex],
        }) }],
      })

      const body = await (await post(s.url)).json()

      expect(body.mode).toBe('confirm')
      expect(body.product.suggestedName).toBe(s.name)
      expect(body.product.colours).toEqual([s.hex])
      expect(body.product.processedImageUrl).toBe('https://signed/preview.jpg')
      expect(uploadImageFromUrl).toHaveBeenCalledWith(expect.anything(), s.image, 'u1')
      expect(body.product.retailer).toBe(s.shop)
    })
  }

  it('returns the manual-add fallback, not an error, for an unreadable page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => fixture('unreadable-page.html') }))
    const res = await post('https://www.kmart.com.au/product/unreadable/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mode: 'manual', storeUrl: 'https://www.kmart.com.au/product/unreadable/', reason: 'Could not read that page' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns the manual-add fallback when the shop blocks the fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => '' }))
    const res = await post('https://www.countryroad.com.au/blocked')
    expect(res.status).toBe(200)
    expect((await res.json()).mode).toBe('manual')
  })
})
