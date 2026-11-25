import { describe, it, expect, vi, afterEach } from 'vitest'
import { GEMINI_MODEL, geminiBaseUrl, runImageTryOn, tryOnPrompt, ImageTryOnError, ImageTryOnTimeoutError } from './image-tryon'

const img = (n: number) => ({ mediaType: 'image/jpeg', base64: `AAA${n}` })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('runImageTryOn', () => {
  it('sends the person and every garment in one request and returns the picture', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'RESULT' } }] } }] }) }))
    vi.stubGlobal('fetch', f)
    const out = await runImageTryOn({ person: img(0), garments: [{ ...img(1), kind: 'top' }, { ...img(2), kind: 'bottom' }], apiKey: 'k' })
    expect(out).toEqual({ mediaType: 'image/png', base64: 'RESULT' })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }]
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`)
    expect(init.headers['x-goog-api-key']).toBe('k')
    expect(url).not.toContain('k?')
    const parts = JSON.parse(init.body).contents[0].parts
    expect(parts.map((p: { inline_data?: { data: string } }) => p.inline_data?.data)).toEqual([undefined, 'AAA0', 'AAA1', 'AAA2'])
  })

  it('uses GEMINI_BASE_URL when set, without a trailing slash', () => {
    expect(geminiBaseUrl()).toBe('https://generativelanguage.googleapis.com')
    vi.stubEnv('GEMINI_BASE_URL', 'https://gateway.example/gemini//')
    expect(geminiBaseUrl()).toBe('https://gateway.example/gemini')
  })

  it('throws a fixed message, never the provider text, for a refusal or an answer with no picture', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'secret@example.com' } }) })))
    await expect(runImageTryOn({ person: img(0), garments: [{ ...img(1), kind: 'top' }], apiKey: 'k' })).rejects.toThrow(new ImageTryOnError('Try-on was refused'))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [] }) })))
    await expect(runImageTryOn({ person: img(0), garments: [{ ...img(1), kind: 'top' }], apiKey: 'k' })).rejects.toThrow('Try-on returned no picture')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED https://x.example') }))
    await expect(runImageTryOn({ person: img(0), garments: [{ ...img(1), kind: 'top' }], apiKey: 'k' })).rejects.toThrow('Try-on request failed')
  })

  it('gives up after the time limit with a timeout error', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_u: string, init: { signal: AbortSignal }) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))))
    const p = runImageTryOn({ person: img(0), garments: [{ ...img(1), kind: 'top' }], apiKey: 'k', timeoutMs: 1000 })
    const assertion = expect(p).rejects.toBeInstanceOf(ImageTryOnTimeoutError)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })
})

describe('tryOnPrompt', () => {
  it('keeps the face, body, pose, background and the own shoes, and names each picture by kind', () => {
    const text = tryOnPrompt(['top', 'bottom'])
    expect(text).toContain("Keep the person's face, body, pose and background exactly as they are")
    expect(text).toContain("Keep the person's own shoes exactly as they are in the first picture unless shoes are shown")
    expect(text).toContain('picture 2 is a top; picture 3 is bottoms')
  })
})
