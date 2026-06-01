import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })

const mockOutfit = {
  id: 'outfit-1', user_id: 'user-1', item_id: 'item-1',
  name: 'Smart Casual', occasion: 'Weekend brunch',
  pieces: [{ label: 'Rust shirt', colour_hex: '#B7410E', item_id: null, in_wardrobe: false }],
  description: 'A relaxed look.', try_on_image_url: null, created_at: '2026-06-01',
  wardrobe_items: { name: 'Slim Fit Chinos' },
}

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'neq']) chain[m] = () => makeChain(result)
  chain['single'] = () => Promise.resolve(result)
  chain['insert'] = () => ({ select: () => ({ single: () => Promise.resolve(result) }) })
  chain['then'] = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r)
  chain['catch'] = (r: (v: unknown) => unknown) => Promise.resolve(result).catch(r)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: () => makeChain({ data: [mockOutfit], error: null }),
  }),
}))

import { GET, POST } from './route'

describe('GET /api/outfits', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await GET(new Request('http://localhost/api/outfits'))
    expect(res.status).toBe(401)
  })

  it('returns outfits array with item_name', async () => {
    const res = await GET(new Request('http://localhost/api/outfits'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.outfits)).toBe(true)
    expect(json.outfits[0].item_name).toBe('Slim Fit Chinos')
  })
})

describe('POST /api/outfits', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(new Request('http://localhost/api/outfits', {
      method: 'POST', body: JSON.stringify({}),
    }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing fields', async () => {
    const res = await POST(new Request('http://localhost/api/outfits', {
      method: 'POST', body: JSON.stringify({ name: 'test' }),
    }))
    expect(res.status).toBe(400)
  })

  it('saves outfit and returns 201', async () => {
    const body = {
      item_id: '00000000-0000-0000-0000-000000000001',
      name: 'Smart Casual',
      occasion: 'Weekend brunch',
      pieces: [{ label: 'Rust shirt', colour_hex: '#B7410E', item_id: null, in_wardrobe: false }],
      description: 'A relaxed look.',
    }
    const res = await POST(new Request('http://localhost/api/outfits', {
      method: 'POST', body: JSON.stringify(body),
    }))
    expect(res.status).toBe(201)
  })
})
