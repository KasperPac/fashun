import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ user: 'A' as string | null, rows: [] as Row[] }))
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'

// The fake applies no row-level security: the route's own user_id filter is what these tests prove.
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user ? { id: db.user } : null } }) },
    from: () => {
      let rows = db.rows
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return chain }
      chain.order = () => chain
      chain.limit = () => Promise.resolve({ data: rows, error: null })
      return chain
    },
  }),
}))

import { GET } from './route'

const A_PHOTO = 'https://encrypted-tbn0.gstatic.com/images?q=a-secret'
const get = (u: string, q = 'occasion=work&category=shoes') => GET(new Request(`http://localhost/api/gaps/photo?${q}&u=${encodeURIComponent(u)}`))
const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })

beforeEach(() => {
  vi.stubEnv('ENABLE_GAP_SUGGESTIONS', 'true')
  vi.stubEnv('GAP_SEARCH_FIXTURES', '')
  db.user = A
  db.rows = [{ user_id: A, occasion: 'work', category: 'shoes', day: '2026-11-18', items: [{ title: 'x', imageUrl: A_PHOTO }] }]
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('gap photo route', () => {
  it('returns the photo of a stored suggestion', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(png())
    const res = await get(A_PHOTO)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(spy).toHaveBeenCalledWith(A_PHOTO, expect.objectContaining({ redirect: 'error' }))
  })

  it('refuses an address that is not in the caller\'s stored suggestions, and fetches nothing', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(png())
    expect((await get('https://evil.example/x.png')).status).toBe(404)
    expect((await get('http://169.254.169.254/latest')).status).toBe(404)
    expect(spy).not.toHaveBeenCalled()
  })

  it('one user cannot fetch another user\'s photo', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(png())
    db.user = B
    expect((await get(A_PHOTO)).status).toBe(404)
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses signed-out requests', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(png())
    db.user = null
    expect((await get(A_PHOTO)).status).toBe(401)
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses a stored address that is private, not https, or not an image', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    expect((await get(A_PHOTO)).status).toBe(404)
    for (const bad of ['http://img.example/a.png', 'https://10.0.0.1/a.png']) {
      db.rows = [{ user_id: A, occasion: 'work', category: 'shoes', day: '2026-11-18', items: [{ imageUrl: bad }] }]
      spy.mockClear()
      expect((await get(bad)).status).toBe(404)
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('answers 404 when the switch is off and 400 for a bad gap', async () => {
    vi.stubEnv('ENABLE_GAP_SUGGESTIONS', '')
    expect((await get(A_PHOTO)).status).toBe(404)
    vi.stubEnv('ENABLE_GAP_SUGGESTIONS', 'true')
    expect((await get(A_PHOTO, 'occasion=party&category=shoes')).status).toBe(400)
  })

  it('serves a local stand-in in fixture mode without fetching anything', async () => {
    vi.stubEnv('GAP_SEARCH_FIXTURES', '1')
    const spy = vi.spyOn(globalThis, 'fetch')
    const res = await get(A_PHOTO)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(spy).not.toHaveBeenCalled()
  })
})
