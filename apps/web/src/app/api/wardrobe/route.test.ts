import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockItems = [
  { id: '1', user_id: 'user-1', category: 'tops', ownership: 'owned', name: 'White Tee', colours: ['#ffffff'], style_tags: ['casual'], occasion_tags: ['casual'], image_url: 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/user-1/1.png', created_at: '2026-01-01' },
  { id: '2', user_id: 'user-1', category: 'shoes', ownership: 'wishlist', name: 'Sneakers', colours: ['#000000'], style_tags: ['casual'], occasion_tags: ['casual'], image_url: 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/user-1/2.png', created_at: '2026-01-02' },
]

const calls: unknown[][] = []

// Chainable thenable mock — every method returns itself, await resolves to result
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'order', 'delete', 'update', 'upsert', 'contains']
  for (const m of methods) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return makeChain(result)
    }
  }
  chain['single'] = () => Promise.resolve(result)
  chain['maybeSingle'] = () => Promise.resolve(result)
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

import { GET, DELETE, PATCH, POST } from './route'

const ITEM_ID = '11111111-1111-4111-8111-111111111111'

describe('GET /api/wardrobe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    calls.length = 0
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

  it('returns external image URLs unchanged (not signed)', async () => {
    queryResult = { data: [{ ...mockItems[0], image_url: 'https://images.unsplash.com/p?w=400' }], error: null }
    const req = new Request('http://localhost/api/wardrobe?ownership=owned')
    const res = await GET(req)
    const json = await res.json()
    expect(json.items[0].imageUrl).toBe('https://images.unsplash.com/p?w=400')
  })
})

describe('GET /api/wardrobe filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    calls.length = 0
    queryResult = { data: mockItems, error: null }
  })

  it('filters by category and occasion, scoped to the current user', async () => {
    const res = await GET(new Request('http://localhost/api/wardrobe?category=tops&occasion=smart-casual'))
    expect(res.status).toBe(200)
    expect(calls).toContainEqual(['eq', 'user_id', 'user-1'])
    expect(calls).toContainEqual(['eq', 'category', 'tops'])
    expect(calls).toContainEqual(['contains', 'occasion_tags', ['smart-casual']])
  })

  it('does not filter for category=all or occasion=all or when absent', async () => {
    await GET(new Request('http://localhost/api/wardrobe?category=all&occasion=all'))
    await GET(new Request('http://localhost/api/wardrobe'))
    expect(calls.some(([m, col]) => m === 'contains' || col === 'category')).toBe(false)
  })

  it('returns 400 for an unknown occasion (including the old dinner/event) or category', async () => {
    for (const q of ['occasion=dinner', 'occasion=event', 'occasion=', 'category=hats']) {
      const res = await GET(new Request(`http://localhost/api/wardrobe?${q}`))
      // an empty value is treated as "no filter"
      expect(res.status).toBe(q === 'occasion=' ? 200 : 400)
    }
  })
})

describe('PATCH /api/wardrobe', () => {
  const patch = (body: unknown) =>
    PATCH(new Request('http://localhost/api/wardrobe', { method: 'PATCH', body: JSON.stringify(body) }))

  beforeEach(() => {
    vi.clearAllMocks()
    calls.length = 0
    queryResult = { data: { ...mockItems[0], id: ITEM_ID }, error: null }
  })

  it('updates the corrected values for the owner', async () => {
    const res = await patch({
      id: ITEM_ID, name: 'Navy Tee', category: 'outerwear', colours: ['#000080'],
      styleTags: ['casual'], occasionTags: ['work', 'work', 'formal'],
    })
    expect(res.status).toBe(200)
    expect(calls).toContainEqual(['update', {
      name: 'Navy Tee', category: 'outerwear', colours: ['#000080'],
      style_tags: ['casual'], occasion_tags: ['work', 'formal'],
    }])
    expect(calls).toContainEqual(['eq', 'id', ITEM_ID])
    expect(calls).toContainEqual(['eq', 'user_id', 'user-1'])
  })

  it('only updates the fields that were sent', async () => {
    await patch({ id: ITEM_ID, occasionTags: [] })
    expect(calls).toContainEqual(['update', { occasion_tags: [] }])
  })

  it('returns 404 when the item is not the caller’s (second user) or does not exist', async () => {
    queryResult = { data: null, error: null }
    const res = await patch({ id: ITEM_ID, name: 'Mine now' })
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await patch({ id: ITEM_ID, name: 'x' })).status).toBe(401)
  })

  it('returns 400 for bad input', async () => {
    for (const body of [
      {},
      { id: 'nope', name: 'x' },
      { id: ITEM_ID },
      { id: ITEM_ID, name: '   ' },
      { id: ITEM_ID, category: 'hats' },
      { id: ITEM_ID, occasionTags: ['dinner'] },
      { id: ITEM_ID, occasionTags: ['event'] },
    ]) {
      expect((await patch(body)).status).toBe(400)
    }
    expect(calls.some(([m]) => m === 'update')).toBe(false)
  })

  it('returns 500 when the database fails', async () => {
    queryResult = { data: null, error: { message: 'boom' } }
    expect((await patch({ id: ITEM_ID, name: 'x' })).status).toBe(500)
  })
})

describe('POST /api/wardrobe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryResult = { data: { id: ITEM_ID }, error: null }
  })

  const post = (body: unknown) =>
    POST(new Request('http://localhost/api/wardrobe', { method: 'POST', body: JSON.stringify(body) }))

  it('accepts corrected values with the four occasions', async () => {
    const res = await post({ name: 'Tee', category: 'tops', imageUrl: 'https://x.test/a.png', occasionTags: ['smart-casual', 'formal'] })
    expect(res.status).toBe(201)
  })

  it('rejects the old dinner/event occasions', async () => {
    expect((await post({ name: 'Tee', category: 'tops', imageUrl: 'https://x.test/a.png', occasionTags: ['dinner'] })).status).toBe(400)
    expect((await post({ name: 'Tee', category: 'tops', imageUrl: 'https://x.test/a.png', occasionTags: ['event'] })).status).toBe(400)
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

  const del = () =>
    DELETE(new Request('http://localhost/api/wardrobe', { method: 'DELETE', body: JSON.stringify({ id: ITEM_ID }) }))

  it('deletes the owner’s item, scoped to the current user', async () => {
    calls.length = 0
    queryResult = { data: [{ id: ITEM_ID }], error: null }
    expect((await del()).status).toBe(200)
    expect(calls).toContainEqual(['eq', 'user_id', 'user-1'])
  })

  it('returns 404 when nothing was deleted (not the caller’s item, second user)', async () => {
    queryResult = { data: [], error: null }
    expect((await del()).status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await del()).status).toBe(401)
  })
})
