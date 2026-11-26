import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  firstOfNextMonth, formatUsd, fromUnits, imagesToUnits, isTryOnOwner, planTryOn, readTryOnConfig, readTryOnProvider, summariseSpend, sydneyMonth, toUnits, tryOnNow, unitsByMonth,
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
  it('month boundary follows Sydney daylight saving', () => {
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
  it('stores spend exactly as an image count, newest month first, and counts requests', () => {
    const rows = [
      ...Array.from({ length: 100 }, (_, i) => ({ month: '2026-10', batch_id: `b${Math.floor(i / 2)}`, picture_made: true })),
      { month: '2026-11', batch_id: 'n1', picture_made: true },
    ]
    expect(summariseSpend(rows)).toEqual([
      { month: '2026-11', images: 1, pictures: 1 },
      { month: '2026-10', images: 100, pictures: 50 },
    ])
    expect(toUnits(0.075)).toBe(750)
  })

  it('works out dollars from the image count with no float drift', () => {
    expect(imagesToUnits(100, 750)).toBe(75_000)
    expect(imagesToUnits(3, 750)).toBe(2_250)
  })
})

describe('spend is images times price rounded half up to the cent', () => {
  it('spend is images times price rounded half up to the cent', () => {
    const price = toUnits(0.075)
    expect(formatUsd(2 * price)).toBe('US$0.15')
    expect(formatUsd(1 * price)).toBe('US$0.08')
    expect(formatUsd(3 * price)).toBe('US$0.23')
    expect(formatUsd(99 * price)).toBe('US$7.43')
    expect(formatUsd(4 * price)).toBe('US$0.30')
    expect(formatUsd(0)).toBe('US$0.00')
    expect(fromUnits(99 * price)).toBe(7.425)
  })
})

describe('paused message names the next month', () => {
  it('says 1 December in November and 1 January in December', () => {
    expect(firstOfNextMonth('2026-11')).toBe('2026-12-01')
    expect(firstOfNextMonth('2026-12')).toBe('2027-01-01')
  })
})

describe('tryOnNow (preview-only test date)', () => {
  it('uses the test date outside production', () => {
    vi.stubEnv('TRY_ON_TEST_DATE', '2026-12-01T00:05:00+11:00')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(tryOnNow().toISOString()).toBe('2026-11-30T13:05:00.000Z')
    expect(sydneyMonth(tryOnNow())).toBe('2026-12')
  })
  it('is ignored in production, on Vercel or not', () => {
    vi.stubEnv('TRY_ON_TEST_DATE', '2026-12-01T00:05:00+11:00')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(tryOnNow().toISOString()).not.toBe('2026-11-30T13:05:00.000Z')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(tryOnNow().toISOString()).not.toBe('2026-11-30T13:05:00.000Z')
  })
  it('is ignored when it is not a real date or not set', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('TRY_ON_TEST_DATE', 'tomorrow')
    expect(Math.abs(tryOnNow().getTime() - Date.now())).toBeLessThan(1000)
    vi.stubEnv('TRY_ON_TEST_DATE', '')
    expect(Math.abs(tryOnNow().getTime() - Date.now())).toBeLessThan(1000)
  })
})

