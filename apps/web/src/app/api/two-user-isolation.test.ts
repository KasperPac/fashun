import { describe, it, expect, vi, beforeEach } from 'vitest'

// Two users, one in-memory database. The fake client does NOT apply row-level
// security to tables, so these tests prove each route scopes its own queries.
// Storage signing is limited to the caller's own folder, as the bucket policy does.

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, current: 'A' }))
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const A_ITEM = '10000000-0000-4000-8000-000000000001'
const A_ITEM_2 = '10000000-0000-4000-8000-000000000002'
const A_OUTFIT = '20000000-0000-4000-8000-000000000001'
const B_ITEM = '10000000-0000-4000-8000-0000000000b1'
const uid = () => (db.current === 'A' ? A : B)

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => {
    const me = uid()
    function from(table: string) {
      let rows = db.tables[table] ?? []
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
      let patch: Row = {}
      const chain: Record<string, unknown> = {}
      const run = () => {
        if (op === 'select') return rows
        const hit = new Set(rows)
        const all = db.tables[table]
        if (op === 'delete') db.tables[table] = all.filter((r) => !hit.has(r))
        if (op === 'update') rows.forEach((r) => Object.assign(r, patch))
        return rows
      }
      const filter = (fn: (r: Row) => boolean) => { rows = rows.filter(fn); return chain }
      chain.select = () => chain
      chain.order = () => chain
      chain.eq = (c: string, v: unknown) => filter((r) => r[c] === v)
      chain.neq = (c: string, v: unknown) => filter((r) => r[c] !== v)
      chain.in = (c: string, v: unknown[]) => filter((r) => v.includes(r[c]))
      chain.contains = (c: string, v: unknown[]) => filter((r) => v.every((x) => (r[c] as unknown[]).includes(x)))
      chain.insert = (v: Row) => { op = 'insert'; const row = { id: crypto.randomUUID(), created_at: 'now', ...v }; db.tables[table].push(row); rows = [row]; return chain }
      chain.update = (v: Row) => { op = 'update'; patch = v; return chain }
      chain.delete = () => { op = 'delete'; return chain }
      chain.single = () => Promise.resolve({ data: run()[0] ?? null, error: rows.length ? null : { message: 'none' } })
      chain.maybeSingle = () => Promise.resolve({ data: run()[0] ?? null, error: null })
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res, rej)
      return chain
    }
    return {
      auth: { getUser: async () => ({ data: { user: { id: me } } }) },
      from,
      storage: { from: () => ({
        createSignedUrl: async (p: string) =>
          p.startsWith(`${me}/`) ? { data: { signedUrl: `https://signed/${p}` }, error: null } : { data: null, error: { message: 'denied' } },
      }) },
    }
  },
}))

const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))

import * as wardrobe from './wardrobe/route'
import * as outfits from './outfits/route'
import * as generate from './outfits/generate/route'
import * as profile from './onboarding/profile/route'

const req = (method: string, body?: unknown, url = 'http://localhost/api/x') =>
  new Request(url, { method, ...(body !== undefined && { body: JSON.stringify(body) }) })

beforeEach(() => {
  vi.clearAllMocks()
  db.current = 'B'
  db.tables = {
    users: [
      { id: A, colour_season: 'autumn', best_colours: ['#111111'], hair_colour: 'black', budget_tier: 'premium', department: 'womens', budgets: { shoes: [200, 700] } },
      { id: B, colour_season: 'winter', best_colours: ['#222222'], hair_colour: 'blonde', budget_tier: null, department: 'both' },
    ],
    wardrobe_items: [
      { id: A_ITEM, user_id: A, ownership: 'owned', category: 'tops', name: 'A secret shirt', colours: ['#B7410E'], style_tags: [], occasion_tags: ['casual'], image_url: `${A}/a1.jpg`, created_at: '1' },
      { id: A_ITEM_2, user_id: A, ownership: 'owned', category: 'bottoms', name: 'A secret chinos', colours: ['#8B7355'], style_tags: [], occasion_tags: ['casual'], image_url: `${A}/a2.jpg`, created_at: '2' },
      { id: B_ITEM, user_id: B, ownership: 'owned', category: 'tops', name: 'B shirt', colours: ['#000000'], style_tags: [], occasion_tags: ['casual'], image_url: `${B}/b1.jpg`, created_at: '3' },
    ],
    outfits: [
      { id: A_OUTFIT, user_id: A, item_id: A_ITEM, item_ids: [A_ITEM], name: 'A secret outfit', occasion: 'casual', pieces: [{ label: 'A secret shirt', colour_hex: '#B7410E', item_id: A_ITEM, in_wardrobe: true }], created_at: '1', wardrobe_items: { name: 'A secret shirt' } },
    ],
  }
})

