import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'

vi.mock('@/lib/supabase/server', async () => {
  const { fake: f } = await import('@/lib/__fixtures__/try-on-fake')
  return { createServerClient: async () => f.userClient(), createServiceClient: async () => f.serviceClient() }
})

import { DELETE, GET, POST } from './route'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const ITEM_A = '10000000-0000-4000-8000-000000000001'
const ITEM_B = '10000000-0000-4000-8000-0000000000b1'
const BUCKET = () => fake.buckets['try-on-photos']

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const url = (id: string) => `http://localhost/api/wardrobe/${id}/worn-photo`

function upload(id: string, opts: { type?: string; bytes?: Uint8Array } = {}) {
  const form = new FormData()
  form.set('file', new File([(opts.bytes ?? JPEG) as BlobPart], 'worn.jpg', { type: opts.type ?? 'image/jpeg' }))
  return POST(new Request(url(id), { method: 'POST', body: form }), ctx(id))
}
const get = (id: string) => GET(new Request(url(id)), ctx(id))
const del = (id: string) => DELETE(new Request(url(id), { method: 'DELETE' }), ctx(id))
const item = (id: string) => fake.tables.wardrobe_items.find((i) => i.id === id)

beforeEach(() => {
  fake.reset()
  fake.tables.users.push(
    { id: A, try_on_consent_at: 'x', try_on_consent_note: 'gemini-1' },
    { id: B, try_on_consent_at: 'x', try_on_consent_note: 'gemini-1' },
  )
  fake.tables.wardrobe_items.push(
    { id: ITEM_A, user_id: A, worn_photo_path: null },
    { id: ITEM_B, user_id: B, worn_photo_path: `${B}/worn-${ITEM_B}-b.jpg` },
  )
  BUCKET().set(`${B}/worn-${ITEM_B}-b.jpg`, JPEG)
  vi.stubEnv('ENABLE_TRY_ON', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('/api/wardrobe/[id]/worn-photo', () => {
  it('worn photo can be added replaced and deleted on an item', async () => {
    expect((await get(ITEM_A).then((r) => r.json())).image_url).toBeNull()

    expect((await upload(ITEM_A)).status).toBe(200)
    const first = item(ITEM_A)?.worn_photo_path as string
    expect(first).toMatch(new RegExp(`^${A}/worn-${ITEM_A}-[0-9a-f-]{36}\\.jpg$`))
    expect(BUCKET().has(first)).toBe(true)
    expect((await get(ITEM_A).then((r) => r.json())).image_url).toContain(first)

    expect((await upload(ITEM_A)).status).toBe(200)
    const second = item(ITEM_A)?.worn_photo_path as string
    expect(second).not.toBe(first)
    expect(BUCKET().has(first)).toBe(false)
    expect(BUCKET().has(second)).toBe(true)
    expect([...BUCKET().keys()].filter((k) => k.startsWith(`${A}/`))).toEqual([second])

    expect((await del(ITEM_A)).status).toBe(200)
    expect(BUCKET().has(second)).toBe(false)
    expect(item(ITEM_A)?.worn_photo_path).toBeNull()
    expect((await get(ITEM_A).then((r) => r.json())).image_url).toBeNull()
  })

  it('worn photo needs try-on agreement first', async () => {
    fake.tables.users[0].try_on_consent_at = null
    const res = await upload(ITEM_A)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('CONSENT_REQUIRED')
    expect(item(ITEM_A)?.worn_photo_path).toBeNull()
    expect([...BUCKET().keys()].filter((k) => k.startsWith(`${A}/`))).toEqual([])
    // agreeing to an older privacy note doesn't count either
    fake.tables.users[0].try_on_consent_at = 'x'
    fake.tables.users[0].try_on_consent_note = null
    expect((await upload(ITEM_A)).status).toBe(400)
    expect((await get(ITEM_A).then((r) => r.json())).consented).toBe(false)
  })

  it('another account cannot see or change a worn photo', async () => {
    await upload(ITEM_A)
    const path = item(ITEM_A)?.worn_photo_path as string
    fake.currentUser = B
    expect((await get(ITEM_A)).status).toBe(404)
    expect((await upload(ITEM_A)).status).toBe(404)
    expect((await del(ITEM_A)).status).toBe(404)
    expect(item(ITEM_A)?.worn_photo_path).toBe(path)
    expect(BUCKET().has(path)).toBe(true)
    // the stored address doesn't open for B either
    const { data, error } = await fake.userClient().storage.from('try-on-photos').createSignedUrl(path, 60)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    // and A can't touch B's
    fake.currentUser = A
    expect((await get(ITEM_B)).status).toBe(404)
    expect((await upload(ITEM_B)).status).toBe(404)
    expect((await del(ITEM_B)).status).toBe(404)
    expect(item(ITEM_B)?.worn_photo_path).toBe(`${B}/worn-${ITEM_B}-b.jpg`)
    expect(BUCKET().has(`${B}/worn-${ITEM_B}-b.jpg`)).toBe(true)
    // signed out
    fake.currentUser = null
    expect((await get(ITEM_A)).status).toBe(401)
    expect((await upload(ITEM_A)).status).toBe(401)
    expect((await del(ITEM_A)).status).toBe(401)
  })

  it('bad worn photo is refused with a plain message', async () => {
    for (const bad of [
      { type: 'image/gif' },
      { bytes: new Uint8Array([0x68, 0x69]), type: 'image/jpeg' },
      { bytes: new Uint8Array() },
      { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), type: 'image/png' },
    ]) {
      const res = await upload(ITEM_A, bad)
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('BAD_PHOTO')
    }
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set([0xff, 0xd8, 0xff])
    expect((await upload(ITEM_A, { bytes: big })).status).toBe(400)
    expect(await POST(new Request(url(ITEM_A), { method: 'POST', body: new FormData() }), ctx(ITEM_A)).then((r) => r.status)).toBe(400)
    expect(item(ITEM_A)?.worn_photo_path).toBeNull()
    expect([...BUCKET().keys()].filter((k) => k.startsWith(`${A}/`))).toEqual([])
  })

  it('keeps the old photo when the new one cannot be saved, and logs nothing', async () => {
    await upload(ITEM_A)
    const before = item(ITEM_A)?.worn_photo_path as string
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.uploadError = true
    const res = await upload(ITEM_A)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Could not save the photo' })
    expect(item(ITEM_A)?.worn_photo_path).toBe(before)
    expect(BUCKET().has(before)).toBe(true)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('is off when try-on is switched off', async () => {
    vi.stubEnv('ENABLE_TRY_ON', '')
    expect((await get(ITEM_A)).status).toBe(404)
    expect((await upload(ITEM_A)).status).toBe(404)
    expect((await del(ITEM_A)).status).toBe(404)
  })
})
