import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

const uploadImageFromUrl = vi.hoisted(() => vi.fn())
vi.mock('@/lib/store-image', () => ({ uploadImageFromUrl }))

const signWardrobeImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/wardrobe-image', () => ({ signWardrobeImage }))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://localhost/api/wardrobe/ingest-image', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  uploadImageFromUrl.mockResolvedValue('u1/abc.jpg')
  signWardrobeImage.mockResolvedValue('https://signed/abc.jpg')
})

describe('POST /api/wardrobe/ingest-image', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await post({ imageUrl: 'https://cdn/x.jpg' })).status).toBe(401)
  })

  it('returns 400 for a missing/invalid imageUrl', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ imageUrl: 'not a url' })).status).toBe(400)
  })

  it('returns 400 for a private/loopback URL (SSRF)', async () => {
    expect((await post({ imageUrl: 'http://169.254.169.254/x' })).status).toBe(400)
    expect((await post({ imageUrl: 'http://localhost/x' })).status).toBe(400)
    expect(uploadImageFromUrl).not.toHaveBeenCalled()
  })

  it('ingests the image and returns the signed path', async () => {
    const res = await post({ imageUrl: 'https://serpapi-cdn/af1.jpg' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(uploadImageFromUrl).toHaveBeenCalledWith(expect.anything(), 'https://serpapi-cdn/af1.jpg', 'u1')
    expect(json.path).toBe('u1/abc.jpg')
    expect(json.imageUrl).toBe('https://signed/abc.jpg')
  })

  it('returns 502 when ingest fails', async () => {
    uploadImageFromUrl.mockRejectedValueOnce(new Error('fetch 403'))
    expect((await post({ imageUrl: 'https://serpapi-cdn/af1.jpg' })).status).toBe(502)
  })
})
