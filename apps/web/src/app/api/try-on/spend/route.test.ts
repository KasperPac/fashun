import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'

vi.mock('@/lib/supabase/server', async () => {
  const { fake: f } = await import('@/lib/__fixtures__/try-on-fake')
  return { createServerClient: async () => f.userClient(), createServiceClient: async () => f.serviceClient() }
})

import { GET } from './route'

const row = (month: string, status = 'charged') => ({ id: crypto.randomUUID(), month, status, cost_usd: 0.075 })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-17T02:00:00Z'))
  fake.reset()
  vi.stubEnv('ENABLE_TRY_ON', 'true')
  vi.stubEnv('TRY_ON_OWNER_USER_ID', A)
  vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '7.50')
  vi.stubEnv('TRY_ON_PRICE_USD', '0.075')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('GET /api/try-on/spend', () => {
  it('shows the owner this month, the cap, the pictures and previous months, to the cent', async () => {
    fake.tables.try_on_ledger.push(...Array.from({ length: 13 }, () => row('2026-11')), row('2026-10'), row('2026-10'), row('2026-11', 'reserved'))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      month: '2026-11',
      spent_usd: 0.975, // 13 pictures x US$0.075; the in-flight reservation is not counted
      cap_usd: 7.5,
      price_usd: 0.075,
      remaining_usd: 6.525,
      pictures: 13,
      previous: [{ month: '2026-10', spent_usd: 0.15, pictures: 2 }],
    })
  })

  it('shows zero before any picture is made', async () => {
    const json = await (await GET()).json()
    expect(json.spent_usd).toBe(0)
    expect(json.pictures).toBe(0)
    expect(json.previous).toEqual([])
  })

  it('returns 404 to any other signed-in account, with no figures', async () => {
    fake.currentUser = B
    const res = await GET()
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toContain('spent')
  })

  it('returns 404 to everyone when no owner is set', async () => {
    vi.stubEnv('TRY_ON_OWNER_USER_ID', '')
    expect((await GET()).status).toBe(404)
  })

  it('returns 404 when try-on is off, even for the owner', async () => {
    vi.stubEnv('ENABLE_TRY_ON', '')
    expect((await GET()).status).toBe(404)
  })

  it('returns 401 when signed out', async () => {
    fake.currentUser = null
    expect((await GET()).status).toBe(401)
  })
})
