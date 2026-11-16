import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  firstOfNextMonth, isTryOnOwner, planTryOn, readTryOnConfig, summariseSpend, sydneyMonth, toUnits,
  type OutfitPiece,
} from './try-on'

const p = (label: string, category: string | null, imageRef: string | null = `${label}.jpg`): OutfitPiece =>
  ({ label, itemId: category ? label : null, category, imageRef })

afterEach(() => vi.unstubAllEnvs())

describe('planTryOn', () => {
  it('plans the top, then the bottom', () => {
    const plan = planTryOn([p('jeans', 'bottoms'), p('tee', 'tops')])
    expect(plan.ok && plan.steps.map((s) => s.step)).toEqual(['top', 'bottom'])
  })
  it('plans a dress or jumpsuit as one step and covers the rest', () => {
    const plan = planTryOn([p('tee', 'tops'), p('dress', 'dresses')])
    expect(plan.ok && plan.steps.map((s) => [s.step, s.category])).toEqual([['one-piece', 'one-pieces']])
    expect(plan.ok && plan.skipped).toEqual([{ label: 'tee', reason: 'covered' }])
    const jump = planTryOn([p('suit', 'jumpsuits')])
    expect(jump.ok && jump.steps).toHaveLength(1)
  })
  it('skips shoes, bags, accessories and outerwear, and pieces not in the wardrobe', () => {
    const plan = planTryOn([p('tee', 'tops'), p('boots', 'shoes'), p('tote', 'bags'), p('belt', 'accessories'), p('coat', 'outerwear'), p('idea', null, null)])
    expect(plan.ok && plan.skipped.map((s) => s.label)).toEqual(['boots', 'tote', 'belt', 'coat', 'idea'])
  })
  it('refuses a missing or empty garment photo, naming the piece', () => {
    expect(planTryOn([p('tee', 'tops', null), p('jeans', 'bottoms')])).toMatchObject({ ok: false, code: 'MISSING_GARMENT_PHOTO', missing: ['tee'] })
    expect(planTryOn([p('tee', 'tops', ''), p('jeans', 'bottoms', null)])).toMatchObject({ ok: false, missing: ['tee', 'jeans'] })
  })
  it('does not need a photo for pieces that are not drawn', () => {
    expect(planTryOn([p('tee', 'tops'), p('boots', 'shoes', null)]).ok).toBe(true)
  })
  it('refuses an empty outfit or one with nothing to draw', () => {
    expect(planTryOn([])).toMatchObject({ ok: false, code: 'NO_TRYABLE_PIECES' })
    expect(planTryOn([p('boots', 'shoes')])).toMatchObject({ ok: false, code: 'NO_TRYABLE_PIECES' })
  })
})

describe('sydneyMonth', () => {
  it('rolls over at midnight Sydney time, in summer (UTC+11) and winter (UTC+10)', () => {
    expect(sydneyMonth(new Date('2026-11-30T12:59:59Z'))).toBe('2026-11')
    expect(sydneyMonth(new Date('2026-11-30T13:00:00Z'))).toBe('2026-12')
    expect(sydneyMonth(new Date('2026-06-30T13:59:59Z'))).toBe('2026-06')
    expect(sydneyMonth(new Date('2026-06-30T14:00:00Z'))).toBe('2026-07')
  })
  it('rolls the year over', () => {
    expect(sydneyMonth(new Date('2026-12-31T13:00:00Z'))).toBe('2027-01')
    expect(firstOfNextMonth('2026-12')).toBe('2027-01-01')
    expect(firstOfNextMonth('2026-11')).toBe('2026-12-01')
  })
})

describe('settings', () => {
  it('reads the cap and price, and is unconfigured when either is missing or bad', () => {
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '7.50')
    vi.stubEnv('TRY_ON_PRICE_USD', '0.075')
    expect(readTryOnConfig()).toEqual({ capUnits: 75000, priceUnits: 750 })
    for (const bad of ['', ' ', 'abc', '0', '-1']) {
      vi.stubEnv('TRY_ON_PRICE_USD', bad)
      expect(readTryOnConfig()).toBeNull()
    }
    vi.stubEnv('TRY_ON_PRICE_USD', '0.075')
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '')
    expect(readTryOnConfig()).toBeNull()
  })
  it('names the owner by account id only', () => {
    vi.stubEnv('TRY_ON_OWNER_USER_ID', 'abc')
    expect(isTryOnOwner('abc')).toBe(true)
    expect(isTryOnOwner('abd')).toBe(false)
    vi.stubEnv('TRY_ON_OWNER_USER_ID', '')
    expect(isTryOnOwner('')).toBe(false)
  })
})

describe('summariseSpend', () => {
  it('adds pictures to the cent with no float drift, newest month first', () => {
    const rows = [...Array.from({ length: 100 }, () => ({ month: '2026-10', cost_usd: 0.075 })), { month: '2026-11', cost_usd: '0.0750' }]
    expect(summariseSpend(rows)).toEqual([
      { month: '2026-11', pictures: 1, spentUsd: 0.075 },
      { month: '2026-10', pictures: 100, spentUsd: 7.5 },
    ])
    expect(toUnits(0.075)).toBe(750)
  })
})
