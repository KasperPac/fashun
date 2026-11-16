import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { paidExtrasEnabled, tryOnEnabled } from './paid-extras'
import { searchByImage } from './lens-search'
import { removeBackground } from './photoroom'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  vi.stubEnv('SERPAPI_API_KEY', 'test-key')
  vi.stubEnv('PHOTOROOM_API_KEY', 'test-key')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('paidExtrasEnabled', () => {
  it('is off when unset', () => {
    vi.stubEnv('ENABLE_PAID_EXTRAS', '')
    expect(paidExtrasEnabled()).toBe(false)
  })
  it.each(['false', '1', 'TRUE', 'yes', ' true'])('is off for %j', (v) => {
    vi.stubEnv('ENABLE_PAID_EXTRAS', v)
    expect(paidExtrasEnabled()).toBe(false)
  })
  it('is on only for "true"', () => {
    vi.stubEnv('ENABLE_PAID_EXTRAS', 'true')
    expect(paidExtrasEnabled()).toBe(true)
  })
})

describe('with paid extras off', () => {
  beforeEach(() => vi.stubEnv('ENABLE_PAID_EXTRAS', ''))

  it('image search makes no call and returns nothing', async () => {
    expect(await searchByImage('https://signed/photo.jpg', 'shirt')).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('background removal makes no call and returns the original image', async () => {
    expect(await removeBackground('b3JpZ2luYWw=')).toBe('b3JpZ2luYWw=')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('with paid extras on', () => {
  beforeEach(() => vi.stubEnv('ENABLE_PAID_EXTRAS', 'true'))

  it('image search calls SerpAPI', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ visual_matches: [] }) })
    await searchByImage('https://signed/photo.jpg')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('background removal calls Photoroom', async () => {
    mockFetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) })
    await removeBackground('b3JpZ2luYWw=')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('tryOnEnabled', () => {
  it('is off when unset, and for anything but "true"', () => {
    vi.stubEnv('ENABLE_TRY_ON', '')
    expect(tryOnEnabled()).toBe(false)
    for (const v of ['false', '1', 'TRUE', ' true']) {
      vi.stubEnv('ENABLE_TRY_ON', v)
      expect(tryOnEnabled()).toBe(false)
    }
  })
  it('is on only for "true", and is not turned on by ENABLE_PAID_EXTRAS', () => {
    vi.stubEnv('ENABLE_TRY_ON', 'true')
    expect(tryOnEnabled()).toBe(true)
    vi.stubEnv('ENABLE_TRY_ON', '')
    vi.stubEnv('ENABLE_PAID_EXTRAS', 'true')
    expect(tryOnEnabled()).toBe(false)
  })
})

describe('with try-on on and paid extras off', () => {
  beforeEach(() => {
    vi.stubEnv('ENABLE_TRY_ON', 'true')
    vi.stubEnv('ENABLE_PAID_EXTRAS', '')
  })

  it('try-on on makes no image search or background removal call', async () => {
    expect(await searchByImage('https://signed/photo.jpg', 'shirt')).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('background removal still makes no call', async () => {
    expect(await removeBackground('b3JpZ2luYWw=')).toBe('b3JpZ2luYWw=')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('paid extras stay off', () => {
    expect(paidExtrasEnabled()).toBe(false)
  })
})