describe('user B cannot reach user A through any route', () => {
  it('wardrobe list: only B items, only B image paths', async () => {
    const json = await (await wardrobe.GET(req('GET'))).json()
    expect(json.items.map((i: { id: string }) => i.id)).toEqual([B_ITEM])
    expect(JSON.stringify(json)).not.toContain('secret')
    expect(JSON.stringify(json)).not.toContain(A)
  })

  it('wardrobe list: a pasted filter does not widen it', async () => {
    const json = await (await wardrobe.GET(req('GET', undefined, `http://localhost/api/wardrobe?user_id=${A}&ownership=owned`))).json()
    expect(json.items.map((i: { id: string }) => i.id)).toEqual([B_ITEM])
  })

  it('wardrobe edit and delete of A item: 404, A item unchanged', async () => {
    expect((await wardrobe.PATCH(req('PATCH', { id: A_ITEM, name: 'hacked' }))).status).toBe(404)
    expect((await wardrobe.DELETE(req('DELETE', { id: A_ITEM }))).status).toBe(404)
    const a = db.tables.wardrobe_items.find((r) => r.id === A_ITEM)
    expect(a?.name).toBe('A secret shirt')
  })

  it('item images: B saving A image path gets no signed URL for it', async () => {
    const created = await wardrobe.POST(req('POST', { name: 'Sneaky', category: 'tops', imageUrl: `${A}/a1.jpg` }))
    expect(created.status).toBe(201)
    const json = await (await wardrobe.GET(req('GET'))).json()
    const sneaky = json.items.find((i: { name: string }) => i.name === 'Sneaky')
    expect(sneaky.imageUrl).toBe('')
  })

  it('profile: B update only changes B', async () => {
    const res = await profile.PATCH(req('PATCH', { hair_colour: 'brown' }))
    expect(res.status).toBe(200)
    expect(db.tables.users.find((u) => u.id === A)?.hair_colour).toBe('black')
    expect(db.tables.users.find((u) => u.id === B)?.hair_colour).toBe('brown')
  })

  it('budget: B changing tier, department and ranges only changes B', async () => {
    const budgets = { tops: [5, 40], bottoms: [10, 50], shoes: [15, 60], outerwear: [20, 80], bags: [10, 40], accessories: [5, 25] }
    const res = await profile.PATCH(req('PATCH', { budget_tier: 'budget', department: 'mens', budgets }))
    expect(res.status).toBe(200)
    const a = db.tables.users.find((u) => u.id === A)
    const b = db.tables.users.find((u) => u.id === B)
    expect(a).toMatchObject({ budget_tier: 'premium', department: 'womens', budgets: { shoes: [200, 700] } })
    expect(b).toMatchObject({ budget_tier: 'budget', department: 'mens', budgets })
  })

  it('budget: a user id in the body cannot reach A\'s tier', async () => {
    const res = await profile.PATCH(req('PATCH', { id: A, user_id: A, budget_tier: 'mid' }))
    expect(res.status).toBe(200)
    expect(db.tables.users.find((u) => u.id === A)?.budget_tier).toBe('premium')
    expect(db.tables.users.find((u) => u.id === B)?.budget_tier).toBe('mid')
  })

  it('outfits list: none of A', async () => {
    const json = await (await outfits.GET(req('GET'))).json()
    expect(json.outfits).toEqual([])
  })

  it('outfits delete of A outfit: 404, still there', async () => {
    expect((await outfits.DELETE(req('DELETE', { id: A_OUTFIT }))).status).toBe(404)
    expect(db.tables.outfits).toHaveLength(1)
  })

  it('outfits save anchored on A item: 404; piece pointing at A item is stripped', async () => {
    const piece = { label: 'x', colour_hex: '#000000', item_id: A_ITEM, in_wardrobe: true }
    expect((await outfits.POST(req('POST', { item_id: A_ITEM, name: 'n', pieces: [piece] }))).status).toBe(404)
    const res = await outfits.POST(req('POST', { name: 'n', pieces: [piece] }))
    expect(res.status).toBe(201)
    const saved = (await res.json()).outfit
    expect(saved.user_id).toBe(B)
    expect(saved.item_ids).toEqual([])
    expect(saved.pieces[0]).toMatchObject({ item_id: null, in_wardrobe: false })
  })

  it('style me by item: A item is 404 and Claude is never asked', async () => {
    const res = await generate.POST(req('POST', { item_id: A_ITEM }))
    expect(res.status).toBe(404)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('style me by occasion: counts only B pieces (A has more, B has too few)', async () => {
    const res = await generate.POST(req('POST', { occasion: 'casual' }))
    expect(res.status).toBe(422)
    expect((await res.json()).have).toEqual(['tops'])
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
