import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  user: 'A' as string | null,
  tables: {} as Record<string, Row[]>,
  usage: {} as Record<string, number>,
}))
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'

function table(name: string) {
  let rows = db.tables[name] ?? []
  let mode: 'select' | 'update' = 'select'
  let patch: Row = {}
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.order = () => chain
  chain.limit = () => chain
  chain.update = (p: Row) => { mode = 'update'; patch = p; return chain }
  chain.eq = (c: string, v: unknown) => {
    rows = rows.filter((r) => r[c] === v)
    return chain
  }
  chain.then = (res: (v: unknown) => unknown) => {
    if (mode === 'update') rows.forEach((r) => Object.assign(r, patch))
    return Promise.resolve({ data: mode === 'select' ? rows : null, error: null }).then(res)
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user ? { id: db.user } : null } }) },
    from: table,
  }),
  createServiceClient: async () => ({
    from: table,
    rpc: async (_fn: string, args: { p_month: string; p_cap: number }) => {
      const n = db.usage[args.p_month] ?? 0
      if (args.p_cap <= 0 || n >= args.p_cap) return { data: null, error: null }
      db.usage[args.p_month] = n + 1
      return { data: n + 1, error: null }
    },
  }),
}))

const lookup = vi.hoisted(() => vi.fn())
vi.mock('@/lib/gap-search/shop-link', async (orig) => ({ ...(await orig<typeof import('@/lib/gap-search/shop-link')>()), searchShopLink: lookup }))

import { GET } from './route'

const GOOGLE_ITEM = { title: 'Black loafers', shop: 'Kmart', link: 'https://www.google.com.au/shopping/product/1' }
const get = (t = 'Black loafers') => GET(new Request(`http://localhost/api/gaps/shop-link?occasion=work&category=shoes&t=${encodeURIComponent(t)}`))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ENABLE_GAP_SUGGESTIONS', 'true')
  vi.stubEnv('SERPAPI_API_KEY', 'test-key')
  vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '')
  vi.stubEnv('TRY_ON_TEST_DATE', '2026-11-18T10:00:00+11:00')
  vi.stubEnv('VERCEL_ENV', 'preview')
  db.user = A
  db.usage = {}
  db.tables = { gap_suggestions: [{ id: 'r1', user_id: A, occasion: 'work', category: 'shoes', day: '2026-11-18', items: [{ ...GOOGLE_ITEM }] }] }
  lookup.mockResolvedValue('https://www.kmart.com.au/product/black-loafers')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('GET /api/gaps/shop-link', () => {
  it('shop link opens the shop\'s own page: one search, the link is stored, the shop\'s page is where the tab goes', async () => {
    const res = await get()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://www.kmart.com.au/product/black-loafers')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith({ title: 'Black loafers', shop: 'Kmart' })
    expect(db.usage['2026-11']).toBe(1)
    expect((db.tables.gap_suggestions[0].items as Row[])[0].link).toBe('https://www.kmart.com.au/product/black-loafers')
  })

  it('a second tap on the same item makes no search', async () => {
    await get()
    lookup.mockClear()
    const res = await get()
    expect(res.headers.get('location')).toBe('https://www.kmart.com.au/product/black-loafers')
    expect(lookup).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBe(1)
  })

  it('an item whose link is already on the shop\'s own site costs no search', async () => {
    db.tables.gap_suggestions[0].items = [{ ...GOOGLE_ITEM, link: 'https://kmart.com.au/p/1' }]
    const res = await get()
    expect(res.headers.get('location')).toBe('https://kmart.com.au/p/1')
    expect(lookup).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBeUndefined()
  })

  it('a Google or other-host link is never opened as the shop', async () => {
    lookup.mockResolvedValue('https://www.google.com/search?q=x')
    const res = await get()
    expect(res.status).toBe(404)
    expect(res.headers.get('location')).toBeNull()
    expect(await res.text()).toContain("We couldn&#39;t find this item on Kmart&#39;s website. It may have sold out. Close this tab and try another suggestion.")
    expect((db.tables.gap_suggestions[0].items as Row[])[0].link).toBe(GOOGLE_ITEM.link)
  })

  it('UI-20 no link found shows Couldn\'t open the shop with the matching message', async () => {
    lookup.mockResolvedValue(null)
    const res = await get()
    const html = await res.text()
    expect(html).toContain('Fashun')
    expect(html).toContain('Couldn&#39;t open the shop</h1>')
    expect(html).toContain("We couldn&#39;t find this item on Kmart&#39;s website.")
    expect(html).not.toContain('<button')
  })

  it('a failing search shows the same page and stores nothing', async () => {
    lookup.mockRejectedValue(new Error('x'))
    const res = await get()
    expect(await res.text()).toContain('It may have sold out')
    expect((db.tables.gap_suggestions[0].items as Row[])[0].link).toBe(GOOGLE_ITEM.link)
  })

  it('UI-20 monthly search limit pauses suggestions and makes no search (shop link)', async () => {
    vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '5')
    db.usage['2026-11'] = 5
    const res = await get()
    expect(await res.text()).toContain('Suggestions are paused until 1 December, so we can&#39;t open this link right now.')
    expect(lookup).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBe(5)
  })

  it('switch off makes no search and shows the unavailable message', async () => {
    vi.stubEnv('ENABLE_GAP_SUGGESTIONS', '')
    const res = await get()
    expect(await res.text()).toContain('Suggestions aren&#39;t available right now.')
    expect(lookup).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBeUndefined()
  })

  it('fixture mode makes no search; a fixture link on the shop\'s site is used', async () => {
    vi.stubEnv('GAP_SEARCH_FIXTURES', '1')
    const none = await get()
    expect(none.status).toBe(404)
    db.tables.gap_suggestions[0].items = [{ ...GOOGLE_ITEM, link: 'https://kmart.com.au/products/x' }]
    expect((await get()).headers.get('location')).toBe('https://kmart.com.au/products/x')
    expect(lookup).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBeUndefined()
  })

  it('signed-out gets the standard not-found, and another user\'s item is not found', async () => {
    db.user = null
    expect((await get()).status).toBe(404)
    db.user = B
    const res = await get()
    expect(res.headers.get('location')).toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('an unknown gap is not found', async () => {
    const res = await GET(new Request('http://localhost/api/gaps/shop-link?occasion=x&category=shoes&t=a'))
    expect(res.status).toBe(404)
  })
})
