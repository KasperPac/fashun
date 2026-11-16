import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMaybeSingle = vi.fn()
const mockEq = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => {
          mockEq(...args)
          return { maybeSingle: mockMaybeSingle }
        },
      }),
    }),
  }),
}))

import { POST } from './route'

function request(body: unknown) {
  return new Request('http://localhost/api/auth/email-status', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/email-status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 for a missing, empty or malformed email', async () => {
    for (const body of [{}, { email: '' }, { email: '   ' }, { email: 'not-an-email' }]) {
      const res = await POST(request(body))
      expect(res.status).toBe(400)
    }
    expect(mockMaybeSingle).not.toHaveBeenCalled()
  })

  it('reports a known email', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'u1' }, error: null })
    const res = await POST(request({ email: 'a@example.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ known: true })
  })

  it('reports a new email, trimmed and lower-cased before lookup', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(request({ email: '  New@Example.COM ' }))
    expect(await res.json()).toEqual({ known: false })
    expect(mockEq).toHaveBeenCalledWith('email', 'new@example.com')
  })

  it('returns 500 when the lookup fails', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'down' } })
    const res = await POST(request({ email: 'a@example.com' }))
    expect(res.status).toBe(500)
  })
})
