import { describe, it, expect, vi } from 'vitest'
import {
  BAD_PHOTO, UPLOAD_FAILED, deletePhoto, firstSheetStep, loadPhotoState, loadSpendLine, recordConsent, uploadPhoto,
} from './try-on-photo-client'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const file = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], 'me.jpg', { type: 'image/jpeg' })
const ok = async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })

describe('loadPhotoState', () => {
  it('reads the photo and agreement', async () => {
    const f = vi.fn(async () => json({ image_url: 'https://x/p.jpg', consented: true }))
    expect(await loadPhotoState({ fetch: f })).toEqual({ kind: 'ready', photoUrl: 'https://x/p.jpg', consented: true })
  })
  it('is "off" when the server says 404, so the section is not shown', async () => {
    expect(await loadPhotoState({ fetch: async () => json({ code: 'FEATURE_OFF' }, 404) })).toEqual({ kind: 'off' })
  })
  it('is an error for a server error or no connection', async () => {
    expect(await loadPhotoState({ fetch: async () => json({}, 500) })).toEqual({ kind: 'error' })
    expect(await loadPhotoState({ fetch: async () => { throw new Error('offline') } })).toEqual({ kind: 'error' })
  })
})

describe('loadSpendLine', () => {
  it('words this month against the cap, to the cent', async () => {
    expect(await loadSpendLine({ fetch: async () => json({ spent_usd: 3.15, cap_usd: 7.5 }) })).toBe('US$3.15 of US$7.50')
    expect(await loadSpendLine({ fetch: async () => json({ spent_usd: 0.225, cap_usd: 7.5 }) })).toBe('US$0.23 of US$7.50')
  })
  it('is null for anyone who is not the owner', async () => {
    expect(await loadSpendLine({ fetch: async () => json({ error: 'Not found' }, 404) })).toBeNull()
    expect(await loadSpendLine({ fetch: async () => { throw new Error('offline') } })).toBeNull()
  })
})

describe('uploadPhoto', () => {
  it('shrinks the photo, then posts it as one JPEG file', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ ok: true }))
    const resize = vi.fn(ok)
    expect(await uploadPhoto(file(), { fetch: f, resize })).toEqual({ ok: true })
    expect(resize).toHaveBeenCalledOnce()
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/try-on/photo')
    expect(init?.method).toBe('POST')
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File)
  })
  it('rejects a bad try-on photo with a plain message', async () => {
    const f = vi.fn()
    expect(await uploadPhoto(file(), { fetch: f, resize: async () => { throw new Error('not an image') } })).toEqual({ ok: false, message: BAD_PHOTO })
    expect(f).not.toHaveBeenCalled()
    expect(await uploadPhoto(file(), { fetch: async () => json({ code: 'BAD_PHOTO' }, 400), resize: ok })).toEqual({ ok: false, message: BAD_PHOTO })
  })
  it('says to check the connection for a server error or no connection, never a raw error', async () => {
    expect(await uploadPhoto(file(), { fetch: async () => json({ error: 'boom' }, 500), resize: ok })).toEqual({ ok: false, message: UPLOAD_FAILED })
    expect(await uploadPhoto(file(), { fetch: async () => { throw new Error('offline') }, resize: ok })).toEqual({ ok: false, message: UPLOAD_FAILED })
  })
})

describe('agreement and delete', () => {
  it('I agree sends only the agreement, no photo', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ ok: true }))
    expect(await recordConsent({ fetch: f })).toBe(true)
    expect(f.mock.calls).toHaveLength(1)
    expect(f.mock.calls[0][1]?.method).toBe('PUT')
    expect(f.mock.calls[0][1]?.body).toBeUndefined()
    expect(await recordConsent({ fetch: async () => json({}, 500) })).toBe(false)
  })
  it('delete reports failure instead of throwing', async () => {
    expect(await deletePhoto({ fetch: async () => json({ ok: true }) })).toBe(true)
    expect(await deletePhoto({ fetch: async () => json({}, 500) })).toBe(false)
    expect(await deletePhoto({ fetch: async () => { throw new Error('offline') } })).toBe(false)
  })
  it('the privacy step shows until the person has agreed, then Add and Replace skip it', () => {
    expect(firstSheetStep(false)).toBe('privacy')
    expect(firstSheetStep(true)).toBe('pick')
  })
})
