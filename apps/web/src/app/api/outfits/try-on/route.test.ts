import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })
const mockCreateSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/garment.jpg' }, error: null })

const mockItem = { image_url: 'https://cdn.example.com/chinos.jpg', category: 'bottoms' }
const mockProfile = { try_on_photo_url: 'https://cdn.example.com/me.jpg' }

let itemResult: unknown = { data: mockItem, error: null }
let profileResult: unknown = { data: mockProfile, error: null }

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'order']) chain[m] = () => makeChain(result)
  chain['single'] = () => Promise.resolve(result)
  chain['then'] = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r)
  chain['catch'] = (r: (v: unknown) => unknown) => Promise.resolve(result).catch(r)
  return chain
}

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'wardrobe_items') return makeChain(itemResult)
      return makeChain(profileResult)
    },
    storage: { from: () => ({ createSignedUrl: mockCreateSignedUrl }) },
  }),
}))

import { POST } from './route'

describe('POST /api/outfits/try-on', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/garment.jpg' }, error: null })
    itemResult = { data: mockItem, error: null }
    profileResult = { data: mockProfile, error: null }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(new Request('http://localhost/api/outfits/try-on', {
      method: 'POST', body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001' }),
    }))
    expect(res.status).toBe(401)
  })

  it('returns 400 with NO_ITEM_PHOTO when item has no image_url', async () => {
    itemResult = { data: { image_url: null, category: 'bottoms' }, error: null }
    const res = await POST(new Request('http://localhost/api/outfits/try-on', {
      method: 'POST', body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001' }),
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('NO_ITEM_PHOTO')
  })

  it('returns 400 with NO_PERSON_PHOTO when user has no try_on_photo_url', async () => {
    profileResult = { data: { try_on_photo_url: null }, error: null }
    const res = await POST(new Request('http://localhost/api/outfits/try-on', {
      method: 'POST', body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001' }),
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('NO_PERSON_PHOTO')
  })

  it('returns 400 with UNSUPPORTED_CATEGORY for shoes', async () => {
    itemResult = { data: { image_url: 'https://cdn.example.com/shoe.jpg', category: 'shoes' }, error: null }
    const res = await POST(new Request('http://localhost/api/outfits/try-on', {
      method: 'POST', body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001' }),
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('UNSUPPORTED_CATEGORY')
  })

  it('returns image_url on success', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'pred-123' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: ['https://fashn.ai/result.jpg'] }) } as Response)

    const promise = POST(new Request('http://localhost/api/outfits/try-on', {
      method: 'POST', body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001' }),
    }))

    // Advance timers to skip the 2s setTimeout in pollFashn
    await vi.runAllTimersAsync()

    const res = await promise
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.image_url).toBe('https://fashn.ai/result.jpg')

    // The garment image sent to Fashn is the signed URL, not the raw path
    const runCall = mockFetch.mock.calls.find(c => String(c[0]).endsWith('/run'))
    expect(runCall).toBeDefined()
    expect(JSON.parse(runCall![1].body).garment_image).toBe('https://signed/garment.jpg')
  })

  it('returns 500 when Fashn.ai render fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'pred-456' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'failed', error: 'model error' }) } as Response)

    const promise = POST(new Request('http://localhost/api/outfits/try-on', {
      method: 'POST', body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001' }),
    }))

    // Advance timers to skip the 2s setTimeout in pollFashn
    await vi.runAllTimersAsync()

    const res = await promise
    expect(res.status).toBe(500)
  })
})
