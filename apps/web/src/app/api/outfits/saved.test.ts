import { describe, it, expect, vi, beforeEach } from 'vitest'

const A = '00000000-0000-0000-0000-00000000000a'
const GONE = '00000000-0000-0000-0000-0000000000ee'
const OUTFIT_ID = '00000000-0000-0000-0000-0000000000f1'

const mockGetUser = vi.fn()
const eqCalls: Array<[string, string, unknown]> = []
const mockInsert = vi.fn()
let deleted: Array<{ id: string }> = []

const outfitRow = {
  id: OUTFIT_ID, item_id: null, item_ids: [A, GONE], name: 'Sharp Work', occasion: 'work',
  description: 'd', reason: 'Navy is one of your best Autumn colours, and the boots help.', season: 'autumn',
  created_at: '2026-11-16T10:00:00Z', wardrobe_items: null,
  pieces: [
    { label: 'Navy shirt', colour_hex: '#000080', item_id: A, in_wardrobe: true },
    { label: 'Old boots', colour_hex: '#3B2F2F', item_id: GONE, in_wardrobe: true },
  ],
}

function chain(table: string, result: () => unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'in']) c[m] = () => c
  c['eq'] = (col: string, val: unknown) => { eqCalls.push([table, col, val]); return c }
  c['delete'] = () => c
  c['insert'] = (row: unknown) => { mockInsert(row); return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) } }
  c['then'] = (r: (v: unknown) => unknown) => Promise.resolve(result()).then(r)
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => chain(table, () => {
      if (table === 'wardrobe_items') return { data: [{ id: A, category: 'tops', image_url: 'https://shop.example/a.png' }], error: null }
      return { data: deleted.length ? deleted : [outfitRow], error: null }
    }),
  }),
}))

import { GET, POST, DELETE } from './route'

const del = (body: unknown) => DELETE(new Request('http://localhost/api/outfits', { method: 'DELETE', body: JSON.stringify(body) }))

describe('saved outfits API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqCalls.length = 0
    deleted = []
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('GET joins each piece with its current wardrobe item, and marks deleted pieces as removed', async () => {
    const { outfits } = await (await GET(new Request('http://localhost/api/outfits'))).json()
    expect(outfits[0].reason).toContain('Autumn')
    expect(outfits[0].season).toBe('autumn')
    expect(outfits[0].pieces[0]).toMatchObject({ label: 'Navy shirt', category: 'tops', imageUrl: 'https://shop.example/a.png', removed: false })
    expect(outfits[0].pieces[1]).toMatchObject({ label: 'Old boots', category: null, imageUrl: null, removed: true })
    expect(eqCalls).toContainEqual(['outfits', 'user_id', 'user-1'])
    expect(eqCalls).toContainEqual(['wardrobe_items', 'user_id', 'user-1'])
  })

  it('GET needs a signed-in user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(new Request('http://localhost/api/outfits'))).status).toBe(401)
  })

  it('POST keeps the reason and the season the outfit was made for', async () => {
    const res = await POST(new Request('http://localhost/api/outfits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Sharp Work', occasion: 'work', reason: 'Navy is one of your best Autumn colours, and the boots help.', season: 'autumn',
        pieces: [{ label: 'Navy shirt', colour_hex: '#000080', item_id: A, in_wardrobe: true }],
      }),
    }))
    expect(res.status).toBe(201)
    expect(mockInsert.mock.calls[0][0]).toMatchObject({ user_id: 'user-1', reason: expect.stringContaining('Autumn'), season: 'autumn' })
  })

  it('POST rejects an unknown season', async () => {
    const res = await POST(new Request('http://localhost/api/outfits', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', season: 'monsoon', pieces: [{ label: 'a', colour_hex: '#000000', item_id: null, in_wardrobe: false }] }),
    }))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('DELETE removes only the signed-in user\'s outfit', async () => {
    deleted = [{ id: OUTFIT_ID }]
    const res = await del({ id: OUTFIT_ID })
    expect(res.status).toBe(200)
    expect(eqCalls).toEqual([['outfits', 'id', OUTFIT_ID], ['outfits', 'user_id', 'user-1']])
  })

  it('DELETE says not found when nothing matched (someone else\'s outfit or already gone)', async () => {
    // an empty result list is how Supabase reports "no row of yours with that id"
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: async () => ({ auth: { getUser: mockGetUser }, from: () => chain('outfits', () => ({ data: [], error: null })) }),
    }))
    vi.resetModules()
    const { DELETE: fresh } = await import('./route')
    const res = await fresh(new Request('http://localhost/api/outfits', { method: 'DELETE', body: JSON.stringify({ id: OUTFIT_ID }) }))
    expect(res.status).toBe(404)
  })

  it('DELETE validates the id and needs a signed-in user', async () => {
    expect((await del({ id: 'nope' })).status).toBe(400)
    expect((await del({})).status).toBe(400)
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await del({ id: OUTFIT_ID })).status).toBe(401)
  })
})