describe('the provider switch and its price', () => {
  it('is Gemini unless TRY_ON_PROVIDER is fashn', () => {
    for (const v of [undefined, '', 'gemini', 'openai', 'fashn2']) {
      vi.stubEnv('TRY_ON_PROVIDER', v ?? '')
      expect(readTryOnProvider()).toBe('gemini')
    }
    for (const v of ['fashn', ' FASHN ']) {
      vi.stubEnv('TRY_ON_PROVIDER', v)
      expect(readTryOnProvider()).toBe('fashn')
    }
  })

  it('prices a Gemini picture from the setting and a FASHN image at US$0.075 whatever it says', () => {
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '7.50')
    vi.stubEnv('TRY_ON_PRICE_USD', '0.045')
    expect(readTryOnConfig('gemini')).toEqual({ capUnits: 75000, priceUnits: 450 })
    expect(readTryOnConfig('fashn')).toEqual({ capUnits: 75000, priceUnits: 750 })
    vi.stubEnv('TRY_ON_PRICE_USD', '')
    expect(readTryOnConfig('gemini')).toBeNull()
    expect(readTryOnConfig('fashn')).toBeNull()
  })

  it('adds each row at the price it was made at; rows without a price are FASHN images', () => {
    const totals = unitsByMonth([
      { month: '2026-11', price_units: null },
      { month: '2026-11', price_units: 450 },
      { month: '2026-11' },
      { month: '2026-10', price_units: 450 },
    ])
    expect(totals.get('2026-11')).toBe(750 + 450 + 750)
    expect(totals.get('2026-10')).toBe(450)
  })
})

describe('planTryOn for the one-request provider', () => {
  const ok = (plan: ReturnType<typeof planTryOn>) => {
    if (!plan.ok) throw new Error('expected a plan')
    return plan
  }

  it('is one outfit step carrying every drawn garment in a fixed order', () => {
    const plan = ok(planTryOn([p('boots', 'shoes'), p('jeans', 'bottoms'), p('coat', 'outerwear'), p('tee', 'tops'), p('tote', 'bags'), p('belt', 'accessories')], 'gemini'))
    expect(plan.steps).toEqual([{ step: 'outfit', category: null }])
    expect(plan.garments.map((g) => [g.kind, g.label])).toEqual([['top', 'tee'], ['bottom', 'jeans'], ['outerwear', 'coat'], ['shoes', 'boots']])
    expect(plan.skipped).toEqual([{ label: 'tote', reason: 'not_drawn' }, { label: 'belt', reason: 'not_drawn' }])
  })

  it('draws a dress or jumpsuit with shoes, and covers extra jackets and shoes', () => {
    const plan = ok(planTryOn([p('dress', 'dresses'), p('tee', 'tops'), p('a', 'shoes'), p('b', 'shoes'), p('c', 'outerwear'), p('d', 'outerwear')], 'gemini'))
    expect(plan.garments.map((g) => g.kind)).toEqual(['one-piece', 'outerwear', 'shoes'])
    expect(plan.skipped).toEqual([
      { label: 'tee', reason: 'covered' }, { label: 'd', reason: 'covered' }, { label: 'b', reason: 'covered' },
    ])
  })

  it('skips an add-on with no photo but refuses when a core piece has none', () => {
    const plan = ok(planTryOn([p('tee', 'tops'), p('boots', 'shoes', null), p('coat', 'outerwear', '')], 'gemini'))
    expect(plan.garments.map((g) => g.kind)).toEqual(['top'])
    expect(plan.skipped).toEqual([{ label: 'coat', reason: 'not_drawn' }, { label: 'boots', reason: 'not_drawn' }])
    expect(planTryOn([p('tee', 'tops', null), p('boots', 'shoes')], 'gemini')).toMatchObject({ ok: false, code: 'MISSING_GARMENT_PHOTO', missing: ['tee'] })
    expect(planTryOn([p('boots', 'shoes'), p('coat', 'outerwear')], 'gemini')).toMatchObject({ ok: false, code: 'NO_TRYABLE_PIECES' })
  })

  it('leaves the FASHN plan as it was: two steps, shoes and outerwear not drawn', () => {
    const plan = ok(planTryOn([p('tee', 'tops'), p('jeans', 'bottoms'), p('boots', 'shoes'), p('coat', 'outerwear')]))
    expect(plan.steps).toEqual([{ step: 'top', category: 'tops' }, { step: 'bottom', category: 'bottoms' }])
    expect(plan.skipped.map((s) => s.reason)).toEqual(['not_drawn', 'not_drawn'])
  })
})
