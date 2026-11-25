import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'

vi.mock('@/lib/supabase/server', async () => {
  const { fake: f } = await import('@/lib/__fixtures__/try-on-fake')
  return { createServerClient: async () => f.userClient(), createServiceClient: async () => f.serviceClient() }
})

import { GET, POST } from './route'
import { GET as SPEND } from '@/app/api/try-on/spend/route'

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
  vi.stubEnv('TRY_ON_PROVIDER', 'fashn') // the FASHN suite below is today's path; Gemini has its own describe at the end
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

  it('a dress outfit is drawn in one step with the one-piece', async () => {
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

  it('a jumpsuit outfit is drawn in one step with the one-piece', async () => {
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

  it('a ledger failure after FASHN returned an image keeps that image counted', async () => {
    seed()
    fake.ledgerUpdateFailures = 99 // every ledger write fails, including the second try
    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).charged_pictures).toBe(1)
    expect(fashnRuns).toHaveLength(1)
    // The returned image's reservation stays (counts toward the cap); only the image never made is released.
    expect(ledger()).toHaveLength(1)
    expect(ledger()[0].status).toBe('reserved')
    expect(fake.tables.outfits[0].try_on_image_path).toBeNull()
  })

  it('a ledger write that fails once is retried and the image is charged', async () => {
    seed()
    fake.ledgerUpdateFailures = 1
    const res = await post()
    expect(res.status).toBe(502)
    expect(charged()).toHaveLength(1)
    expect(ledger()).toHaveLength(1)
  })

  it('second step failure uses no try-on and counts the first image for the owner', async () => {
    seed()
    fashnFailOnRun = 2
    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).charged_pictures).toBe(1)
    expect(charged()).toHaveLength(1)
    expect(charged().some((r) => r.picture_made)).toBe(false) // no picture made, so no try-on used up
    expect(ledger()).toHaveLength(1)
    expect(fake.tables.outfits[0].try_on_image_path).toBeNull()
  })

  it('a charged failure shows in the owner\'s panel and not to the person', async () => {
    seed()
    fashnFailOnRun = 2
    expect((await post()).status).toBe(502)
    const mine = await (await GET(new Request(`http://localhost/api/outfits/try-on?outfit_id=${OUTFIT}`))).json()
    expect(mine.paused).toBe(false) // still offered, no try-on used up
    expect(mine.image_url).toBeNull()
    expect(JSON.stringify(mine)).not.toContain('spent')
    vi.stubEnv('TRY_ON_OWNER_USER_ID', A)
    const owner = await (await SPEND()).json()
    expect(owner.images).toBe(1)
    expect(owner.spent_usd).toBe(0.075)
    expect(owner.pictures).toBe(0)
  })

  it('storage failure saves nothing, uses no try-on and counts FASHN\'s charged images for the owner', async () => {
    seed()
    fake.uploadError = true
    const res = await post()
    expect(res.status).toBe(500)
    expect((await res.json()).charged_pictures).toBe(2)
    expect(charged()).toHaveLength(2)
    expect(charged().some((r) => r.picture_made)).toBe(false)
    expect(fake.tables.outfits[0].try_on_image_path).toBeNull()
    expect([...fake.buckets['try-on-photos'].keys()].filter((k) => k.includes('outfit-'))).toEqual([])
  })
})

