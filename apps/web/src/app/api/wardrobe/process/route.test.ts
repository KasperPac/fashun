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

const searchByImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/lens-search', () => ({ searchByImage }))

const signWardrobeImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/wardrobe-image', () => ({ signWardrobeImage }))

import { POST } from './route'

const tags = { isClothing: true, category: 'shoes', colours: ['#000000'], styleTags: ['casual'], occasionTags: ['casual', 'smart-casual'], suggestedName: 'Boots', searchQuery: 'Timberland 6-inch boots' }
const candidate = { url: 'https://shop.com/p/1', title: 'Timberland 6-inch boots', imageUrl: 'https://shop.com/i.jpg', retailer: 'Timberland' }
const VALID = { imageBase64: 'x'.repeat(120) }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockUpload.mockResolvedValue({ error: null })
  tagImage.mockResolvedValue(tags)
  searchByImage.mockResolvedValue([candidate])
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

  it('returns tags, a signed preview, and Lens candidates (searched by the photo)', async () => {
    const res = await post(VALID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(searchByImage).toHaveBeenCalledWith('https://signed/preview.jpg', 'Timberland 6-inch boots')
    expect(json.processedImageUrl).toBe('https://signed/preview.jpg')
    expect(json.category).toBe('shoes')
    expect(json.colours).toEqual(['#000000'])
    expect(json.occasionTags).toEqual(['casual', 'smart-casual'])
    expect(json.candidates).toHaveLength(1)
    expect(json.candidates[0].url).toBe('https://shop.com/p/1')
  })

  it('falls back to suggestedName as the Lens query when searchQuery is empty', async () => {
    tagImage.mockResolvedValueOnce({ ...tags, searchQuery: '' })
    await post(VALID)
    expect(searchByImage).toHaveBeenCalledWith('https://signed/preview.jpg', 'Boots')
  })

  it('still returns 200 with no candidates when searchByImage throws', async () => {
    searchByImage.mockRejectedValueOnce(new Error('boom'))
    const res = await post(VALID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.candidates).toEqual([])
  })

  it('uploadOnly stores and signs the photo without reading it or searching', async () => {
    const res = await post({ ...VALID, uploadOnly: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ processedImageUrl: 'https://signed/preview.jpg' })
    expect(mockUpload).toHaveBeenCalledTimes(1)
    expect(tagImage).not.toHaveBeenCalled()
    expect(searchByImage).not.toHaveBeenCalled()
  })

  it('signals a photo that is not clothing, without storing, signing or searching it', async () => {
    tagImage.mockResolvedValueOnce({ ...tags, isClothing: false })
    const res = await post(VALID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ notClothing: true })
    expect(mockUpload).not.toHaveBeenCalled()
    expect(searchByImage).not.toHaveBeenCalled()
  })

  it('does not signal not-clothing for a normal piece', async () => {
    expect((await (await post(VALID)).json()).notClothing).toBeUndefined()
  })

  it('uploadOnly returns 500 when the upload fails', async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: 'x' } })
    expect((await post({ ...VALID, uploadOnly: true })).status).toBe(500)
  })

  describe('stores files only under the signed-in user\'s folder', () => {
    const FORGED = { userId: 'someone-else', user_id: 'someone-else', path: 'someone-else/x.jpg', filename: 'someone-else/x.jpg' }

    it.each([
      ['normal', {}],
      ['uploadOnly', { uploadOnly: true }],
    ])('%s path starts with the signed-in user id', async (_name, extra) => {
      await post({ ...VALID, ...extra })
      expect(mockUpload).toHaveBeenCalledTimes(1)
      const stored = mockUpload.mock.calls[0][0] as string
      expect(stored).toMatch(/^u1\/[^/]+\.(jpg|png)$/)
      expect(signWardrobeImage).toHaveBeenCalledWith(expect.anything(), stored, 3600)
    })

    it.each([
      ['normal', {}],
      ['uploadOnly', { uploadOnly: true }],
    ])('%s ignores a forged userId or path in the body', async (_name, extra) => {
      await post({ ...VALID, ...extra, ...FORGED })
      const stored = mockUpload.mock.calls[0][0] as string
      expect(stored.startsWith('u1/')).toBe(true)
      expect(stored).not.toContain('someone-else')
    })
  })
})
