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
vi.mock('@/lib/gap-search/shop-link', async (orig) => ({ ...(await orig<typeof import('@/lib/gap-search/shop-link')>()), resolveShopLink: lookup }))
const ok = (link: string) => ({ link, reason: null, candidates: 1, hosts: ['www.kmart.com.au'], path: 'site' })
const fail = (reason: string, over: Record<string, unknown> = {}) => ({ link: null, reason, candidates: 2, hosts: ['www.google.com', 'bigw.com'], path: 'token', ...over })

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
  lookup.mockResolvedValue(ok('https://www.kmart.com.au/product/black-loafers'))
})
afterEach(() => { vi.unstubAllEnvs() })

describe('GET /api/gaps/shop-link', () => {
  it('shop link opens the shop\'s own page: one search, the link is stored, the shop\'s page is where the tab goes', async () => {
    const res = await get()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://www.kmart.com.au/product/black-loafers')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith({ title: 'Black loafers', shop: 'Kmart', token: null })
    expect(db.usage['2026-11']).toBe(1)
    expect((db.tables.gap_suggestions[0].items as Row[])[0].link).toBe('https://www.kmart.com.au/product/black-loafers')
  })

  it('finds the item when the same gap has two rows from one day (budget changed)', async () => {
    db.tables.gap_suggestions = [
      { id: 'old', user_id: A, occasion: 'work', category: 'shoes', day: '2026-11-18', items: [{ title: 'Other', shop: 'Kmart' }] },
      { id: 'r1', user_id: A, occasion: 'work', category: 'shoes', day: '2026-11-18', items: [{ ...GOOGLE_ITEM }] },
    ]
    const res = await get()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://www.kmart.com.au/product/black-loafers')
    expect((db.tables.gap_suggestions[1].items as Row[])[0].link).toBe('https://www.kmart.com.au/product/black-loafers')
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
    lookup.mockResolvedValue(ok('https://www.google.com/search?q=x'))
    const res = await get()
    expect(res.status).toBe(404)
    expect(res.headers.get('location')).toBeNull()
    expect(await res.text()).toContain("We couldn&#39;t find this item on Kmart&#39;s website. It may have sold out. Close this tab and try another suggestion.")
    expect((db.tables.gap_suggestions[0].items as Row[])[0].link).toBe(GOOGLE_ITEM.link)
  })

  it('UI-20 no link found shows Couldn\'t open the shop with the matching message', async () => {
    lookup.mockResolvedValue(fail('no_results'))
    const res = await get()
    const html = await res.text()
    expect(html).toContain('Fashun')
    expect(html).toContain('Couldn&#39;t open the shop</h1>')
    expect(html).toContain("We couldn&#39;t find this item on Kmart&#39;s website.")
    expect(html).not.toContain('<button')
  })

  it('a lookup that overruns its time shows the same page with reason timeout and stores nothing', async () => {
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

  it('signed-out gets a real 404 page in plain words, and another user\'s item is not found', async () => {
    db.user = null
    const out = await get()
    expect(out.status).toBe(404)
    expect(out.headers.get('content-type')).toContain('text/html')
    const body = await out.text()
    expect(body).toContain('Couldn&#39;t open the shop')
    expect(body).toContain('Sign in to Fashun')
    expect(lookup).not.toHaveBeenCalled()
    db.user = B
    const res = await get()
    expect(res.headers.get('location')).toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('an unknown gap is not found', async () => {
    const res = await GET(new Request('http://localhost/api/gaps/shop-link?occasion=x&category=shoes&t=a'))
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('Couldn&#39;t open the shop')
  })

  it('a stored shop-host link is opened with no search and nothing reserved, even when the item has a token', async () => {
    db.tables.gap_suggestions[0].items = [{ ...GOOGLE_ITEM, link: 'https://www.bigw.com.au/p/1', shop: 'BIG W', immersiveToken: 'TOK' }]
    const res = await get()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://www.bigw.com.au/p/1')
    expect(lookup).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBeUndefined()
  })

  it('an item with a token is looked up with its token: one call, one reservation, link stored', async () => {
    db.tables.gap_suggestions[0].items = [{ ...GOOGLE_ITEM, immersiveToken: 'TOK' }]
    const res = await get()
    expect(res.status).toBe(302)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith({ title: 'Black loafers', shop: 'Kmart', token: 'TOK' })
    expect(db.usage['2026-11']).toBe(1)
    expect((db.tables.gap_suggestions[0].items as Row[])[0]).toMatchObject({ immersiveToken: 'TOK', link: 'https://www.kmart.com.au/product/black-loafers' })
  })

  it('a shop with no known website reserves nothing and makes no call', async () => {
    db.tables.gap_suggestions[0].items = [{ ...GOOGLE_ITEM, shop: 'Unknown Shop' }]
    const res = await get()
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('data-reason="no_store_on_shop_host"')
    expect(lookup).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBeUndefined()
  })

  it.each(['no_token', 'no_results', 'no_store_on_shop_host', 'http_429', 'unreadable', 'timeout'])(
    'reason %s is on the failure page and in one log line, with hosts only',
    async (reason) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      lookup.mockResolvedValue(fail(reason))
      const html = await (await get()).text()
      expect(html).toContain(`data-reason="${reason}"`)
      expect(html).toContain('data-hosts="www.google.com,bigw.com"')
      expect(html).toContain('data-candidates="2"')
      expect(html).not.toMatch(/test-key|Black loafers|api_key|\/product/)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toBe(`gap-shop-link reason=${reason} path=token candidates=2 hosts=www.google.com,bigw.com`)
      warn.mockRestore()
    },
  )

  it('a lookup that never answers in time gives reason timeout', async () => {
    lookup.mockRejectedValue(new Error('slow'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await (await get()).text()).toContain('data-reason="timeout"')
    warn.mockRestore()
  })

  it('never more than one search per tap, and the monthly cap is respected', async () => {
    vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '1')
    db.tables.gap_suggestions[0].items = [{ ...GOOGLE_ITEM, immersiveToken: 'TOK' }]
    lookup.mockResolvedValue(fail('no_results'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await get()
    await get()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(db.usage['2026-11']).toBe(1)
  })
})
