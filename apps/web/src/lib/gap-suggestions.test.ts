import { describe, it, expect, vi, afterEach } from 'vitest'
import { DEFAULT_GAP_SEARCH_MONTHLY_CAP, gapDay, gapSearchMonth, readGapSearchCap, withTimeout } from './gap-suggestions'
import { gapSuggestionsEnabled } from './paid-extras'

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

describe('gap suggestion settings', () => {
  it('the switch is on only for exactly "true"', () => {
    for (const v of ['', 'TRUE', '1', 'yes', ' true']) {
      vi.stubEnv('ENABLE_GAP_SUGGESTIONS', v)
      expect(gapSuggestionsEnabled()).toBe(false)
    }
    vi.stubEnv('ENABLE_GAP_SUGGESTIONS', 'true')
    expect(gapSuggestionsEnabled()).toBe(true)
  })

  it('the cap defaults to 900 and reads whole numbers only', () => {
    expect(DEFAULT_GAP_SEARCH_MONTHLY_CAP).toBe(900)
    for (const [v, want] of [['', 900], ['  ', 900], ['abc', 900], ['-5', 900], ['1.5', 900], ['0', 0], ['2', 2], [' 250 ', 250]] as const) {
      vi.stubEnv('GAP_SEARCH_MONTHLY_CAP', v)
      expect(readGapSearchCap()).toBe(want)
    }
  })

  it('the month and the day are Sydney time', () => {
    const lateOnThe30th = new Date('2026-11-30T14:30:00Z') // 1 December 01:30 in Sydney
    expect(gapSearchMonth(lateOnThe30th)).toBe('2026-12')
    expect(gapDay(lateOnThe30th)).toBe('2026-12-01')
  })

  it('withTimeout passes the answer through, or rejects when it is late', async () => {
    vi.useFakeTimers()
    await expect(withTimeout(Promise.resolve(1), 100, () => new Error('late'))).resolves.toBe(1)
    const late = withTimeout(new Promise<number>(() => {}), 100, () => new Error('late'))
    const assertion = expect(late).rejects.toThrow('late')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })
})
