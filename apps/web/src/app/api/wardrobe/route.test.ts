import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockItems = [
  { id: '1', user_id: 'user-1', category: 'tops', ownership: 'owned', name: 'White Tee', colours: ['#ffffff'], style_tags: ['casual'], occasion_tags: ['casual'], image_url: 'https://example.com/1.png', created_at: '2026-01-01' },
  { id: '2', user_id: 'user-1', category: 'shoes', ownership: 'wishlist', name: 'Sneakers', colours: ['#000000'], style_tags: ['casual'], occasion_tags: ['casual'], image_url: 'https://example.com/2.png', created_at: '2026-01-02' },
]

// Chainable thenable mock — every method returns itself, await resolves to result
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'order', 'delete', 'update', 'upsert']
  for (const m of methods) {
    chain[m] = () => makeChain(result)
  }
  chain['single'] = () => Promise.resolve(result)
  chain['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  chain['catch'] = (reject: (v: unknown) => unknown) => Promise.resolve(result).catch(reject)
  chain['insert'] = () => ({
    select: () => ({ single: () => Promise.resolve(result) }),
  })
  return chain
}

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })
let queryResult = { data: mockItems, error: null }

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: () => makeChain(queryResult),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test.png' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/test.png' } }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example.com/x.png' }, error: null }),
      }),
    },
  }),
}))

import { GET, DELETE, POST } from './route'

describe('GET /api/wardrobe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryResult = { data: mockItems, error: null }
  })

  it('returns camelCase items with signed image URLs', async () => {
    const req = new Request('http://localhost/api/wardrobe?ownership=owned')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items).toHaveLength(2)
    expect(json.items[0].imageUrl).toBe('https://signed.example.com/x.png')
    expect(json.items[0].styleTags).toEqual(['casual'])
    expect(json.items[0]).not.toHaveProperty('image_url')
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const req = new Request('http://localhost/api/wardrobe')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/wardrobe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryResult = { data: null, error: null }
  })

  it('returns 400 when id missing', async () => {
    const req = new Request('http://localhost/api/wardrobe', {
      method: 'DELETE',
      body: JSON.stringify({}),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })
})
