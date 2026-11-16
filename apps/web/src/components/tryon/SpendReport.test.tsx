import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SpendReportView from './SpendReport'
import { loadSpendReport, parseSpend, percentUsed } from '@/lib/try-on-spend-client'

const json = {
  month: '2026-11', images: 42, pictures: 23, spent_usd: 3.15, cap_usd: 7.5, price_usd: 0.075,
  previous: [
    { month: '2026-09', images: 3, spent_usd: 0.225, pictures: 1 },
    { month: '2026-10', images: 55, spent_usd: 4.125, pictures: 30 },
  ],
}
const render = (j: unknown) => renderToStaticMarkup(<SpendReportView report={parseSpend(j)!} />)

describe('Try-on spend page', () => {
  it('owner sees spend, cap, count, images and previous months', () => {
    const html = render(json)
    expect(html).toContain('This month · November')
    expect(html).toContain('US$3.15')
    expect(html).toContain('of US$7.50 cap')
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-label="Spend this month"')
    expect(html).toContain('42% used · resets 1 December (Sydney time)')
    expect(html).toMatch(/Outfits tried on<\/dt><dd[^>]*>23</)
    expect(html).toMatch(/FASHN images<\/dt><dd[^>]*>42</)
    expect(html).toContain('US$0.075')
    expect(html).toContain('<caption class="sr-only">')
    expect(html.indexOf('October')).toBeLessThan(html.indexOf('September')) // newest first
    expect(html).toContain('US$4.13') // 55 images, half up
    expect(html).toContain('US$0.23') // 3 images, 0.225 half up
    expect(html).toContain('Spend is images × US$0.075. FASHN&#x27;s usage page shows the same images as credits.')
  })

  it('spend is images times price rounded half up to the cent', () => {
    for (const [images, shown] of [[1, 'US$0.08'], [2, 'US$0.15'], [3, 'US$0.23'], [99, 'US$7.43']] as const) {
      expect(render({ ...json, images, spent_usd: images * 0.075, cap_usd: 10, previous: [] })).toContain(shown)
    }
  })

  it('shows the paused line when the cap is reached', () => {
    const html = render({ ...json, spent_usd: 7.5, images: 100 })
    expect(html).toContain('Cap reached · try-on paused until 1 December')
    expect(html).toContain('bg-danger')
  })

  it('does not round up to 100% before the cap is reached', () => {
    expect(percentUsed(74_999, 75_000)).toBe(99)
    expect(percentUsed(75_000, 75_000)).toBe(100)
    expect(percentUsed(80_000, 75_000)).toBe(100)
  })

  it('says so when there are no earlier months', () => {
    const html = render({ ...json, previous: [] })
    expect(html).toContain('No earlier months yet.')
    expect(html).not.toContain('<table')
  })

  it('wraps the year in December to January', () => {
    expect(render({ ...json, month: '2026-12', spent_usd: 7.5 })).toContain('until 1 January')
  })

  it('shows the counts but no spend when the price setting is missing', () => {
    const html = render({ ...json, spent_usd: null, cap_usd: null, price_usd: null, remaining_usd: null, previous: [{ month: '2026-10', images: 5, spent_usd: null, pictures: 2 }] })
    expect(html).toContain('the price per image isn&#x27;t set')
    expect(html).not.toContain('role="meter"')
    expect(html).not.toContain('Price per image')
    expect(html).toMatch(/FASHN images<\/dt><dd[^>]*>42</)
    expect(html).toContain('–')
  })

  it('keeps only the newest 12 previous months', () => {
    const previous = Array.from({ length: 14 }, (_, i) => ({ month: `2025-${String((i % 12) + 1).padStart(2, '0')}`, images: 1, spent_usd: 0.075, pictures: 1 }))
    expect(parseSpend({ ...json, previous })!.previous).toHaveLength(12)
  })
})

describe('loading the spend', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.restoreAllMocks())
  it('returns null on a refusal, a bad answer or a dropped connection', async () => {
    expect(await loadSpendReport({ fetch: async () => new Response('{}', { status: 404 }) })).toBeNull()
    expect(await loadSpendReport({ fetch: async () => new Response('{"x":1}') })).toBeNull()
    expect(await loadSpendReport({ fetch: async () => { throw new Error('offline') } })).toBeNull()
    expect((await loadSpendReport({ fetch: async () => new Response(JSON.stringify(json)) }))?.images).toBe(42)
  })
})
