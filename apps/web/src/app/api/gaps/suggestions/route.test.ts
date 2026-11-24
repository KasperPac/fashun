import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// One in-memory database for the signed-in client and the service client. The fake does not apply
// row-level security, so the route's own user_id filters are what these tests prove.
type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  user: 'A' as string | null,
  tables: {} as Record<string, Row[]>,
  usage: {} as Record<string, number>,
  failRpc: false,
  failRead: false,
}))
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'

function table(name: string) {
  let rows = db.tables[name] ?? []
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return chain }
  chain.maybeSingle = () =>
    Promise.resolve(db.failRead && name === 'gap_suggestions' ? { data: null, error: { message: 'x' } } : { data: rows[0] ?? null, error: null })
  chain.upsert = (row: Row, opts: { onConflict: string }) => {
    const keys = opts.onConflict.split(',')
    const all = (db.tables[name] ??= [])
    const at = all.findIndex((r) => keys.every((k) => r[k] === row[k]))
    if (at >= 0) all[at] = { ...all[at], ...row }
    else all.push({ id: crypto.randomUUID(), ...row })
    return Promise.resolve({ error: null })
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
    // Same rule as gap_search_reserve: one step, never past the cap.
    rpc: async (fn: string, args: { p_month: string; p_cap: number }) => {
      if (db.failRpc) return { data: null, error: { message: 'x' } }
      expect(fn).toBe('gap_search_reserve')
      const n = db.usage[args.p_month] ?? 0
      if (args.p_cap <= 0 || n >= args.p_cap) return { data: null, error: null }
      db.usage[args.p_month] = n + 1
      return { data: n + 1, error: null }
    },
  }),
}))

const search = vi.hoisted(() => vi.fn())
vi.mock('@/lib/gap-search', async (orig) => ({ ...(await orig<typeof import('@/lib/gap-search')>()), findGapSuggestions: search }))

import { ProductSourceError, type GapSuggestion } from '@/lib/gap-search'
import { GET } from './route'

const ITEM: GapSuggestion = {
  title: 'Black loafers', shop: 'Kmart', price: 30, imageUrl: 'https://img.example/1.jpg', link: 'https://kmart.com.au/p/1', productId: '1',
  colour: '#FFB347', colourName: 'Apricot', reason: 'Apricot, one of your Spring colours.',
}
const PALETTE = { season: 'spring', best: ['#FFB347', '#FF7F50'], avoid: ['#000000'] }
const get = (q = 'occasion=work&category=shoes') => GET(new Request(`http://localhost/api/gaps/suggestions?${q}`))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ENABLE_GAP_SUGGESTIONS', 'true')
  vi.stubEnv('SERPAPI_API_KEY', 'test-key')
  vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '')
  vi.stubEnv('TRY_ON_TEST_DATE', '2026-11-18T10:00:00+11:00')
  vi.stubEnv('VERCEL_ENV', 'preview')
  db.user = A
  db.usage = {}
  db.failRpc = false
  db.failRead = false
  db.tables = {
    users: [
      { id: A, budget_tier: 'budget', department: 'womens', budgets: { shoes: [10, 60] }, colour_season: 'spring', best_colours: ['#FFB347', '#FF7F50'], avoid_colours: ['#000000'] },
      { id: B, budget_tier: null, department: 'both' },
    ],
    gap_suggestions: [],
  }
  search.mockResolvedValue([ITEM])
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

