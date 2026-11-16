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
import { selfieFailureMessage, PHOTO_PROBLEM_MESSAGE, SERVICE_PROBLEM_MESSAGE } from '@/lib/selfie-messages'

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

    // Tests named in docs/test-scripts/KAS-174.md (sections B and C)
    const SERVICE_FAILURES: Array<[string, number, string]> = [
      ['bad key', 401, 'authentication_error'],
      ['no credit', 400, 'invalid_request_error'],
      ['rejected request', 403, 'permission_error'],
      ['rate limited', 429, 'rate_limit_error'],
      ['overloaded', 529, 'overloaded_error'],
    ]
    const apiError = (status: number, type: string) =>
      Object.assign(new Error('secret text ' + IMAGE), { status, error: { type: 'error', error: { type, message: 'secret text' } } })

    it('service failure shows the service message', async () => {
      for (const [, status, type] of SERVICE_FAILURES) {
        mockCreate.mockRejectedValue(apiError(status, type))
        const res = await request()
        expect(res.status).toBe(502)
        expect(selfieFailureMessage(res.status)).toBe(SERVICE_PROBLEM_MESSAGE)
      }
      mockCreate.mockRejectedValue(new Error('timed out'))
      expect((await request()).status).toBe(502)
    })

    it('save failure shows the service message', async () => {
      modelReplies(GOOD)
      mockEq.mockResolvedValue({ error: { message: 'x', code: '23514' } })
      const res = await request()
      expect(res.status).toBe(500)
      expect(selfieFailureMessage(res.status)).toBe(SERVICE_PROBLEM_MESSAGE)
    })

    it('unreadable photo shows the photo message', async () => {
      for (const text of ['', 'sorry, I cannot do that', '{"undertone":"purple","depth":"light"}', '{"undertone":"warm"}']) {
        modelReplies(text)
        const res = await request()
        expect(res.status).toBe(422)
        expect(selfieFailureMessage(res.status)).toBe(PHOTO_PROBLEM_MESSAGE)
      }
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('rejected upload shows the photo message and logs a reason', async () => {
      const bad: unknown[] = [{}, { imageBase64: '' }, { imageBase64: 'short' }, { imageBase64: 12345 }, { imageBase64: null }]
      for (const body of bad) {
        vi.mocked(console.error).mockClear()
        const res = await request(body)
        expect(res.status).toBe(400)
        expect(selfieFailureMessage(res.status)).toBe(PHOTO_PROBLEM_MESSAGE)
        expect(logged()).toEqual(['skin-tone: bad request'])
      }
      // An unreadable request body is rejected the same way.
      vi.mocked(console.error).mockClear()
      const res = await POST(new Request('http://localhost', { method: 'POST', body: 'not json' }))
      expect(res.status).toBe(400)
      expect(logged()).toEqual(['skin-tone: bad request'])
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('a rejected upload logs no photo, model text or personal data', async () => {
      const email = 'test.person@example.com'
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email } } })
      await request({ imageBase64: 'SECRET-PHOTO', note: email })
      expect(logged()).toEqual(['skin-tone: bad request'])
      for (const forbidden of ['SECRET-PHOTO', email, 'user-1']) expect(logged().join('')).not.toContain(forbidden)
    })

    it('fails cleanly on an unreadable answer', async () => {
      for (const text of ['', 'plain sentences only', '{"undertone": "warm", "depth": "li']) {
        modelReplies(text)
        expect((await request()).status).toBe(422)
      }
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('logs a reason on every failure path', async () => {
      const expectOneLine = async (setup: () => void, line: string) => {
        vi.mocked(console.error).mockClear()
        mockEq.mockResolvedValue({ error: null })
        setup()
        await request(line === 'skin-tone: bad request' ? {} : undefined)
        expect(logged()).toEqual([line])
      }
      await expectOneLine(() => mockGetUser.mockResolvedValueOnce({ data: { user: null } }), 'skin-tone: not signed in')
      await expectOneLine(() => {}, 'skin-tone: bad request')
      for (const [, status, type] of SERVICE_FAILURES) {
        await expectOneLine(() => mockCreate.mockRejectedValue(apiError(status, type)), `skin-tone: anthropic ${status} ${type}`)
      }
      await expectOneLine(() => mockCreate.mockResolvedValue({ content: [] }), 'skin-tone: no text in reply')
      await expectOneLine(() => modelReplies('plain sentences'), 'skin-tone: no JSON in reply')
      await expectOneLine(() => modelReplies('{"depth":"light"}'), 'skin-tone: parse failed: undertone')
      await expectOneLine(() => modelReplies('{"undertone":"warm"}'), 'skin-tone: parse failed: depth')
      await expectOneLine(() => { modelReplies(GOOD); mockEq.mockResolvedValue({ error: { message: 'x', code: '23514' } }) }, 'skin-tone: save failed 23514')
    })

    it('dropped field logs no model text', async () => {
      modelReplies(JSON.stringify({ undertone: 'warm', depth: 'light', hairColour: 'SECRET-HAIR', eyeColour: 'SECRET-EYE', suggestedStyles: ['SECRET-STYLE'] }))
      expect((await request()).status).toBe(200)
      expect(logged()).toEqual(['skin-tone: dropped: hairColour', 'skin-tone: dropped: eyeColour', 'skin-tone: dropped: suggestedStyles'])
      expect(logged().join('')).not.toContain('SECRET')
    })

    it('failure logs contain no photo, model text or personal data', async () => {
      const email = 'test.person@example.com'
      const name = 'Testy McTestface'
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email, user_metadata: { full_name: name } } } })
      const runs: Array<() => void> = [
        () => mockCreate.mockRejectedValue(Object.assign(new Error(`${email} ${name} ${IMAGE}`), { status: 400, error: { error: { type: 'invalid_request_error', message: `${email} ${IMAGE}` } } })),
        () => mockCreate.mockRejectedValue(new TypeError(`fetch failed ${email} ${name}`)),
        () => modelReplies(`{"undertone":"MODEL-TEXT ${email} ${name}","depth":"light"}`),
        () => modelReplies(`MODEL-TEXT ${email} ${name} ${IMAGE}`),
        () => { modelReplies(GOOD); mockEq.mockResolvedValue({ error: { message: `${email} ${name}`, code: '23514' } }) },
      ]
      for (const run of runs) {
        mockEq.mockResolvedValue({ error: null })
        run()
        await request()
      }
      expect(logged().length).toBe(runs.length)
      const all = logged().join('\n')
      for (const forbidden of [email, name, 'MODEL-TEXT', IMAGE, 'user-1']) expect(all).not.toContain(forbidden)
    })
  })
})
