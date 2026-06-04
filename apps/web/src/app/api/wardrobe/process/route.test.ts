import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }))
const mockUpload = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    storage: { from: () => ({ upload: mockUpload }) },
  }),
}))

const tagImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/tagger', () => ({ tagImage }))

const searchProduct = vi.hoisted(() => vi.fn())
vi.mock('@/lib/product-search', () => ({ searchProduct }))

const signWardrobeImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/wardrobe-image', () => ({ signWardrobeImage }))

import { POST } from './route'

const tags = { category: 'shoes', colours: ['#000000'], styleTags: ['casual'], suggestedName: 'Boots', searchQuery: 'Timberland 6-inch boots' }
const candidate = { url: 'https://shop.com/p/1', title: 'Timberland 6-inch boots', imageUrl: 'https://shop.com/i.jpg', retailer: 'Timberland' }
const VALID = { imageBase64: 'x'.repeat(120) }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockUpload.mockResolvedValue({ error: null })
  tagImage.mockResolvedValue(tags)
  searchProduct.mockResolvedValue([candidate])
  signWardrobeImage.mockResolvedValue('https://signed/preview.jpg')
})

function post(body: unknown) {
  return POST(new Request('http://localhost/api/wardrobe/process', { method: 'POST', body: JSON.stringify(body) }))
}

describe('POST /api/wardrobe/process', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await post(VALID)).status).toBe(401)
  })

  it('returns 400 for an invalid image', async () => {
    expect((await post({ imageBase64: 'short' })).status).toBe(400)
  })

  it('returns tags, a signed preview, searchQuery and candidates', async () => {
    const res = await post(VALID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(searchProduct).toHaveBeenCalledWith('Timberland 6-inch boots', '')
    expect(json.processedImageUrl).toBe('https://signed/preview.jpg')
    expect(json.category).toBe('shoes')
    expect(json.searchQuery).toBe('Timberland 6-inch boots')
    expect(json.candidates).toHaveLength(1)
    expect(json.candidates[0].url).toBe('https://shop.com/p/1')
  })

  it('does not search and returns no candidates when searchQuery is empty', async () => {
    tagImage.mockResolvedValueOnce({ ...tags, searchQuery: '' })
    const res = await post(VALID)
    const json = await res.json()
    expect(searchProduct).not.toHaveBeenCalled()
    expect(json.candidates).toEqual([])
  })

  it('still returns 200 with no candidates when searchProduct throws', async () => {
    searchProduct.mockRejectedValueOnce(new Error('boom'))
    const res = await post(VALID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.candidates).toEqual([])
  })
})
