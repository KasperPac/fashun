import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'

vi.mock('@/lib/supabase/server', async () => {
  const { fake: f } = await import('@/lib/__fixtures__/try-on-fake')
  return { createServerClient: async () => f.userClient(), createServiceClient: async () => f.serviceClient() }
})

import { GET, POST } from './route'

const OUTFIT = '20000000-0000-4000-8000-000000000001'
const TOP = '10000000-0000-4000-8000-000000000001'
const BOTTOM = '10000000-0000-4000-8000-000000000002'
const DRESS = '10000000-0000-4000-8000-000000000003'
const SHOES = '10000000-0000-4000-8000-000000000004'
const BAG = '10000000-0000-4000-8000-000000000005'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

interface FashnBody { model_name: string; inputs: { model_image: string; garment_image: string; category: string; return_base64: boolean } }
let fashnRuns: FashnBody[]
let fashnFailOnRun: number | null
let fashnHang: boolean
const mockFetch = vi.fn()

function installFetch() {
  mockFetch.mockImplementation(async (url: string, init?: { body?: string }) => {
    if (url === 'https://api.fashn.ai/v1/run') {
      fashnRuns.push(JSON.parse(init?.body ?? '{}') as FashnBody)
      return { ok: true, json: async () => ({ id: `pred-${fashnRuns.length}` }) }
    }
    if (url.startsWith('https://api.fashn.ai/v1/status/')) {
      const n = Number(url.split('pred-')[1])
      if (fashnHang) return { ok: true, json: async () => ({ status: 'processing' }) }
      if (n === fashnFailOnRun) return { ok: true, json: async () => ({ status: 'failed', error: { name: 'X', message: 'bad photo' } }) }
      const out = `data:image/jpeg;base64,${b64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, n]))}`
      return { ok: true, json: async () => ({ status: 'completed', output: [out] }) }
    }
    throw new Error(`unexpected fetch ${url}`)
  })
}

const piece = (label: string, item_id: string | null) => ({ label, colour_hex: '#000000', item_id, in_wardrobe: item_id !== null })

function seed(opts: { pieces?: unknown[]; items?: Array<{ id: string; category: string; image_url: string | null }>; photo?: boolean } = {}) {
  const items = opts.items ?? [
    { id: TOP, category: 'tops', image_url: `${A}/top.jpg` },
    { id: BOTTOM, category: 'bottoms', image_url: `${A}/bottom.jpg` },
  ]
  fake.tables.users.push({ id: A, try_on_photo_url: opts.photo === false ? null : `${A}/photo-1.jpg`, try_on_consent_at: 'x' })
  fake.tables.outfits.push({
    id: OUTFIT, user_id: A, try_on_image_path: null, try_on_made_at: null,
    pieces: opts.pieces ?? [piece('White tee', TOP), piece('Blue jeans', BOTTOM)],
  })
  for (const i of items) {
    fake.tables.wardrobe_items.push({ ...i, user_id: A })
    if (i.image_url) fake.buckets['wardrobe-images'].set(i.image_url, JPEG)
  }
  if (opts.photo !== false) fake.buckets['try-on-photos'].set(`${A}/photo-1.jpg`, JPEG)
}

async function post(body: unknown = { outfit_id: OUTFIT }) {
  const p = POST(new Request('http://localhost/api/outfits/try-on', { method: 'POST', body: JSON.stringify(body) }))
  await vi.runAllTimersAsync()
  return p
}

