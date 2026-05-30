import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase — note createServerClient is now async in Next.js 16
const mockSingle = vi.fn()
const mockUpdate = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    from: (_table: string) => ({
      select: () => ({ eq: () => ({ single: mockSingle }) }),
      update: () => ({ eq: () => mockUpdate() }),
    }),
  }),
}))

import { POST } from './route'

describe('POST /api/auth/invite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 if code is missing', async () => {
    const req = new Request('http://localhost/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 if code does not exist', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const req = new Request('http://localhost/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify({ code: 'INVALID' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns 409 if code already used', async () => {
    mockSingle.mockResolvedValue({
      data: { id: '1', code: 'USED', used_by: 'some-user-id', used_at: new Date().toISOString() },
      error: null,
    })
    const req = new Request('http://localhost/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify({ code: 'USED' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(409)
  })

  it('returns 200 for valid unused code', async () => {
    mockSingle.mockResolvedValue({
      data: { id: '1', code: 'VALID', used_by: null, used_at: null },
      error: null,
    })
    const req = new Request('http://localhost/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify({ code: 'VALID' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
