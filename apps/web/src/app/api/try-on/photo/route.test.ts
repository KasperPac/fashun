import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'

vi.mock('@/lib/supabase/server', async () => {
  const { fake: f } = await import('@/lib/__fixtures__/try-on-fake')
  return { createServerClient: async () => f.userClient(), createServiceClient: async () => f.serviceClient() }
})

import { DELETE, GET, POST, PUT } from './route'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

function upload(opts: { consent?: boolean; type?: string; bytes?: Uint8Array } = {}) {
  const form = new FormData()
  form.set('file', new File([(opts.bytes ?? JPEG) as BlobPart], 'me.jpg', { type: opts.type ?? 'image/jpeg' }))
  if (opts.consent) form.set('consent', 'true')
  return POST(new Request('http://localhost/api/try-on/photo', { method: 'POST', body: form }))
}

beforeEach(() => {
  fake.reset()
  fake.tables.users.push({ id: A, try_on_photo_url: null, try_on_consent_at: null }, { id: B, try_on_photo_url: `${B}/photo-b.jpg`, try_on_consent_at: 'x', try_on_consent_note: 'gemini-1' })
  fake.buckets['try-on-photos'].set(`${B}/photo-b.jpg`, JPEG)
  vi.stubEnv('ENABLE_TRY_ON', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('/api/try-on/photo', () => {
  it('records agreement on its own, once, with no photo stored', async () => {
    expect((await PUT()).status).toBe(200)
    const first = fake.tables.users.find((u) => u.id === A)?.try_on_consent_at
    expect(first).toBeTruthy()
    expect(fake.tables.users.find((u) => u.id === A)?.try_on_photo_url).toBeNull()
    expect(fake.buckets['try-on-photos'].size).toBe(1)
    await PUT()
    expect(fake.tables.users.find((u) => u.id === A)?.try_on_consent_at).toBe(first)
    expect((await upload()).status).toBe(200) // agreed, so no consent flag needed
  })

  it('does not record agreement for B when A agrees, and needs a sign-in', async () => {
    await PUT()
    expect(fake.tables.users.find((u) => u.id === B)?.try_on_consent_at).toBe('x')
    fake.currentUser = null
    expect((await PUT()).status).toBe(401)
  })

  it('server refuses try-on when it is switched off', async () => {
    vi.stubEnv('ENABLE_TRY_ON', '')
    expect((await PUT()).status).toBe(404)
    expect((await GET()).status).toBe(404)
    expect((await upload({ consent: true })).status).toBe(404)
    expect((await DELETE()).status).toBe(404)
  })

  it('server refuses a try-on photo without agreement', async () => {
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

  it('Replace keeps one try-on photo', async () => {
    await upload({ consent: true })
    const first = fake.tables.users[0].try_on_photo_url as string
    expect((await upload()).status).toBe(200)
    const second = fake.tables.users[0].try_on_photo_url as string
    expect(second).not.toBe(first)
    expect(fake.buckets['try-on-photos'].has(first)).toBe(false)
    expect(fake.buckets['try-on-photos'].has(second)).toBe(true)
  })

  it('rejects a bad try-on photo with a plain message', async () => {
    expect((await upload({ consent: true, type: 'image/gif' })).status).toBe(400)
    expect((await upload({ consent: true, bytes: new Uint8Array([1, 2, 3]), type: 'image/png' })).status).toBe(400)
    expect((await upload({ consent: true, bytes: new Uint8Array() })).status).toBe(400)
  })

  it('rejects a bad try-on photo with a plain message', async () => {
    const res = await upload({ consent: true, bytes: new Uint8Array([0x68, 0x69]), type: 'image/jpeg' })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('BAD_PHOTO')
    expect(fake.tables.users[0].try_on_photo_url).toBeNull()
    const big = await upload({ consent: true, bytes: new Uint8Array(10 * 1024 * 1024 + 1).fill(1).map((_, i) => (i < 3 ? [0xff, 0xd8, 0xff][i] : 1)) })
    expect(big.status).toBe(400)
    expect(fake.buckets['try-on-photos'].size).toBe(1)
  })

  it('one user can never read another\'s try-on photo or pictures', async () => {
    await upload({ consent: true })
    const mine = await (await GET()).json()
    expect(mine.image_url).toContain(`/${A}/`)
    fake.currentUser = B
    expect((await (await GET()).json()).image_url).toContain(`/${B}/`)
  })

  it('deleting the try-on photo removes every try-on picture and keeps the outfits', async () => {
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

  it('deleting the try-on photo deletes every worn photo', async () => {
    await upload({ consent: true })
    const item = (n: number) => `10000000-0000-4000-8000-00000000000${n}`
    for (const n of [1, 2, 3]) {
      fake.tables.wardrobe_items.push({ id: item(n), user_id: A, name: `Piece ${n}`, worn_photo_path: `${A}/worn-${item(n)}-x.jpg` })
      fake.buckets['try-on-photos'].set(`${A}/worn-${item(n)}-x.jpg`, JPEG)
    }
    fake.tables.wardrobe_items.push({ id: item(4), user_id: A, name: 'No photo', worn_photo_path: null })
    fake.tables.wardrobe_items.push({ id: item(5), user_id: B, name: 'Mine', worn_photo_path: `${B}/worn-${item(5)}-y.jpg` })
    fake.buckets['try-on-photos'].set(`${B}/worn-${item(5)}-y.jpg`, JPEG)

    expect((await DELETE()).status).toBe(200)

    expect([...fake.buckets['try-on-photos'].keys()].filter((k) => k.startsWith(`${A}/`))).toEqual([])
    const mine = fake.tables.wardrobe_items.filter((i) => i.user_id === A)
    expect(mine).toHaveLength(4)
    expect(mine.every((i) => i.worn_photo_path === null)).toBe(true)
    // the other person's worn photo is untouched
    expect(fake.buckets['try-on-photos'].has(`${B}/worn-${item(5)}-y.jpg`)).toBe(true)
    expect(fake.tables.wardrobe_items.find((i) => i.id === item(5))?.worn_photo_path).toBe(`${B}/worn-${item(5)}-y.jpg`)
  })

  it('delete returns 401 when signed out', async () => {
    fake.currentUser = null
    expect((await DELETE()).status).toBe(401)
  })

  it('deleted try-on files can no longer be opened', async () => {
    await upload({ consent: true })
    const path = fake.tables.users[0].try_on_photo_url as string
    await DELETE()
    expect((await (await GET()).json()).image_url).toBeNull()
    expect(fake.buckets['try-on-photos'].has(path)).toBe(false)
    const { data, error } = await fake.userClient().storage.from('try-on-photos').download(path)
    expect(data).toBeNull()
    expect(error).toBeTruthy()
  })

  it('one user can never change or use another\'s try-on photo', async () => {
    await upload({ consent: true })
    const aPath = fake.tables.users[0].try_on_photo_url as string
    fake.currentUser = B
    expect((await upload()).status).toBe(200) // B replaces B's own
    expect((await DELETE()).status).toBe(200) // B deletes B's own
    expect(fake.tables.users.find((u) => u.id === A)?.try_on_photo_url).toBe(aPath)
    expect(fake.buckets['try-on-photos'].has(aPath)).toBe(true)
    expect([...fake.buckets['try-on-photos'].keys()].filter((k) => k.startsWith(`${B}/`))).toEqual([])
  })

  it('try-on files are never public', async () => {
    await upload({ consent: true })
    fake.currentUser = null
    expect((await GET()).status).toBe(401)
    expect((await DELETE()).status).toBe(401)
    expect((await upload({ consent: true })).status).toBe(401)
    expect(fake.tables.users[0].try_on_photo_url).not.toBeNull()
  })

  it('an agreement to an earlier note does not count: the person agrees again', async () => {
    fake.tables.users[0].try_on_consent_at = '2026-11-01T00:00:00Z' // the FASHN note: no version stored
    expect((await (await GET()).json()).consented).toBe(false)
    const res = await upload()
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('CONSENT_REQUIRED')
    expect(fake.buckets['try-on-photos'].size).toBe(1) // nothing stored
    expect((await PUT()).status).toBe(200)
    expect(fake.tables.users[0]).toMatchObject({ try_on_consent_note: 'gemini-1' })
    expect((await (await GET()).json()).consented).toBe(true)
    expect((await upload()).status).toBe(200)
  })
})
