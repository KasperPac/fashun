import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { paidExtrasEnabled } from './paid-extras'
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
