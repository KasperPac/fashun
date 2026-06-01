import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })

const mockItem = { id: 'item-1', name: 'Slim Fit Chinos', category: 'bottoms', colours: ['#8B7355'], image_url: 'https://cdn.example.com/chinos.jpg' }
const mockProfile = { colour_season: 'autumn' }
const mockWardrobe = [
  { id: 'item-2', name: 'White Oxford', category: 'tops', colours: ['#F5F5F0'] },
]

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'neq', 'order']
  for (const m of methods) chain[m] = () => makeChain(result)
  chain['single'] = () => Promise.resolve(result)
  chain['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  chain['catch'] = (reject: (v: unknown) => unknown) => Promise.resolve(result).catch(reject)
  return chain
}

let wardrobeItemsResult: unknown = { data: mockItem, error: null }
let wardrobeCallCount = 0

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'wardrobe_items') {
        wardrobeCallCount++
        return wardrobeCallCount === 1
          ? makeChain(wardrobeItemsResult)
          : makeChain({ data: mockWardrobe, error: null })
      }
      if (table === 'users') return makeChain({ data: mockProfile, error: null })
      return makeChain({ data: mockWardrobe, error: null })
    },
  }),
}))

const mockSuggestions = [
  { name: 'Smart Casual', occasion: 'Weekend brunch', pieces: [{ label: 'Rust shirt', colour_hex: '#B7410E', item_id: null, in_wardrobe: false }], description: 'A relaxed look.' },
  { name: 'Office Look', occasion: 'Work meeting', pieces: [{ label: 'White Oxford', colour_hex: '#F5F5F0', item_id: 'item-2', in_wardrobe: true }], description: 'Polished and clean.' },
  { name: 'Evening Out', occasion: 'Dinner', pieces: [{ label: 'Black crew neck', colour_hex: '#111111', item_id: null, in_wardrobe: false }], description: 'Minimal and sharp.' },
]

const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: JSON.stringify(mockSuggestions) }],
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { POST } from './route'

describe('POST /api/outfits/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    wardrobeItemsResult = { data: mockItem, error: null }
    wardrobeCallCount = 0
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockSuggestions) }],
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const req = new Request('http://localhost/api/outfits/generate', {
      method: 'POST',
      body: JSON.stringify({ item_id: 'item-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid item_id', async () => {
    const req = new Request('http://localhost/api/outfits/generate', {
      method: 'POST',
      body: JSON.stringify({ item_id: 'not-a-uuid' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when item_id is missing', async () => {
    const req = new Request('http://localhost/api/outfits/generate', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when item not found', async () => {
    wardrobeItemsResult = { data: null, error: null }
    const req = new Request('http://localhost/api/outfits/generate', {
      method: 'POST',
      body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns suggestions on success', async () => {
    const req = new Request('http://localhost/api/outfits/generate', {
      method: 'POST',
      body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.suggestions).toHaveLength(3)
    expect(json.suggestions[0].name).toBe('Smart Casual')
  })

  it('returns 500 when Claude returns invalid JSON twice', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json {{' }],
    })
    const req = new Request('http://localhost/api/outfits/generate', {
      method: 'POST',
      body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
    expect(mockCreate).toHaveBeenCalledTimes(2) // retried once
  })
})