describe('POST /api/outfits/try-on: the monthly cap', () => {
  it('server refuses try-on once the cap is used up', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.10')
    fake.tables.try_on_ledger.push({ id: 'old', batch_id: 'old', month: '2026-11', status: 'charged' })
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

describe('spend rules: exact image count', () => {
  it('a charged first step stays counted in the owner spend when step 2 fails', async () => {
    seed()
    fashnFailOnRun = 2
    await post()
    expect(charged()).toHaveLength(1)
    expect(ledger().every((r) => 'batch_id' in r && !('cost_usd' in r))).toBe(true)
    expect(fake.rpcCalls[0]).toMatchObject({ p_price_units: 750, p_cap_units: 75_000 })
  })

  it('checks the cap on the exact amount, not the rounded one', async () => {
    seed({ pieces: [piece('White tee', TOP)] })
    // 1 image = US$0.075 (shown as US$0.08). A cap of US$0.074 is under one image even though it rounds to US$0.07 either way.
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.074')
    expect((await post()).status).toBe(409)
    // 3 images = US$0.225 (shown US$0.23): a cap of US$0.226 fits 3 images, US$0.224 does not.
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.224')
    fake.tables.try_on_ledger.push(
      { id: 'a', batch_id: 'x', month: '2026-11', status: 'charged' },
      { id: 'b', batch_id: 'x', month: '2026-11', status: 'charged' },
    )
    expect((await post()).status).toBe(409)
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.226')
    expect((await post()).status).toBe(200)
    expect(charged()).toHaveLength(3)
  })

  it('GET says paused when the outfit needs two images and only one fits', async () => {
    seed()
    await post()
    fake.tables.try_on_ledger.length = 0
    fake.tables.try_on_ledger.push({ id: 'a', batch_id: 'x', month: '2026-11', status: 'charged' })
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.15')
    const get = async (images: string) =>
      (await (await GET(new Request(`http://localhost/api/outfits/try-on?outfit_id=${OUTFIT}&images=${images}`))).json()).paused
    expect(await get('1')).toBe(false)
    expect(await get('2')).toBe(true)
  })
})

describe('try-on failures log a reason with no personal data', () => {
  it('logs one fixed reason per failure and nothing from the person or FASHN', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    seed()
    fashnFailOnRun = 1
    await post()
    fashnFailOnRun = null
    fashnHang = true
    await post()
    fashnHang = false
    fake.uploadError = true
    await post()
    const lines = log.mock.calls.map((c) => c.join(' '))
    expect(lines).toEqual([
      'try-on failed: fashn_refused',
      'try-on failed: fashn_timeout',
      'try-on failed: storage_failed',
    ])
    const all = lines.join('\n')
    for (const secret of [A, 'photo-1', 'bad photo', 'White tee', 'Blue jeans', 'test-key', '@']) expect(all).not.toContain(secret)
    log.mockRestore()
  })
})

describe('the AI label', () => {
  it('every try-on picture carries the AI label', async () => {
    seed()
    const label = 'Made by AI. Fit and details may not be exact.'
    const fresh = await (await post()).json()
    expect(fresh.label).toBe(label)
    const saved = await (await post()).json()
    expect(saved.saved).toBe(true)
    expect(saved.label).toBe(label)
    const got = await (await GET(new Request(`http://localhost/api/outfits/try-on?outfit_id=${OUTFIT}`))).json()
    expect(got.label).toBe(label)
  })
})

describe('owner spend after failures', () => {
  it('a charged failure shows in the owner\'s panel and not to the person', async () => {
    vi.stubEnv('TRY_ON_OWNER_USER_ID', A)
    seed()
    fashnFailOnRun = 2
    const res = await post()
    expect(res.status).toBe(502)
    // The person: no picture, not paused, so See it on me is still offered; the message promises nothing was charged to them.
    const mine = await (await GET(new Request(`http://localhost/api/outfits/try-on?outfit_id=${OUTFIT}&images=2`))).json()
    expect(mine.image_url).toBeNull()
    expect(mine.paused).toBe(false)
    // The owner: the charged image counts in images and spend, and no picture was made.
    const owner = await (await SPEND()).json()
    expect(owner.images).toBe(1)
    expect(owner.spent_usd).toBe(0.075)
    expect(owner.pictures).toBe(0)
  })

  it('a made picture counts as a picture and its images', async () => {
    vi.stubEnv('TRY_ON_OWNER_USER_ID', A)
    seed()
    await post()
    const owner = await (await SPEND()).json()
    expect(owner).toMatchObject({ images: 2, pictures: 1, spent_usd: 0.15 })
  })
})

describe('exact cap', () => {
  it('cap is checked on the exact spend, not the rounded one', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.375') // 5 images exactly
    fake.tables.try_on_ledger.push(
      ...[1, 2, 3].map((n) => ({ id: `c${n}`, batch_id: `x${n}`, month: '2026-11', status: 'charged', picture_made: false })),
    ) // 3 images = US$0.225, shown US$0.23, which would leave only US$0.145 if the rounded figure were used
    expect((await post()).status).toBe(200) // needs US$0.15: fits on the exact amount (room US$0.15)
    expect(charged()).toHaveLength(5)
    const second = await post({ outfit_id: OUTFIT, regenerate: true })
    expect(second.status).toBe(409)
    expect(fashnRuns).toHaveLength(2) // the second request never reached FASHN
  })
})

// ---- Gemini: one request per outfit (KAS-693) ----

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1:generateContent'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7, 7])

interface GeminiBody {
  contents: Array<{ parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> }>
}
let geminiRuns: Array<{ url: string; key: string | undefined; body: GeminiBody }>
let geminiMode: 'ok' | 'refuse' | 'no-picture' | 'hang' | 'hostile'

function installGemini() {
  mockFetch.mockImplementation(async (url: string, init?: { body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => {
    if (!url.startsWith('https://generativelanguage.googleapis.com/')) throw new Error(`unexpected fetch ${url}`)
    geminiRuns.push({ url, key: init?.headers?.['x-goog-api-key'], body: JSON.parse(init?.body ?? '{}') as GeminiBody })
    if (geminiMode === 'hang') {
      return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    }
    if (geminiMode === 'refuse' || geminiMode === 'hostile') {
      return { ok: false, status: geminiMode === 'refuse' ? 429 : 500, json: async () => ({ error: { message: 'quota for person@example.com see https://evil.example Jane Doe' } }) }
    }
    if (geminiMode === 'no-picture') return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'sorry' }] } }] }) }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64(PNG) } }] } }] }) }
  })
}

