import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'

vi.mock('@/lib/supabase/server', async () => {
  const { fake: f } = await import('@/lib/__fixtures__/try-on-fake')
  return { createServerClient: async () => f.userClient(), createServiceClient: async () => f.serviceClient() }
})

import { DELETE, GET, POST } from './route'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

function upload(opts: { consent?: boolean; type?: string; bytes?: Uint8Array } = {}) {
  const form = new FormData()
  form.set('file', new File([(opts.bytes ?? JPEG) as BlobPart], 'me.jpg', { type: opts.type ?? 'image/jpeg' }))
  if (opts.consent) form.set('consent', 'true')
  return POST(new Request('http://localhost/api/try-on/photo', { method: 'POST', body: form }))
}

beforeEach(() => {
  fake.reset()
  fake.tables.users.push({ id: A, try_on_photo_url: null, try_on_consent_at: null }, { id: B, try_on_photo_url: `${B}/photo-b.jpg`, try_on_consent_at: 'x' })
  fake.buckets['try-on-photos'].set(`${B}/photo-b.jpg`, JPEG)
  vi.stubEnv('ENABLE_TRY_ON', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('/api/try-on/photo', () => {
  it('returns 404 from every method when try-on is off', async () => {
    vi.stubEnv('ENABLE_TRY_ON', '')
    expect((await GET()).status).toBe(404)
    expect((await upload({ consent: true })).status).toBe(404)
    expect((await DELETE()).status).toBe(404)
  })

  it('refuses the first photo without consent and stores nothing', async () => {
    const res = await upload()
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('CONSENT_REQUIRED')
    expect(fake.buckets['try-on-photos'].size).toBe(1) // only B's
    expect(fake.tables.users[0].try_on_photo_url).toBeNull()
  })

  it('stores the first photo in the user\'s own folder and records consent', async () => {
    expect((await upload({ consent: true })).status).toBe(200)
    const path = fake.tables.users[0].try_on_photo_url as string
    expect(path.startsWith(`${A}/`)).toBe(true)
    expect(fake.buckets['try-on-photos'].has(path)).toBe(true)
    expect(fake.tables.users[0].try_on_consent_at).toBeTruthy()
  })

  it('replaces the photo without asking again and removes the old file', async () => {
    await upload({ consent: true })
    const first = fake.tables.users[0].try_on_photo_url as string
    expect((await upload()).status).toBe(200)
    const second = fake.tables.users[0].try_on_photo_url as string
    expect(second).not.toBe(first)
    expect(fake.buckets['try-on-photos'].has(first)).toBe(false)
    expect(fake.buckets['try-on-photos'].has(second)).toBe(true)
  })

  it('rejects files that are not a real JPEG, PNG or WebP', async () => {
    expect((await upload({ consent: true, type: 'image/gif' })).status).toBe(400)
    expect((await upload({ consent: true, bytes: new Uint8Array([1, 2, 3]), type: 'image/png' })).status).toBe(400)
    expect((await upload({ consent: true, bytes: new Uint8Array() })).status).toBe(400)
  })

  it('GET gives the person their own photo and never another person\'s', async () => {
    await upload({ consent: true })
    const mine = await (await GET()).json()
    expect(mine.image_url).toContain(`/${A}/`)
    fake.currentUser = B
    expect((await (await GET()).json()).image_url).toContain(`/${B}/`)
  })

  it('delete removes the photo and every try-on picture, and keeps the outfits', async () => {
    await upload({ consent: true })
    fake.buckets['try-on-photos'].set(`${A}/outfit-o1-x.jpg`, JPEG)
    fake.buckets['try-on-photos'].set(`${A}/outfit-orphan.jpg`, JPEG)
    fake.tables.outfits.push(
      { id: 'o1', user_id: A, name: 'Work', try_on_image_path: `${A}/outfit-o1-x.jpg`, try_on_made_at: 't' },
      { id: 'o2', user_id: B, name: 'Mine', try_on_image_path: `${B}/outfit-o2.jpg`, try_on_made_at: 't' },
    )
    fake.buckets['try-on-photos'].set(`${B}/outfit-o2.jpg`, JPEG)

    expect((await DELETE()).status).toBe(200)

    expect([...fake.buckets['try-on-photos'].keys()].filter((k) => k.startsWith(`${A}/`))).toEqual([])
    expect(fake.tables.users[0]).toMatchObject({ try_on_photo_url: null, try_on_consent_at: null })
    expect(fake.tables.outfits).toHaveLength(2)
    expect(fake.tables.outfits[0]).toMatchObject({ name: 'Work', try_on_image_path: null, try_on_made_at: null })
    // the other person's photo, picture and outfit are untouched
    expect(fake.buckets['try-on-photos'].has(`${B}/photo-b.jpg`)).toBe(true)
    expect(fake.buckets['try-on-photos'].has(`${B}/outfit-o2.jpg`)).toBe(true)
    expect(fake.tables.outfits[1].try_on_image_path).toBe(`${B}/outfit-o2.jpg`)
    expect(fake.tables.users[1].try_on_photo_url).toBe(`${B}/photo-b.jpg`)
  })

  it('delete returns 401 when signed out', async () => {
    fake.currentUser = null
    expect((await DELETE()).status).toBe(401)
  })
})
