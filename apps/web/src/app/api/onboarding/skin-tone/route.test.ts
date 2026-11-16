import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
    ['missing depth', '{"undertone":"warm"}'],
    ['missing undertone', '{"depth":"light"}'],
    ['invalid undertone', JSON.stringify({ undertone: 'purple', depth: 'light', hairColour: 'blonde', eyeColour: 'blue', suggestedStyles: ['casual'] })],
  ])('returns 422 and saves nothing for a malformed response (%s)', async (_n, text) => {
    modelReplies(text)
    const res = await request()
    expect(res.status).toBe(422)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('forgives a minor mismatch: variants, unknown hair/eye, odd styles', async () => {
    modelReplies(JSON.stringify({
      undertone: 'Warm', depth: 'light', hairColour: 'Dark Brown', eyeColour: 'violet',
      suggestedStyles: ['smart casual', 'goth', 'casual', 'business', 'glam', 'streetwear'],
    }))
    const res = await request()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ hairColour: 'dark-brown', eyeColour: null, suggestedStyles: ['smart-casual', 'casual', 'business', 'glam'] })
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ hair_colour: 'dark-brown', eye_colour: null })
  })

  it('saves an empty style list rather than failing', async () => {
    modelReplies(JSON.stringify({ undertone: 'warm', depth: 'light', hairColour: 'blonde', eyeColour: 'blue', suggestedStyles: [] }))
    expect((await request()).status).toBe(200)
    expect(mockUpdate.mock.calls[0][0].suggested_styles).toEqual([])
  })

  it('returns 422 for a non-text model response', async () => {
    mockCreate.mockResolvedValue({ content: [] })
    expect((await request()).status).toBe(422)
  })

  describe('logging', () => {
    const logged = () => vi.mocked(console.error).mock.calls.map((c) => c.join(' '))
    beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
    afterEach(() => vi.restoreAllMocks())

    it('returns 502 and logs status and type when the AI call fails', async () => {
      const err = Object.assign(new Error('invalid x-api-key sk-ant-secret ' + IMAGE), {
        status: 401, error: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
      })
      mockCreate.mockRejectedValue(err)
      expect((await request()).status).toBe(502)
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(logged()).toEqual(['skin-tone: anthropic 401 authentication_error'])
    })

    it('returns 502 for a network-style failure and logs only the error name', async () => {
      mockCreate.mockRejectedValue(new Error('down'))
      expect((await request()).status).toBe(502)
      expect(logged()).toEqual(['skin-tone: error Error'])
    })

    it('returns 500 when saving fails and logs the code only', async () => {
      modelReplies(GOOD)
      mockEq.mockResolvedValue({ error: { message: 'violates check for user-1', code: '23514' } })
      expect((await request()).status).toBe(500)
      expect(logged()).toEqual(['skin-tone: save failed 23514'])
    })

    it('logs the failing field on a 422 and never the model text or image', async () => {
      const secret = 'SECRET-MODEL-TEXT'
      modelReplies(`{"undertone":"${secret}","depth":"light","note":"${IMAGE}"}`)
      expect((await request()).status).toBe(422)
      expect(logged()).toEqual(['skin-tone: parse failed: undertone'])
      expect(logged().join('')).not.toContain(secret)
      expect(logged().join('')).not.toContain(IMAGE)
    })

    it('logs no JSON in reply', async () => {
      modelReplies('sorry, I cannot do that')
      await request()
      expect(logged()).toEqual(['skin-tone: no JSON in reply'])
    })

    it('logs which fields were dropped', async () => {
      modelReplies(JSON.stringify({ undertone: 'warm', depth: 'light', hairColour: 'purple', eyeColour: 'blue', suggestedStyles: ['casual'] }))
      expect((await request()).status).toBe(200)
      expect(logged()).toEqual(['skin-tone: dropped: hairColour'])
    })
  })
})
