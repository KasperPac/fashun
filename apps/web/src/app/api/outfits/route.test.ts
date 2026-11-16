import { describe, it, expect, vi, beforeEach } from 'vitest'

const OWN_ITEM_IDS = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']
const FOREIGN_ID = '00000000-0000-0000-0000-0000000000ff'
const mockInsert = vi.fn()
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
  for (const m of ['select', 'eq', 'order', 'neq', 'in']) chain[m] = () => makeChain(result)
  chain['single'] = () => Promise.resolve(result)
  chain['insert'] = (row: unknown) => {
    mockInsert(row)
    return { select: () => ({ single: () => Promise.resolve(result) }) }
  }
  chain['then'] = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r)
  chain['catch'] = (r: (v: unknown) => unknown) => Promise.resolve(result).catch(r)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => makeChain(
      table === 'wardrobe_items'
        ? { data: OWN_ITEM_IDS.map(id => ({ id })), error: null }
        : { data: [mockOutfit], error: null },
    ),
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
    expect(mockInsert.mock.calls[0][0].occasion).toBe('casual')
  })

  it.each([
    ['Work meeting', 'work'],
    ['Dinner', 'smart-casual'],
    ['formal', 'formal'],
    ['Skiing', null],
    [undefined, null],
  ])('stores occasion %j as one of the four (%j)', async (occasion, expected) => {
    const res = await POST(new Request('http://localhost/api/outfits', {
      method: 'POST',
      body: JSON.stringify({
        item_id: '00000000-0000-0000-0000-000000000001', name: 'x', occasion,
        pieces: [{ label: 'a', colour_hex: '#000000', item_id: null, in_wardrobe: false }],
      }),
    }))
    expect(res.status).toBe(201)
    expect(mockInsert.mock.calls[0][0].occasion).toBe(expected)
  })

  const save = (body: unknown) => POST(new Request('http://localhost/api/outfits', { method: 'POST', body: JSON.stringify(body) }))
  const piece = (item_id: string | null, in_wardrobe = true) => ({ label: 'a', colour_hex: '#000000', item_id, in_wardrobe })

  it('saves an occasion-mode outfit with no anchor item, for the signed-in user only', async () => {
    const res = await save({
      name: 'Dinner look', occasion: 'smart-casual', description: 'Suits your Autumn palette.',
      pieces: OWN_ITEM_IDS.map(id => piece(id)),
    })
    expect(res.status).toBe(201)
    const row = mockInsert.mock.calls[0][0]
    expect(row.user_id).toBe('user-1')
    expect(row.item_id).toBeNull()
    expect(row.item_ids).toEqual(OWN_ITEM_IDS)
    expect(row.occasion).toBe('smart-casual')
  })

  it('rejects an anchor item that is not the user\'s own', async () => {
    const res = await save({ item_id: FOREIGN_ID, name: 'x', pieces: [piece(null, false)] })
    expect(res.status).toBe(404)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('never stores another user\'s item id in the pieces', async () => {
    const res = await save({ name: 'x', pieces: [piece(OWN_ITEM_IDS[0]), piece(FOREIGN_ID), piece('invented')] })
    expect(res.status).toBe(201)
    const row = mockInsert.mock.calls[0][0]
    expect(row.item_ids).toEqual([OWN_ITEM_IDS[0]])
    expect(row.pieces[1]).toMatchObject({ item_id: null, in_wardrobe: false })
    expect(row.pieces[2]).toMatchObject({ item_id: null, in_wardrobe: false })
  })
})

describe('GET /api/outfits (scoping)', () => {
  it('only asks for the signed-in user\'s outfits', async () => {
    const eq = vi.fn()
    const spy = makeChain({ data: [mockOutfit], error: null })
    spy['select'] = () => ({ eq: (...a: unknown[]) => { eq(...a); return { order: () => Promise.resolve({ data: [mockOutfit], error: null }) } } })
    vi.doMock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ auth: { getUser: mockGetUser }, from: () => spy }) }))
    vi.resetModules()
    const { GET: freshGet } = await import('./route')
    const res = await freshGet(new Request('http://localhost/api/outfits'))
    expect(res.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })
})
