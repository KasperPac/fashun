import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PICTURE_TIMEOUT_MS, checkPicture, createRunner, loadPanel, makePicture, progressLines, reloadPicture, whenOnline, type PanelApi } from './try-on-panel-client'

const json = (body: unknown, status = 200) => ({ ok: status < 200 || status >= 300 ? false : true, status, json: async () => body }) as Response
const PICTURE = { image_url: 'https://signed/new.jpg', made_at: '2026-11-17T02:00:00Z' }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('loadPanel', () => {
  it('is off when try-on is switched off (the panel is then hidden)', async () => {
    const api: PanelApi = { fetch: vi.fn(async () => json({ error: 'off' }, 404)) }
    expect(await loadPanel(api, 'o1', 1)).toEqual({ kind: 'off' })
  })

  it('without a try-on photo it asks for none of the outfit data', async () => {
    const fetchMock = vi.fn(async () => json({ image_url: null, consented: false }))
    expect(await loadPanel({ fetch: fetchMock }, 'o1', 1)).toMatchObject({ kind: 'ready', hasPhoto: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks whether this outfit would fit under the cap with its image count', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith('/api/try-on/photo') ? json({ image_url: 'https://p', consented: true }) : json({ ...PICTURE, paused: true, resume_on: '2026-12-01' }))
    const state = await loadPanel({ fetch: fetchMock }, 'o1', 2)
    expect(fetchMock).toHaveBeenCalledWith('/api/outfits/try-on?outfit_id=o1&images=2')
    expect(state).toMatchObject({ kind: 'ready', hasPhoto: true, paused: true, resumeOn: '2026-12-01', picture: { url: 'https://signed/new.jpg' } })
  })

  it('shows an error state when it cannot load', async () => {
    expect(await loadPanel({ fetch: async () => { throw new Error('offline') } }, 'o1', 1)).toEqual({ kind: 'error' })
  })
})

describe('makePicture', () => {
  it('returns the picture, the paused answer, or the failure', async () => {
    expect(await makePicture({ fetch: async () => json(PICTURE) }, 'o1', { regenerate: false, previousMadeAt: null })).toMatchObject({ kind: 'picture' })
    expect(await makePicture({ fetch: async () => json({ code: 'CAP_REACHED', resume_on: '2026-12-01' }, 409) }, 'o1', { regenerate: false, previousMadeAt: null }))
      .toEqual({ kind: 'paused', resumeOn: '2026-12-01' })
    expect(await makePicture({ fetch: async () => json({ code: 'CONSENT_REQUIRED' }, 400) }, 'o1', { regenerate: false, previousMadeAt: null })).toEqual({ kind: 'consent' })
    expect(await makePicture({ fetch: async () => json({ code: 'TRY_ON_FAILED' }, 502) }, 'o1', { regenerate: false, previousMadeAt: null })).toEqual({ kind: 'failed' })
  })

  it('connection lost during try-on never double charges', async () => {
    // The tap sends one POST. The connection drops; the app only looks (GET) and never sends a second POST.
    const calls: string[] = []
    const api: PanelApi = {
      fetch: vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        if (init?.method === 'POST') throw new TypeError('network lost')
        return json(PICTURE) // the server finished and saved while the phone was offline
      }),
    }
    const finished = await makePicture(api, 'o1', { regenerate: false, previousMadeAt: null })
    expect(finished).toMatchObject({ kind: 'picture', picture: { url: 'https://signed/new.jpg' } })
    expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(1)

    // Not finished (still the old picture, or none): the person sees the failure message, never a blank screen.
    const notFinished: PanelApi = { fetch: async (_u, init) => { if (init?.method === 'POST') throw new TypeError('lost'); return json({ image_url: null }) } }
    expect(await makePicture(notFinished, 'o1', { regenerate: false, previousMadeAt: null })).toEqual({ kind: 'lost' })
    const sameOld: PanelApi = { fetch: async (_u, init) => { if (init?.method === 'POST') throw new TypeError('lost'); return json(PICTURE) } }
    expect(await makePicture(sameOld, 'o1', { regenerate: true, previousMadeAt: PICTURE.made_at })).toEqual({ kind: 'lost' })
    const offlineForGood: PanelApi = { fetch: async () => { throw new TypeError('lost') } }
    expect(await makePicture(offlineForGood, 'o1', { regenerate: false, previousMadeAt: null })).toEqual({ kind: 'lost' })
  })

  it('gives up at 90 seconds and says the connection was lost, not that nothing was charged', async () => {
    const api: PanelApi = {
      fetch: (_url, init) => new Promise<Response>((_res, rej) => {
        if (init?.method === 'POST') init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
        else rej(new TypeError('still offline'))
      }),
    }
    const done = makePicture(api, 'o1', { regenerate: false, previousMadeAt: null })
    await vi.advanceTimersByTimeAsync(PICTURE_TIMEOUT_MS)
    expect(await done).toEqual({ kind: 'lost' })
  })

  it('a server answer that says it failed is still "failed" (nothing charged)', async () => {
    expect(await makePicture({ fetch: async () => json({ code: 'TRY_ON_FAILED' }, 502) }, 'o1', { regenerate: true, previousMadeAt: null })).toEqual({ kind: 'failed' })
  })
})

