import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdate = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ update: () => ({ eq: mockUpdate }) }),
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
})
