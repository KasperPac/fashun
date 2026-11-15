import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdate = vi.fn()
const mockUpdateArgs = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ update: (u: unknown) => { mockUpdateArgs(u); return { eq: mockUpdate } } }),
  }),
}))

import { PATCH } from './route'

describe('PATCH /api/onboarding/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue({ error: null })
  })

  it('rejects empty style_prefs', async () => {
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ style_prefs: [] }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('rejects invalid budget (min >= max)', async () => {
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({
        budgets: {
          tops: [200, 50],
          bottoms: [30, 200],
          shoes: [50, 350],
          outerwear: [80, 500],
          bags: [40, 300],
          accessories: [10, 100],
        },
      }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('saves valid style prefs', async () => {
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ style_prefs: ['casual', 'minimalist'] }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
  })

  const patch = (body: unknown) =>
    PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(body) }))

  it('rejects an empty body', async () => {
    expect((await patch({})).status).toBe(400)
  })

  it('rejects an unknown season', async () => {
    expect((await patch({ colour_season: 'monsoon' })).status).toBe(400)
  })

  it('rejects invalid hair and eye colours', async () => {
    expect((await patch({ hair_colour: 'purple' })).status).toBe(400)
    expect((await patch({ eye_colour: '' })).status).toBe(400)
  })

  it('rejects too few or non-hex colours', async () => {
    expect((await patch({ best_colours: ['#FFFFFF'] })).status).toBe(400)
    expect((await patch({ avoid_colours: ['red', 'blue', 'green', 'pink'] })).status).toBe(400)
  })

  it('saves edited profile fields', async () => {
    const res = await patch({ hair_colour: 'auburn', eye_colour: 'green', skin_undertone: 'cool', skin_depth: 'deep', suggested_styles: ['glam'] })
    expect(res.status).toBe(200)
    expect(mockUpdateArgs).toHaveBeenCalledWith({
      hair_colour: 'auburn', eye_colour: 'green', skin_undertone: 'cool', skin_depth: 'deep', suggested_styles: ['glam'],
    })
  })

  it('recalculates best and avoid colours when the season changes', async () => {
    const res = await patch({ colour_season: 'winter' })
    expect(res.status).toBe(200)
    const saved = mockUpdateArgs.mock.calls[0][0]
    expect(saved.colour_season).toBe('winter')
    expect(saved.best_colours.length).toBeGreaterThanOrEqual(6)
    expect(saved.avoid_colours.length).toBeGreaterThanOrEqual(4)
    expect(saved.best_colours).toContain('#000080')
  })

  it('keeps colours the user sends together with a season change', async () => {
    const best = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']
    await patch({ colour_season: 'winter', best_colours: best })
    const saved = mockUpdateArgs.mock.calls[0][0]
    expect(saved.best_colours).toEqual(best)
    expect(saved.avoid_colours.length).toBeGreaterThanOrEqual(4)
  })

  it('returns 500 when saving fails', async () => {
    mockUpdate.mockResolvedValue({ error: { message: 'boom' } })
    expect((await patch({ hair_colour: 'black' })).status).toBe(500)
  })
})
