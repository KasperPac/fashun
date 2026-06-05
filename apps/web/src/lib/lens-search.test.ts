import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchByImage } from './lens-search'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubEnv('SERPAPI_API_KEY', 'test-key')
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const lensResponse = {
  visual_matches: [
    { position: 1, title: 'Nike Air Force 1 White', link: 'https://www.theiconic.com.au/af1', source: 'THE ICONIC', thumbnail: 'https://serpapi-cdn/af1.jpg', price: { extracted_value: 149.95, currency: 'AUD' } },
    { position: 2, title: 'Nike Dunk Low', link: 'https://www.footlocker.com.au/dunk', source: 'Foot Locker', thumbnail: 'https://serpapi-cdn/dunk.jpg' },
    { position: 3, title: 'No thumb', link: 'https://x.com/p', source: 'X' }, // dropped (no thumbnail)
    { position: 4, title: 'Fourth', link: 'https://x.com/q', source: 'X', thumbnail: 'https://serpapi-cdn/4.jpg' },
  ],
}

describe('searchByImage', () => {
  it('maps the top 3 thumbnailed visual matches to candidates', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => lensResponse })
    const out = await searchByImage('https://signed/photo.jpg')
    expect(out).toHaveLength(2) // slice(0,3) then filter-by-thumbnail drops #3; #4 never reached
    expect(out[0]).toEqual({ url: 'https://www.theiconic.com.au/af1', title: 'Nike Air Force 1 White', imageUrl: 'https://serpapi-cdn/af1.jpg', retailer: 'THE ICONIC', price: 149.95 })
    expect(out[1].price).toBeUndefined()
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('engine=google_lens')
    expect(calledUrl).toContain(encodeURIComponent('https://signed/photo.jpg'))
  })

  it('returns [] when SERPAPI_API_KEY is missing', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '')
    expect(await searchByImage('https://signed/photo.jpg')).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns [] on a non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) })
    expect(await searchByImage('https://signed/photo.jpg')).toEqual([])
  })

  it('returns [] when there are no visual matches', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ visual_matches: [] }) })
    expect(await searchByImage('https://signed/photo.jpg')).toEqual([])
  })

  it('returns [] when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network'))
    expect(await searchByImage('https://signed/photo.jpg')).toEqual([])
  })
})
