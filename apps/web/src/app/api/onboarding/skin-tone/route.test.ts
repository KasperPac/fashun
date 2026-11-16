import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } },
}))

const mockGetUser = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockUpload = vi.fn()
const mockInsert = vi.fn()
const mockFrom = vi.fn()
const mockStorageFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    storage: { from: mockStorageFrom },
  }),
}))

import { POST } from './route'

const IMAGE = 'A'.repeat(200)

function modelReplies(text: string) {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text }] })
}
function request(body: unknown = { imageBase64: IMAGE }) {
  return POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }))
}

const GOOD = JSON.stringify({
  undertone: 'warm', depth: 'light', hairColour: 'blonde', eyeColour: 'blue',
  suggestedStyles: ['casual', 'minimalist'],
})

describe('POST /api/onboarding/skin-tone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ update: mockUpdate, insert: mockInsert })
    mockStorageFrom.mockReturnValue({ upload: mockUpload })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await request()).status).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects a missing image', async () => {
    expect((await request({})).status).toBe(400)
  })

  it('returns the full colour profile', async () => {
    modelReplies(GOOD)
    const res = await request()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({
      undertone: 'warm', depth: 'light', hairColour: 'blonde', eyeColour: 'blue',
      season: 'spring', suggestedStyles: ['casual', 'minimalist'],
    })
    expect(json.bestColours.length).toBeGreaterThanOrEqual(6)
    expect(json.avoidColours.length).toBeGreaterThanOrEqual(4)
  })

  it('accepts JSON wrapped in code fences', async () => {
    modelReplies('```json\n' + GOOD + '\n```')
    expect((await request()).status).toBe(200)
  })

  it('saves only derived results, never the selfie', async () => {
    modelReplies(GOOD)
    await request()
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1')
    const saved = mockUpdate.mock.calls[0][0]
    expect(Object.keys(saved).sort()).toEqual([
      'avoid_colours', 'best_colours', 'colour_season', 'eye_colour', 'hair_colour',
      'skin_depth', 'skin_undertone', 'suggested_styles',
    ])
    expect(JSON.stringify(saved)).not.toContain(IMAGE)
    expect(mockStorageFrom).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it.each([
    ['not JSON', 'sorry, I cannot do that'],
    ['broken JSON', '{"undertone": "warm", '],
    ['missing fields', '{"undertone":"warm","depth":"light"}'],
    ['invalid values', JSON.stringify({ undertone: 'purple', depth: 'light', hairColour: 'blonde', eyeColour: 'blue', suggestedStyles: ['casual'] })],
    ['no styles', JSON.stringify({ undertone: 'warm', depth: 'light', hairColour: 'blonde', eyeColour: 'blue', suggestedStyles: [] })],
  ])('returns 422 and saves nothing for a malformed response (%s)', async (_n, text) => {
    modelReplies(text)
    const res = await request()
    expect(res.status).toBe(422)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 422 for a non-text model response', async () => {
    mockCreate.mockResolvedValue({ content: [] })
    expect((await request()).status).toBe(422)
  })

  it('returns 502 when the AI call fails', async () => {
    mockCreate.mockRejectedValue(new Error('down'))
    expect((await request()).status).toBe(502)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 500 when saving fails', async () => {
    modelReplies(GOOD)
    mockEq.mockResolvedValue({ error: { message: 'boom' } })
    expect((await request()).status).toBe(500)
  })
})