const geminiParts = (i = 0) => geminiRuns[i].body.contents[0].parts
const geminiPictures = (i = 0) => geminiParts(i).filter((p) => p.inline_data)

describe('POST /api/outfits/try-on: Gemini (one request per outfit)', () => {
  beforeEach(() => {
    geminiRuns = []
    geminiMode = 'ok'
    vi.stubEnv('TRY_ON_PROVIDER', '')
    vi.stubEnv('GEMINI_API_KEY', 'gemini-test-key')
    vi.stubEnv('FASHN_API_KEY', '')
    vi.stubEnv('TRY_ON_PRICE_USD', '0.045')
    installGemini()
  })

  it('new provider makes a top and bottoms outfit in one request', async () => {
    seed()
    const res = await post()
    expect(res.status).toBe(200)
    expect(geminiRuns).toHaveLength(1)
    expect(geminiRuns[0].url).toBe(GEMINI_URL)
    expect(geminiRuns[0].key).toBe('gemini-test-key')
    // the person, then the top, then the bottoms
    expect(geminiPictures()).toHaveLength(3)
    const json = await res.json()
    expect(json.charged_pictures).toBe(1)
    expect(charged()).toHaveLength(1)
    expect(charged()[0]).toMatchObject({ step: 'outfit', price_units: 450, picture_made: true })
    const owner = await (async () => { vi.stubEnv('TRY_ON_OWNER_USER_ID', A); return (await SPEND()).json() })()
    expect(owner).toMatchObject({ images: 1, pictures: 1, spent_usd: 0.045 })
    expect(fake.tables.outfits[0].try_on_image_path).toMatch(/\.png$/)
  })

  it('one-shot outfit counts as one picture against the cap', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.09')
    const get = async (images: string) =>
      (await (await GET(new Request(`http://localhost/api/outfits/try-on?outfit_id=${OUTFIT}&images=${images}`))).json()).paused
    // ?images=2 is a FASHN figure: Gemini always makes one picture, so room for one means not paused
    expect(await get('2')).toBe(false)
    expect((await post()).status).toBe(200)
    expect((await post({ outfit_id: OUTFIT, regenerate: true })).status).toBe(200) // 2 x 0.045 = the cap exactly
    expect(await get('1')).toBe(true)
    expect((await post({ outfit_id: OUTFIT, regenerate: true })).status).toBe(409)
    expect(geminiRuns).toHaveLength(2)
  })

  it('photos go to the provider as base64 never links', async () => {
    seed()
    await post()
    for (const p of geminiPictures()) {
      expect(p.inline_data?.data).toBe(b64(JPEG))
      expect(p.inline_data?.mime_type).toBe('image/jpeg')
    }
    expect(JSON.stringify(geminiRuns[0].body)).not.toMatch(/https?:/)
    expect(geminiParts()[0].text).toContain("Keep the person's own shoes")
  })

  it('new provider picture is saved and shown again for free with the AI label', async () => {
    seed()
    await post()
    mockFetch.mockClear()
    const again = await (await post()).json()
    expect(again).toMatchObject({ saved: true, charged_pictures: 0, label: 'Made by AI. Fit and details may not be exact.' })
    const got = await (await GET(new Request(`http://localhost/api/outfits/try-on?outfit_id=${OUTFIT}`))).json()
    expect(got.image_url).toContain('outfit-')
    expect(got.label).toBe('Made by AI. Fit and details may not be exact.')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(charged()).toHaveLength(1)
  })

  it('plan draws or skips each category as decided', async () => {
    const JACKET = '10000000-0000-4000-8000-000000000006'
    seed({
      pieces: [piece('White tee', TOP), piece('Blue jeans', BOTTOM), piece('White sneakers', SHOES), piece('Tote', BAG), piece('Denim jacket', JACKET)],
      items: [
        { id: TOP, category: 'tops', image_url: `${A}/top.jpg` },
        { id: BOTTOM, category: 'bottoms', image_url: `${A}/bottom.jpg` },
        { id: SHOES, category: 'shoes', image_url: `${A}/shoes.jpg` },
        { id: BAG, category: 'bags', image_url: `${A}/bag.jpg` },
        { id: JACKET, category: 'outerwear', image_url: `${A}/jacket.jpg` },
      ],
    })
    const json = await (await post()).json()
    expect(geminiRuns).toHaveLength(1)
    expect(geminiPictures()).toHaveLength(5) // person, top, bottoms, jacket, shoes; never the bag
    expect(geminiParts()[0].text).toContain('picture 2 is a top; picture 3 is bottoms; picture 4 is a jacket or coat, worn over the top; picture 5 is shoes')
    expect(geminiParts()[0].text).not.toContain('White tee')
    expect(json.skipped).toEqual([{ label: 'Tote', reason: 'not_drawn' }])
    expect(charged()).toHaveLength(1)
  })

  it('dress or jumpsuit outfit makes one picture', async () => {
    for (const category of ['dresses', 'jumpsuits']) {
      geminiRuns = []
      fake.reset()
      seed({
        pieces: [piece('Red dress', DRESS), piece('White sneakers', SHOES)],
        items: [
          { id: DRESS, category, image_url: `${A}/dress.jpg` },
          { id: SHOES, category: 'shoes', image_url: `${A}/shoes.jpg` },
        ],
      })
      expect((await post()).status).toBe(200)
      expect(geminiRuns).toHaveLength(1)
      expect(geminiPictures()).toHaveLength(3)
      expect(geminiParts()[0].text).toContain('picture 2 is a dress or jumpsuit; picture 3 is shoes')
      expect(charged()).toHaveLength(1)
    }
  })

  it('unknown provider setting falls back safely', async () => {
    for (const value of ['', 'openai', 'FASHN-typo', '  ']) {
      vi.stubEnv('TRY_ON_PROVIDER', value)
      fake.reset(); geminiRuns = []
      seed()
      expect((await post()).status).toBe(200)
      expect(geminiRuns).toHaveLength(1) // Gemini, never an unknown service and never a server error
    }
    vi.stubEnv('TRY_ON_PROVIDER', ' FASHN ')
    fake.reset(); geminiRuns = []; fashnRuns = []
    mockFetch.mockReset()
    installFetch()
    vi.stubEnv('FASHN_API_KEY', 'test-key')
    seed()
    await post()
    expect(fashnRuns).toHaveLength(2)
  })

  it('without a Gemini key it is not set up and calls nothing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    seed()
    expect((await post()).status).toBe(503)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('unreadable photo stops before any provider call on both providers', async () => {
    for (const provider of ['gemini', 'fashn']) {
      vi.stubEnv('TRY_ON_PROVIDER', provider)
      vi.stubEnv('FASHN_API_KEY', 'test-key')
      fake.reset(); mockFetch.mockClear()
      seed()
      fake.buckets['wardrobe-images'].delete(`${A}/bottom.jpg`)
      const res = await post()
      expect(res.status).toBe(500)
      expect((await res.json()).code).toBe('IMAGE_UNAVAILABLE')
      expect(mockFetch).not.toHaveBeenCalled()
      expect(ledger()).toHaveLength(0)
    }
  })

  it('cap is checked before the provider is called on both providers', async () => {
    for (const provider of ['gemini', 'fashn']) {
      vi.stubEnv('TRY_ON_PROVIDER', provider)
      vi.stubEnv('FASHN_API_KEY', 'test-key')
      fake.reset(); mockFetch.mockClear()
      seed({ pieces: [piece('White tee', TOP)] })
      vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.044') // under one Gemini picture (0.045) and one FASHN image (0.075)
      expect((await post()).status).toBe(409)
      expect(mockFetch).not.toHaveBeenCalled()
      expect(ledger()).toHaveLength(0)
      vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', provider === 'gemini' ? '0.045' : '0.075') // room for exactly one
      if (provider === 'fashn') installFetch(); else installGemini()
      expect((await post()).status).toBe(200)
      expect(charged()).toHaveLength(1)
    }
  })

  it('each picture is counted at the price it was made at', async () => {
    seed()
    await post() // Gemini at 0.045
    vi.stubEnv('TRY_ON_PRICE_USD', '0.06') // the price changes afterwards
    vi.stubEnv('TRY_ON_PROVIDER', 'fashn')
    vi.stubEnv('FASHN_API_KEY', 'test-key')
    mockFetch.mockReset(); installFetch()
    await post({ outfit_id: OUTFIT, regenerate: true }) // 2 FASHN images at 0.075
    vi.stubEnv('TRY_ON_OWNER_USER_ID', A)
    const owner = await (await SPEND()).json()
    expect(owner.images).toBe(3)
    expect(owner.spent_usd).toBeCloseTo(0.045 + 2 * 0.075, 10)
    expect(fake.rpcCalls.map((c) => c.p_price_units)).toEqual([450, 750])
  })

  it('two requests at the cap never exceed it on both providers', async () => {
    seed()
    vi.stubEnv('TRY_ON_MONTHLY_CAP_USD', '0.045')
    expect((await post()).status).toBe(200)
    expect((await post({ outfit_id: OUTFIT, regenerate: true })).status).toBe(409)
    expect(geminiRuns).toHaveLength(1)
    expect(charged()).toHaveLength(1)
  })

  it('only returned pictures are charged on the new provider', async () => {
    for (const mode of ['refuse', 'hostile', 'no-picture', 'hang'] as const) {
      fake.reset(); geminiRuns = []
      geminiMode = mode
      seed()
      const res = await post()
      expect(res.status).toBe(502)
      const json = await res.json()
      expect(json.code).toBe('TRY_ON_FAILED')
      expect(json.charged_pictures).toBe(0)
      expect(ledger()).toHaveLength(0)
      expect(fake.tables.outfits[0].try_on_image_path).toBeNull()
    }
    // A picture came back but could not be saved: counted, and no try-on used up.
    fake.reset(); geminiMode = 'ok'
    seed()
    fake.uploadError = true
    const res = await post()
    expect(res.status).toBe(500)
    expect((await res.json()).charged_pictures).toBe(1)
    expect(charged()).toHaveLength(1)
    expect(charged()[0].picture_made).toBe(false)
  })

  it('slow new provider gives up in time and charges nothing', async () => {
    geminiMode = 'hang'
    seed()
    const started = Date.now()
    const res = await post()
    expect(res.status).toBe(502)
    expect(Date.now() - started).toBeLessThan(90_000) // inside the route's 90 second limit
    expect(ledger()).toHaveLength(0)
  })

  it('try-on failures log a fixed reason only on both providers', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    geminiMode = 'hostile'
    seed()
    await post()
    geminiMode = 'hang'
    await post()
    geminiMode = 'ok'
    fake.uploadError = true
    await post()
    const lines = log.mock.calls.map((c) => c.join(' '))
    expect(lines).toEqual([
      'try-on failed: gemini_refused',
      'try-on failed: gemini_timeout',
      'try-on failed: storage_failed',
    ])
    for (const secret of ['person@example.com', 'evil.example', 'Jane Doe', 'quota', A, 'photo-1', 'gemini-test-key', 'White tee', 'base64']) {
      expect(lines.join('\n')).not.toContain(secret)
    }
    log.mockRestore()
  })
})
