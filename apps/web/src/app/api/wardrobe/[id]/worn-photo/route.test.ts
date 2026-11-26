import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } },
}))

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

const NOTES = 'Relaxed fit, hip length. Sleeves end at the wrist.'
const BOX = { left: 0.2, top: 0.3, right: 0.8, bottom: 0.9 }
const reply = (r: { notes?: string | null; box?: unknown; tucked?: string }) =>
  ({ content: [{ type: 'text', text: JSON.stringify({ notes: null, box: null, tucked: 'unclear', ...r }) }] })

beforeEach(() => {
  mockCreate.mockReset()
  mockCreate.mockResolvedValue(reply({ notes: NOTES, box: BOX, tucked: 'untucked' }))
  fake.reset()
  fake.tables.users.push(
    { id: A, try_on_consent_at: 'x', try_on_consent_note: 'gemini-2' },
    { id: B, try_on_consent_at: 'x', try_on_consent_note: 'gemini-2' },
  )
  fake.tables.wardrobe_items.push(
    { id: ITEM_A, user_id: A, worn_photo_path: null, name: 'Dark Indigo Straight Leg Jeans', category: 'bottoms' },
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

  it('worn photo link lasts 5 minutes', async () => {
    await upload(ITEM_A)
    fake.signedLives = []
    expect((await get(ITEM_A).then((r) => r.json())).image_url).toBeTruthy()
    expect(fake.signedLives).toEqual([300])
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

  it('saving a worn photo stores garment-only fit notes', async () => {
    expect((await upload(ITEM_A)).status).toBe(200)
    expect(item(ITEM_A)?.fit_notes).toBe(NOTES)
    expect(item(ITEM_A)?.worn_fit).toEqual({ box: BOX, tucked: 'untucked' })
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const sent = mockCreate.mock.calls[0][0].messages[0].content
    expect(sent[0]).toMatchObject({ type: 'image', source: { type: 'base64' } })
    const ask = sent[1].text as string
    for (const word of ['how loose or slim', 'length', 'sleeves or hem', '"box"', '"tucked"']) expect(ask).toContain(word)
    expect(ask).toMatch(/that item only/i)
    expect(ask).toMatch(/do not mention tucking in the notes/i)
    expect(ask).toMatch(/never mention or judge the person's body/i)
    const body = await get(ITEM_A).then((r) => r.json())
    expect(body.fit_notes).toBe(NOTES)
  })

  it('the fit-notes request names the item and its category and says to ignore other clothing', async () => {
    await upload(ITEM_A)
    const ask = mockCreate.mock.calls[0][0].messages[0].content[1].text as string
    expect(ask).toContain('"Dark Indigo Straight Leg Jeans"')
    expect(ask).toContain('(category: bottoms)')
    expect(ask).toMatch(/ignore every other garment, shoe and accessory/i)
  })

  it('fit notes failure does not break the worn photo', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreate.mockRejectedValue(Object.assign(new Error('boom for jane@example.com'), { status: 529 }))
    const res = await upload(ITEM_A)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(item(ITEM_A)?.worn_photo_path).toMatch(/worn-/)
    expect(item(ITEM_A)?.fit_notes).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('fit-notes: anthropic 529')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('jane@example.com')
    spy.mockRestore()
  })

  it('replacing a worn photo remakes its fit notes', async () => {
    await upload(ITEM_A)
    expect(item(ITEM_A)?.fit_notes).toBe(NOTES)
    mockCreate.mockResolvedValue(reply({ notes: 'Slim fit. Cropped length.', box: null, tucked: 'tucked' }))
    await upload(ITEM_A)
    expect(item(ITEM_A)?.fit_notes).toBe('Slim fit. Cropped length.')
    expect(item(ITEM_A)?.worn_fit).toEqual({ box: null, tucked: 'tucked' })
    // a failed reading on replace leaves no old notes behind
    mockCreate.mockRejectedValue(new Error('x'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await upload(ITEM_A)
    expect(item(ITEM_A)?.fit_notes).toBeNull()
    expect(item(ITEM_A)?.worn_fit).toBeNull()
  })

  it('a box that is out of range or missing is dropped, never guessed', async () => {
    mockCreate.mockResolvedValue(reply({ notes: NOTES, box: { left: 0.5, top: 0.1, right: 0.4, bottom: 0.9 }, tucked: 'sideways' }))
    await upload(ITEM_A)
    expect(item(ITEM_A)?.worn_fit).toEqual({ box: null, tucked: 'unclear' })
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Relaxed fit. Worn untucked.' }] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await upload(ITEM_A)
    expect(item(ITEM_A)?.fit_notes).toBeNull() // plain text, not the JSON we asked for
    expect(item(ITEM_A)?.worn_fit).toBeNull()
  })

  it('deleting the worn photo clears its fit notes', async () => {
    await upload(ITEM_A)
    expect((await del(ITEM_A)).status).toBe(200)
    expect(item(ITEM_A)?.fit_notes).toBeNull()
    expect(item(ITEM_A)?.worn_fit).toBeNull()
    expect((await get(ITEM_A).then((r) => r.json())).fit_notes).toBeNull()
  })

  it('is off when try-on is switched off', async () => {
    vi.stubEnv('ENABLE_TRY_ON', '')
    expect((await get(ITEM_A)).status).toBe(404)
    expect((await upload(ITEM_A)).status).toBe(404)
    expect((await del(ITEM_A)).status).toBe(404)
  })
})
