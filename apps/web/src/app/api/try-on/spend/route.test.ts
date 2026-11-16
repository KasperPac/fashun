import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'
import { formatUsd, toUnits } from '@/lib/try-on'

vi.mock('@/lib/supabase/server', async () => {
  const { fake: f } = await import('@/lib/__fixtures__/try-on-fake')
  return { createServerClient: async () => f.userClient(), createServiceClient: async () => f.serviceClient() }
})

import { GET } from './route'

let batch = 0
/** One ledger row is one FASHN image; every two rows share a request. */
const row = (month: string, status = 'charged', made = true) => ({ id: crypto.randomUUID(), batch_id: `b${Math.floor(batch++ / 2)}`, month, status, picture_made: made })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-17T02:00:00Z'))
  fake.reset()
  batch = 0
  vi.stubEnv('ENABLE_TRY_ON', 'true')
  vi.stubEnv('TRY_ON_OWNER_USER_ID', A)
  vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '7.50')
  vi.stubEnv('TRY_ON_PRICE_USD', '0.075')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('GET /api/try-on/spend', () => {
  it('owner sees spend, cap, count, images and previous months', async () => {
    fake.tables.try_on_ledger.push(...Array.from({ length: 13 }, () => row('2026-11')), row('2026-10'), row('2026-10'), row('2026-11', 'reserved'))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      month: '2026-11',
      images: 13, // the stored, exact count; the in-flight reservation is not counted
      spent_usd: 0.975, // 13 images x US$0.075, exact (the screen rounds it to the cent)
      cap_usd: 7.5,
      price_usd: 0.075,
      remaining_usd: 6.525,
      pictures: 7,
      previous: [{ month: '2026-10', images: 2, spent_usd: 0.15, pictures: 2 }],
    })
  })

  it('spend is rounded once from the exact total, not per charge', async () => {
    // 3 separate failed attempts, each charged for 1 image and nothing else.
    fake.tables.try_on_ledger.push(row('2026-11', 'charged', false), row('2026-11', 'charged', false), row('2026-11', 'charged', false))
    const json = await (await GET()).json()
    expect(json.images).toBe(3)
    expect(json.spent_usd).toBe(0.225)
    expect(json.pictures).toBe(0)
    expect(formatUsd(toUnits(json.spent_usd))).toBe('US$0.23') // not US$0.24, which rounding each charge would give
  })

  it('shows zero before any picture is made', async () => {
    const json = await (await GET()).json()
    expect(json.spent_usd).toBe(0)
    expect(json.pictures).toBe(0)
    expect(json.previous).toEqual([])
  })

  it('spend panel is not found for anyone but the owner', async () => {
    fake.currentUser = B
    const res = await GET()
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toContain('spent')
  })

  it('returns 404 to everyone when no owner is set', async () => {
    vi.stubEnv('TRY_ON_OWNER_USER_ID', '')
    expect((await GET()).status).toBe(404)
  })

  it('still shows the owner the history when try-on is switched off, and 404 to others', async () => {
    vi.stubEnv('ENABLE_TRY_ON', '')
    expect((await GET()).status).toBe(200)
    fake.currentUser = B
    expect((await GET()).status).toBe(404)
  })

  it('uses the preview-only test date for the month, and ignores it in production', async () => {
    fake.tables.try_on_ledger.push(row('2026-11'))
    vi.stubEnv('TRY_ON_TEST_DATE', '2026-12-01T00:05:00+11:00')
    vi.stubEnv('VERCEL_ENV', 'preview')
    const json = await (await GET()).json()
    expect(json.month).toBe('2026-12')
    expect(json.pictures).toBe(0)
    expect(json.previous).toEqual([{ month: '2026-11', images: 1, spent_usd: 0.075, pictures: 1 }])
    vi.stubEnv('VERCEL_ENV', 'production')
    expect((await (await GET()).json()).month).toBe('2026-11')
  })

  it('returns 401 when signed out', async () => {
    fake.currentUser = null
    expect((await GET()).status).toBe(401)
  })
})