const ledger = () => fake.tables.try_on_ledger
const charged = () => ledger().filter((r) => r.status === 'charged')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-17T02:00:00Z'))
  fake.reset()
  fashnRuns = []
  fashnFailOnRun = null
  fashnHang = false
  mockFetch.mockReset()
  installFetch()
  vi.stubGlobal('fetch', mockFetch)
  vi.stubEnv('ENABLE_TRY_ON', 'true')
  vi.stubEnv('ENABLE_PAID_EXTRAS', '')
  vi.stubEnv('FASHN_API_KEY', 'test-key')
  vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '7.50')
  vi.stubEnv('TRY_ON_PRICE_USD', '0.075')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/outfits/try-on: switch and sign-in', () => {
  it('server refuses try-on when it is switched off', async () => {
    vi.stubEnv('ENABLE_TRY_ON', '')
    vi.stubEnv('ENABLE_PAID_EXTRAS', 'true')
    seed()
    const res = await post()
    expect(res.status).toBe(404)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(ledger()).toHaveLength(0)
  })

  it('also returns 404 from GET when try-on is off', async () => {
    vi.stubEnv('ENABLE_TRY_ON', '')
    const res = await GET(new Request(`http://localhost/api/outfits/try-on?outfit_id=${OUTFIT}`))
    expect(res.status).toBe(404)
  })

  it('returns 401 when signed out', async () => {
    seed()
    fake.currentUser = null
    expect((await post()).status).toBe(401)
  })

  it('does not find another person\'s outfit', async () => {
    seed()
    fake.currentUser = B
    expect((await post()).status).toBe(404)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('is not set up (503) without a key, cap or price, and calls nothing', async () => {
    vi.stubEnv('TRY_ON_PRICE_USD', '')
    seed()
    const res = await post()
    expect(res.status).toBe(503)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/outfits/try-on: drawing', () => {
  it('top and bottom outfit makes one picture in two steps', async () => {
    seed()
    const res = await post()
    expect(res.status).toBe(200)
    expect(fashnRuns).toHaveLength(2)
    const [first, second] = fashnRuns
    expect(first.model_name).toBe('tryon-v1.6')
    expect(first.inputs.category).toBe('tops')
    expect(second.inputs.category).toBe('bottoms')
    // photos go in as base64 data, never as links, and the result comes back as base64
    for (const run of fashnRuns) {
      expect(run.inputs.model_image).toMatch(/^data:image\/jpeg;base64,/)
      expect(run.inputs.garment_image).toMatch(/^data:image\/jpeg;base64,/)
      expect(run.inputs.model_image).not.toMatch(/^https?:/)
      expect(run.inputs.return_base64).toBe(true)
    }
    // step 1 draws on the person's photo; step 2 draws on step 1's result
    expect(first.inputs.model_image).toBe(`data:image/jpeg;base64,${b64(JPEG)}`)
    expect(second.inputs.model_image).toBe(`data:image/jpeg;base64,${b64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 1]))}`)
    const json = await res.json()
    expect(json.charged_pictures).toBe(2)
    expect(json.label).toBe('Made by AI. Fit and details may not be exact.')
    expect(charged()).toHaveLength(2)
  })

  it('dress or jumpsuit outfit makes one picture in one step', async () => {
    seed({
      pieces: [piece('Red dress', DRESS)],
      items: [{ id: DRESS, category: 'dresses', image_url: `${A}/dress.jpg` }],
    })
    const res = await post()
    expect(res.status).toBe(200)
    expect(fashnRuns).toHaveLength(1)
    expect(fashnRuns[0].inputs.category).toBe('one-pieces')
    expect(charged()).toHaveLength(1)
  })

  it('dress or jumpsuit outfit makes one picture in one step', async () => {
    seed({
      pieces: [piece('Black jumpsuit', DRESS)],
      items: [{ id: DRESS, category: 'jumpsuits', image_url: `${A}/j.jpg` }],
    })
    await post()
    expect(fashnRuns).toHaveLength(1)
    expect(fashnRuns[0].inputs.category).toBe('one-pieces')
  })

  it('shoes and accessories are shown beside the picture, not sent', async () => {
    seed({
      pieces: [piece('White tee', TOP), piece('Blue jeans', BOTTOM), piece('White sneakers', SHOES), piece('Tote', BAG)],
      items: [
        { id: TOP, category: 'tops', image_url: `${A}/top.jpg` },
        { id: BOTTOM, category: 'bottoms', image_url: `${A}/bottom.jpg` },
        { id: SHOES, category: 'shoes', image_url: `${A}/shoes.jpg` },
        { id: BAG, category: 'bags', image_url: `${A}/bag.jpg` },
      ],
    })
    const json = await (await post()).json()
    expect(fashnRuns).toHaveLength(2)
    expect(json.skipped).toEqual([
      { label: 'White sneakers', reason: 'not_drawn' },
      { label: 'Tote', reason: 'not_drawn' },
    ])
  })

  it('keeps the picture privately in the user\'s folder and saves it with the outfit', async () => {
    seed()
    const json = await (await post()).json()
    const row = fake.tables.outfits[0]
    expect(row.try_on_image_path).toMatch(new RegExp(`^${A}/outfit-${OUTFIT}-.+\\.jpg$`))
    expect(fake.buckets['try-on-photos'].has(row.try_on_image_path as string)).toBe(true)
    expect(row.try_on_made_at).toBeTruthy()
    expect(json.image_url).toContain(row.try_on_image_path as string)
  })
})

describe('POST /api/outfits/try-on: refusals that charge nothing', () => {
  it('a piece without a photo is never charged', async () => {
    seed({ items: [
      { id: TOP, category: 'tops', image_url: null },
      { id: BOTTOM, category: 'bottoms', image_url: `${A}/bottom.jpg` },
    ] })
    const res = await post()
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('MISSING_GARMENT_PHOTO')
    expect(json.error).toBe('Add a photo of your White tee to try this on')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(ledger()).toHaveLength(0)
  })

  it('outfit with nothing to draw explains what is missing and charges nothing', async () => {
    seed({
      pieces: [piece('Sneakers', SHOES)],
      items: [{ id: SHOES, category: 'shoes', image_url: `${A}/s.jpg` }],
    })
    const res = await post()
    expect((await res.json()).code).toBe('NO_TRYABLE_PIECES')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(ledger()).toHaveLength(0)
  })

  it('asks for a try-on photo when the person has none', async () => {
    seed({ photo: false })
    const res = await post()
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('NO_PERSON_PHOTO')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('never uses another person\'s wardrobe item: it is skipped, not drawn', async () => {
    seed()
    fake.tables.wardrobe_items[0].user_id = B
    const res = await post()
    expect(res.status).toBe(200)
    expect(fashnRuns).toHaveLength(1)
    expect(fashnRuns[0].inputs.category).toBe('bottoms')
    expect((await res.json()).skipped).toEqual([{ label: 'White tee', reason: 'not_in_wardrobe' }])
  })
})

describe('POST /api/outfits/try-on: saved pictures', () => {
  it('saved picture shows again without a new call or charge', async () => {
    seed()
    await post()
    const spendBefore = charged().length
    fashnRuns = []
    mockFetch.mockClear()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.10')
    const res = await post()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.saved).toBe(true)
    expect(json.image_url).toContain(`${A}/outfit-`)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(charged()).toHaveLength(spendBefore)
  })

  it('GET returns the saved picture without any FASHN call', async () => {
    seed()
    await post()
    mockFetch.mockClear()
    const res = await GET(new Request(`http://localhost/api/outfits/try-on?outfit_id=${OUTFIT}`))
    const json = await res.json()
    expect(json.image_url).toContain('outfit-')
    expect(json.paused).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('Try again warns first, then makes and charges a new picture', async () => {
    seed()
    await post()
    const oldPath = fake.tables.outfits[0].try_on_image_path as string
    const res = await post({ outfit_id: OUTFIT, regenerate: true })
    expect((await res.json()).saved).toBe(false)
    expect(charged()).toHaveLength(4)
    const newPath = fake.tables.outfits[0].try_on_image_path as string
    expect(newPath).not.toBe(oldPath)
    expect(fake.buckets['try-on-photos'].has(oldPath)).toBe(false)
    expect(fake.buckets['try-on-photos'].has(newPath)).toBe(true)
  })
})

describe('POST /api/outfits/try-on: failures add no spend', () => {
  it('FASHN refusal shows the failure message and charges nothing', async () => {
    seed()
    fashnFailOnRun = 1
    const res = await post()
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.code).toBe('TRY_ON_FAILED')
    expect(json.charged_pictures).toBe(0)
    expect(ledger()).toHaveLength(0)
    expect(fake.tables.outfits[0].try_on_image_path).toBeNull()
  })

  it('slow FASHN gives up within 90 seconds and charges nothing', async () => {
    seed()
    fashnHang = true
    const res = await post()
    expect(res.status).toBe(502)
    expect(ledger()).toHaveLength(0)
    expect(fake.tables.outfits[0].try_on_image_path).toBeNull()
  })

  it('second step failure shows the failure message', async () => {
    seed()
    fashnFailOnRun = 2
    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).charged_pictures).toBe(1)
    expect(charged()).toHaveLength(1)
    expect(ledger()).toHaveLength(1)
    expect(fake.tables.outfits[0].try_on_image_path).toBeNull()
  })

  it('keeps the charge but reports it when the picture cannot be saved', async () => {
    seed()
    fake.uploadError = true
    const res = await post()
    expect(res.status).toBe(500)
    expect((await res.json()).charged_pictures).toBe(2)
    expect(charged()).toHaveLength(2)
  })
})

describe('POST /api/outfits/try-on: the monthly cap', () => {
  it('server refuses try-on once the cap is used up', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.10')
    fake.tables.try_on_ledger.push({ id: 'old', month: '2026-11', status: 'charged', cost_usd: 0.075 })
    const res = await post()
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.code).toBe('CAP_REACHED')
    expect(json.resume_on).toBe('2026-12-01')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(ledger()).toHaveLength(1)
  })

  it('a picture that would pass the cap is never started', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.10') // room for one picture, not two
    const res = await post()
    expect(res.status).toBe(409)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(ledger()).toHaveLength(0)
  })

  it('allows an outfit that exactly reaches the cap', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.15')
    expect((await post()).status).toBe(200)
    expect(charged()).toHaveLength(2)
  })

  it('two requests at the cap never exceed it', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.15')
    await post()
    const second = await post({ outfit_id: OUTFIT, regenerate: true })
    expect(second.status).toBe(409)
    expect(charged()).toHaveLength(2)
  })

  it('try-on resumes at midnight on the 1st Sydney time', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.15')
    // Used up in November (Sydney)...
    vi.setSystemTime(new Date('2026-11-30T12:59:00Z')) // 23:59 on 30 Nov in Sydney
    await post()
    expect((await post({ outfit_id: OUTFIT, regenerate: true })).status).toBe(409)
    // ...works again at 00:00 on 1 Dec in Sydney, with nobody resetting anything.
    vi.setSystemTime(new Date('2026-11-30T13:00:00Z'))
    const res = await post({ outfit_id: OUTFIT, regenerate: true })
    expect(res.status).toBe(200)
    expect(ledger().map((r) => r.month)).toEqual(['2026-11', '2026-11', '2026-12', '2026-12'])
  })

  it('cap used up shows the paused message and keeps saved pictures', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.15')
    await post()
    const json = await (await GET(new Request(`http://localhost/api/outfits/try-on?outfit_id=${OUTFIT}`))).json()
    expect(json.paused).toBe(true)
    expect(json.resume_on).toBe('2026-12-01')
    expect(json.image_url).toContain('outfit-')
  })
})