describe('checkPicture', () => {
  it('finds a newer picture, none, or cannot reach the server; only ever a GET', async () => {
    const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => { void args; return json(PICTURE) })
    expect(await checkPicture({ fetch: fetchMock }, 'o1', null)).toMatchObject({ kind: 'picture' })
    expect(fetchMock.mock.calls.every((c) => c[1] === undefined)).toBe(true)
    expect(await checkPicture({ fetch: async () => json(PICTURE) }, 'o1', PICTURE.made_at)).toEqual({ kind: 'none' })
    expect(await checkPicture({ fetch: async () => json({ image_url: null }) }, 'o1', null)).toEqual({ kind: 'none' })
    expect(await checkPicture({ fetch: async () => { throw new TypeError('offline') } }, 'o1', null)).toEqual({ kind: 'unreachable' })
    expect(await checkPicture({ fetch: async () => json({}, 500) }, 'o1', null)).toEqual({ kind: 'unreachable' })
  })
})

describe('reloadPicture and whenOnline', () => {
  it('picture image failed to load: reloads the saved picture with a free GET and never a POST', async () => {
    const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => { void args; return json(PICTURE) })
    expect(await reloadPicture({ fetch: fetchMock }, 'o1')).toEqual({ url: PICTURE.image_url, madeAt: PICTURE.made_at })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toBeUndefined()
    expect(await reloadPicture({ fetch: async () => { throw new TypeError('offline') } }, 'o1')).toBeNull()
    expect(await reloadPicture({ fetch: async () => json({ image_url: null }) }, 'o1')).toBeNull()
  })

  it('reloads on online, and stops listening when told to', () => {
    const target = new EventTarget()
    const handler = vi.fn()
    const stop = whenOnline(handler, target)
    target.dispatchEvent(new Event('online'))
    expect(handler).toHaveBeenCalledTimes(1)
    stop()
    target.dispatchEvent(new Event('online'))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('createRunner', () => {
  it('a double tap makes and charges one picture', async () => {
    let release: (r: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { release = res }))
    const runner = createRunner({ fetch: fetchMock })
    const first = runner.start('o1', { regenerate: false, previousMadeAt: null })
    const second = runner.start('o1', { regenerate: false, previousMadeAt: null })
    expect(first).not.toBeNull()
    expect(second).toBeNull()
    release(json(PICTURE))
    await first
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Once it has finished, the next tap works again.
    const again = runner.start('o1', { regenerate: true, previousMadeAt: PICTURE.made_at })
    expect(again).not.toBeNull()
    release(json(PICTURE))
    await again
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('progressLines', () => {
  it('moves from step 1 to step 2 and adds the still-working line after 30 seconds', () => {
    expect(progressLines(2, 0).status).toBe('Putting on your top… (1 of 2)')
    expect(progressLines(2, 20_000)).toEqual({ status: 'Adding your bottoms… (2 of 2)', stillWorking: false })
    expect(progressLines(2, 30_000).stillWorking).toBe(true)
    expect(progressLines(1, 40_000)).toEqual({ status: 'Putting it on you…', stillWorking: true })
  })
})
