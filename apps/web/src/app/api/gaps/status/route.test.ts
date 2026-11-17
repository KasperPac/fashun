import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ user: 'A' as string | null, users: [] as Row[], usage: {} as Record<string, number>, failUsage: false }))
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'

function from(name: string) {
  let rows: Row[] = name === 'users' ? db.users : Object.entries(db.usage).map(([month, searches]) => ({ month, searches }))
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return chain }
  chain.maybeSingle = () => Promise.resolve(db.failUsage && name === 'gap_search_usage' ? { data: null, error: { message: 'x' } } : { data: rows[0] ?? null, error: null })
  return chain
}
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: db.user ? { id: db.user } : null } }) }, from }),
  createServiceClient: async () => ({ from }),
}))

import { GET } from './route'

beforeEach(() => {
  vi.stubEnv('ENABLE_GAP_SUGGESTIONS', 'true')
  vi.stubEnv('SERPAPI_API_KEY', 'test-key')
  vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '')
  vi.stubEnv('TRY_ON_TEST_DATE', '2026-11-18T10:00:00+11:00')
  vi.stubEnv('VERCEL_ENV', 'preview')
  db.user = A
  db.usage = {}
  db.failUsage = false
  db.users = [
    { id: A, budget_tier: 'mid', department: 'womens', budgets: { shoes: [100, 250] } },
    { id: B, budget_tier: null, department: 'both' },
  ]
})
afterEach(() => vi.unstubAllEnvs())

describe('gap status route', () => {
  it('is ready with the caller\'s own tier, department and ranges, and makes no search', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const body = await (await GET()).json()
    expect(body).toMatchObject({ status: 'ready', tier: 'mid', department: 'womens' })
    expect(body.ranges.shoes).toEqual([100, 250])
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('says no_tier for a user with no tier, whatever another user has', async () => {
    db.user = B
    expect(await (await GET()).json()).toEqual({ status: 'no_tier' })
  })
  it('says paused at the cap, naming the 1st of next month', async () => {
    vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', '5')
    db.usage = { '2026-11': 5 }
    expect(await (await GET()).json()).toEqual({ status: 'paused', resume_on: '2026-12-01' })
  })
  it('says unavailable with the switch off, with no key, or when the count cannot be read', async () => {
    db.failUsage = true
    expect(await (await GET()).json()).toEqual({ status: 'unavailable' })
    db.failUsage = false
    vi.stubEnv('SERPAPI_API_KEY', '')
    expect(await (await GET()).json()).toEqual({ status: 'unavailable' })
    vi.stubEnv('ENABLE_GAP_SUGGESTIONS', '')
    expect(await (await GET()).json()).toEqual({ status: 'unavailable' })
  })
  it('refuses signed-out requests', async () => {
    db.user = null
    expect((await GET()).status).toBe(401)
  })
})