describe('GET /api/gaps/suggestions', () => {
  it('first opening searches once with the user\'s own tier, department and range', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', items: [ITEM], stored: false })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith({ occasion: 'work', category: 'shoes', tier: 'budget', department: 'womens', priceRange: [10, 60], palette: PALETTE }, expect.anything())
    expect(db.usage['2026-11']).toBe(1)
  })

  it('an empty live search logs and returns the counts dropped at each filter, nothing else', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const counts = { raw: 20, notTierShop: 12, outOfPrice: 3, wrongDepartmentOrOccasion: 2, duplicate: 0, passed: 3, colourDropped: 3, titleColourDropped: 1 }
    search.mockImplementation(async (_i: unknown, deps: { onEmpty: (c: typeof counts) => void }) => { deps.onEmpty(counts); return [] })
    const body = await (await get()).json()
    expect(body).toEqual({ status: 'ok', items: [], stored: false, diagnosis: counts })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('gap-suggestions empty raw=20 not_tier_shop=12 out_of_price=3 wrong_department_or_occasion=2 duplicate=0 colour_dropped=3 title_colour_dropped=1')
    warn.mockRestore()
  })

  it('tier, department and range in the request are ignored', async () => {
    await get('occasion=work&category=shoes&tier=premium&department=mens&min=1&max=9999')
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ tier: 'budget', department: 'womens', priceRange: [10, 60] }), expect.anything())
  })

  it('reopening a gap the same day makes no search', async () => {
    await get()
    search.mockClear()
    const res = await get()
    expect(await res.json()).toEqual({ status: 'ok', items: [ITEM], stored: true })
    expect(search).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBe(1)
  })

  it('stored suggestions refresh after a day', async () => {
    await get()
    vi.stubEnv('TRY_ON_TEST_DATE', '2026-11-19T10:00:00+11:00')
    const res = await get()
    expect((await res.json()).stored).toBe(false)
    expect(search).toHaveBeenCalledTimes(2)
    expect(db.usage['2026-11']).toBe(2)
  })

  it('an empty answer is stored too, so the next opening makes no search', async () => {
    search.mockResolvedValue([])
    expect(await (await get()).json()).toEqual({ status: 'ok', items: [], stored: false })
    search.mockClear()
    expect(await (await get()).json()).toEqual({ status: 'ok', items: [], stored: true })
    expect(search).not.toHaveBeenCalled()
  })

  it('changing the tier or the range is a new key, so it searches again', async () => {
    await get()
    ;(db.tables.users[0] as Row).budget_tier = 'premium'
    await get()
    ;(db.tables.users[0] as Row).budgets = { shoes: [10, 80] }
    await get()
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('search failure shows Suggestions aren\'t available', async () => {
    search.mockRejectedValueOnce(new ProductSourceError('Product search failed (HTTP 500)'))
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'unavailable', message: "Suggestions aren't available right now" })
    expect(db.tables.gap_suggestions).toHaveLength(0)
    expect((await (await get()).json()).status).toBe('ok')
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('a source that never answers times out into the not available state', async () => {
    vi.useFakeTimers()
    search.mockReturnValue(new Promise(() => {}))
    const pending = get()
    await vi.advanceTimersByTimeAsync(12_000)
    const res = await pending
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('unavailable')
    expect(db.tables.gap_suggestions).toHaveLength(0)
  })

  it('a missing key shows Suggestions aren\'t available', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '')
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('unavailable')
    expect(search).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBeUndefined()
  })

  it('fixtures need no key', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '')
    vi.stubEnv('GAP_SEARCH_FIXTURES', '1')
    expect((await (await get()).json()).status).toBe('ok')
  })

  it('a count or storage read that fails shows not available and makes no search', async () => {
    db.failRpc = true
    expect((await get()).status).toBe(200)
    db.failRpc = false
    db.failRead = true
    expect((await get()).status).toBe(200)
    expect(search).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 'false', 'TRUE', '1', 'yes'])('switch off (%s) calls no paid service', async (value) => {
    if (value === undefined) vi.stubEnv('ENABLE_GAP_SUGGESTIONS', undefined as unknown as string)
    else vi.stubEnv('ENABLE_GAP_SUGGESTIONS', value)
    // Even a gap stored earlier is not shown while the switch is off.
    db.tables.gap_suggestions = [{ user_id: A, occasion: 'work', category: 'shoes', tier: 'budget', department: 'womens', price_min: 10, price_max: 60, day: '2026-11-18', items: [ITEM] }]
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'unavailable', message: "Suggestions aren't available right now" })
    expect(search).not.toHaveBeenCalled()
    expect(db.usage).toEqual({})
  })

  it('switch off calls no paid service', async () => {
    vi.stubEnv('ENABLE_GAP_SUGGESTIONS', 'false')
    await get()
    await get('occasion=formal&category=tops')
    expect(search).not.toHaveBeenCalled()
    expect(db.usage).toEqual({})
  })

  it('no tier gets a pick-a-budget answer and makes no search', async () => {
    db.user = B
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'no_tier', message: 'Pick a budget to get suggestions' })
    expect(search).not.toHaveBeenCalled()
    expect(db.usage).toEqual({})
  })

  it('monthly search limit pauses suggestions and makes no search', async () => {
    vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '2')
    await get('occasion=work&category=shoes')
    await get('occasion=work&category=tops')
    search.mockClear()
    const res = await get('occasion=formal&category=shoes')
    expect(await res.json()).toEqual({ status: 'paused', message: 'Suggestions are paused until 1 December', resume_on: '2026-12-01' })
    expect(search).not.toHaveBeenCalled()
    expect(db.usage['2026-11']).toBe(2)
    // A gap stored today still shows its items, with no search.
    expect(await (await get('occasion=work&category=shoes')).json()).toEqual({ status: 'ok', items: [ITEM], stored: true })
    expect(search).not.toHaveBeenCalled()
  })

  it('monthly search limit never goes past the cap when openings arrive together', async () => {
    vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '3')
    const gaps = ['work', 'casual', 'formal', 'smart-casual', 'work'].map((o, i) => `occasion=${o}&category=${i === 4 ? 'tops' : 'shoes'}`)
    const results = await Promise.all(gaps.map((q) => get(q).then((r) => r.json())))
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(3)
    expect(results.filter((r) => r.status === 'paused')).toHaveLength(2)
    expect(search).toHaveBeenCalledTimes(3)
    expect(db.usage['2026-11']).toBe(3)
  })

  it('a fixture answer counts against the limit like a live one', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '')
    vi.stubEnv('GAP_SEARCH_FIXTURES', '1')
    vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '1')
    await get('occasion=work&category=shoes')
    expect((await (await get('occasion=work&category=tops')).json()).status).toBe('paused')
  })

  it('a cap of 0 pauses every search; an unreadable cap uses 900', async () => {
    vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '0')
    expect((await (await get()).json()).status).toBe('paused')
    vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', 'lots')
    db.usage['2026-11'] = 899
    expect((await (await get()).json()).status).toBe('ok')
    expect((await (await get('occasion=formal&category=tops')).json()).status).toBe('paused')
  })

  it('paused message names the 1st of next month', async () => {
    vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '1')
    for (const [now, month, text, date] of [
      ['2026-11-30T10:00:00+11:00', '2026-11', 'Suggestions are paused until 1 December', '2026-12-01'],
      ['2026-12-31T10:00:00+11:00', '2026-12', 'Suggestions are paused until 1 January', '2027-01-01'],
    ] as const) {
      vi.stubEnv('TRY_ON_TEST_DATE', now)
      db.usage[month] = 1
      expect(await (await get()).json()).toEqual({ status: 'paused', message: text, resume_on: date })
    }
    expect(search).not.toHaveBeenCalled()
  })

  it('suggestion calls refuse signed-out requests', async () => {
    db.user = null
    const res = await get()
    expect(res.status).toBe(401)
    vi.stubEnv('ENABLE_GAP_SUGGESTIONS', 'false')
    expect((await get()).status).toBe(401)
    expect(search).not.toHaveBeenCalled()
    expect(db.usage).toEqual({})
  })

  it('refuses an unknown occasion or category', async () => {
    expect((await get('occasion=party&category=shoes')).status).toBe(400)
    expect((await get('occasion=work&category=bags')).status).toBe(400)
    expect((await get('')).status).toBe(400)
    expect(search).not.toHaveBeenCalled()
  })
  describe('with the real colour step (stand-in source and photo tagger)', () => {
    const raw = (n: number) => ({ title: `Women's loafers ${n}`, shop: 'Kmart', price: 20 + n, imageUrl: `https://img.example/${n}.jpg`, link: `https://kmart.com.au/p/${n}`, productId: String(n) })
    const source = { search: vi.fn() }
    const tagger = vi.fn()
    beforeEach(async () => {
      const real = await vi.importActual<typeof import('@/lib/gap-search')>('@/lib/gap-search')
      source.search.mockReset().mockResolvedValue([raw(1), raw(2), raw(3)])
      tagger.mockReset().mockImplementation(async (url: string) => (url.endsWith('/1.jpg') ? '#FFB347' : url.endsWith('/2.jpg') ? '#000000' : null))
      search.mockImplementation((input) => real.findGapSuggestions(input, { source, tagger }))
    })

    it('stores items with their colour and reason, and reopening makes no search and no AI call', async () => {
      const first = await (await get()).json()
      expect(first.items).toHaveLength(1)
      expect(first.items[0]).toMatchObject({ colour: '#FFB347', colourName: 'Apricot', reason: 'Apricot, one of your Spring colours.' })
      expect(source.search).toHaveBeenCalledTimes(1)
      expect(tagger).toHaveBeenCalledTimes(3)
      source.search.mockClear()
      tagger.mockClear()
      const again = await (await get()).json()
      expect(again).toEqual({ status: 'ok', items: first.items, stored: true })
      expect(source.search).not.toHaveBeenCalled()
      expect(tagger).not.toHaveBeenCalled()
    })

    it('switch off makes no search and no AI call', async () => {
      vi.stubEnv('ENABLE_GAP_SUGGESTIONS', 'false')
      expect((await get()).status).toBe(200)
      expect(source.search).not.toHaveBeenCalled()
      expect(tagger).not.toHaveBeenCalled()
    })

    it('the monthly limit makes no AI call', async () => {
      vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '0')
      expect((await (await get()).json()).status).toBe('paused')
      expect(tagger).not.toHaveBeenCalled()
    })

    it('a tagging failure for the whole batch shows not available and stores nothing', async () => {
      tagger.mockRejectedValue(new Error('down'))
      const res = await get()
      expect(res.status).toBe(200)
      expect((await res.json()).status).toBe('unavailable')
      expect(db.tables.gap_suggestions).toHaveLength(0)
    })

    it('a user with no palette gets not available, with no search and no AI call', async () => {
      ;(db.tables.users[0] as Row).best_colours = []
      expect((await get()).status).toBe(200)
      expect(source.search).not.toHaveBeenCalled()
      expect(tagger).not.toHaveBeenCalled()
      expect(db.usage).toEqual({})
    })
  })
})
