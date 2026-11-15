import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockCreate = vi.fn()
const eqCalls: Array<[string, string, unknown]> = []

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const FOREIGN_ID = id(999)

type Item = { id: string; name: string; category: string; colours: string[]; occasion_tags: string[] | null; ownership?: string; user_id?: string }
const mk = (n: number, category: string, tags: string[] | null, colours = ['#B7410E']): Item =>
  ({ id: id(n), name: `${category}-${n}`, category, colours, occasion_tags: tags })

let wardrobe: Item[] = []
let profile: Record<string, unknown> | null = null

function chain(table: string, rows: () => unknown) {
  const c: Record<string, unknown> = {}
  c['select'] = () => c
  c['eq'] = (col: string, val: unknown) => { eqCalls.push([table, col, val]); return c }
  c['single'] = () => Promise.resolve({ data: rows(), error: null })
  c['then'] = (r: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(r)
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => chain(table, () => (table === 'users' ? profile : wardrobe)),
  }),
}))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))

import { POST } from './route'

const call = (body: unknown) => POST(new Request('http://localhost/api/outfits/generate', { method: 'POST', body: JSON.stringify(body) }))
const reply = (outfits: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(outfits) }] })
const outfit = (ids: string[], reason = 'Rust and olive are in your Autumn palette.') =>
  ({ name: 'Look', description: 'A good look.', reason, item_ids: ids })

// 2 tops, 2 bottoms, 2 shoes: enough for 3 different outfits.
const FULL: Item[] = [
  mk(1, 'tops', ['formal']), mk(2, 'tops', ['formal', 'work']),
  mk(3, 'bottoms', ['formal']), mk(4, 'bottoms', ['work']),
  mk(5, 'shoes', ['formal']), mk(6, 'shoes', ['formal']),
  mk(7, 'tops', ['casual']), mk(8, 'shoes', ['casual']),
]

describe('POST /api/outfits/generate (occasion only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqCalls.length = 0
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    wardrobe = FULL
    profile = { colour_season: 'autumn', best_colours: ['#B7410E', '#556B2F'], avoid_colours: ['#FF00FF'] }
    mockCreate.mockResolvedValue(reply([outfit([id(1), id(3), id(5)]), outfit([id(2), id(4), id(6)]), outfit([id(1), id(4), id(6)])]))
  })

  it('returns 3 complete outfits built only from owned items, scoped to the user', async () => {
    const res = await call({ occasion: 'formal' })
    expect(res.status).toBe(200)
    const { suggestions } = await res.json()
    expect(suggestions).toHaveLength(3)
    for (const s of suggestions) {
      const cats = s.pieces.map((p: { item_id: string }) => FULL.find(i => i.id === p.item_id)?.category)
      expect(cats).toEqual(expect.arrayContaining(['tops', 'bottoms', 'shoes']))
      expect(s.pieces.every((p: { in_wardrobe: boolean }) => p.in_wardrobe)).toBe(true)
    }
    expect(eqCalls).toContainEqual(['wardrobe_items', 'user_id', 'user-1'])
    expect(eqCalls).toContainEqual(['wardrobe_items', 'ownership', 'owned'])
  })

  it('returns 401 when unauthenticated and 400 for an unknown occasion', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await call({ occasion: 'formal' })).status).toBe(401)
    expect((await call({ occasion: 'beach' })).status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('drops an outfit with an invented id or another user\'s id, and regenerates', async () => {
    mockCreate
      .mockResolvedValueOnce(reply([
        outfit([id(1), id(3), id(5)]),
        outfit([id(2), id(4), FOREIGN_ID]),
        outfit([id(2), id(4), id(404)]),
      ]))
      .mockResolvedValueOnce(reply([outfit([id(2), id(4), id(6)]), outfit([id(1), id(4), id(6)])]))
    const res = await call({ occasion: 'formal' })
    const { suggestions } = await res.json()
    expect(mockCreate).toHaveBeenCalledTimes(2)
    const returned = suggestions.flatMap((s: { pieces: { item_id: string }[] }) => s.pieces.map(p => p.item_id))
    expect(returned).not.toContain(FOREIGN_ID)
    expect(returned).not.toContain(id(404))
    expect(suggestions).toHaveLength(3)
  })

  it('never returns an outfit made of invented ids, even after retrying', async () => {
    mockCreate.mockResolvedValue(reply([outfit([id(404), id(405), FOREIGN_ID])]))
    const res = await call({ occasion: 'formal' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain(FOREIGN_ID)
  })

  it('never puts an item tagged only casual in a formal outfit, even if the model picks it', async () => {
    mockCreate.mockResolvedValue(reply([outfit([id(7), id(3), id(5)]), outfit([id(1), id(3), id(8)]), outfit([id(1), id(3), id(5)])]))
    const res = await call({ occasion: 'formal' })
    const { suggestions } = await res.json()
    const returned = suggestions.flatMap((s: { pieces: { item_id: string }[] }) => s.pieces.map(p => p.item_id))
    expect(returned).not.toContain(id(7))
    expect(returned).not.toContain(id(8))
    // the casual items are not even offered to the model
    expect(mockCreate.mock.calls[0]![0].messages[0].content).not.toContain(id(7))
  })

  it('never builds a casual outfit only from formal items', async () => {
    wardrobe = [...FULL.filter(i => i.occasion_tags?.[0] === 'formal'), mk(10, 'tops', ['casual']), mk(11, 'bottoms', ['casual']), mk(12, 'shoes', ['casual']), mk(13, 'tops', null), mk(14, 'shoes', ['casual', 'work'])]
    mockCreate.mockResolvedValue(reply([outfit([id(1), id(3), id(5)]), outfit([id(10), id(11), id(12)])]))
    const res = await call({ occasion: 'casual' })
    const { suggestions } = await res.json()
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].pieces.map((p: { item_id: string }) => p.item_id)).toEqual([id(10), id(11), id(12)])
    expect(mockCreate.mock.calls[0]![0].messages[0].content).not.toContain(id(1))
  })

  it('every reason is one sentence of at most 140 characters naming "your {Season} palette" or "your best {Season} colours"', async () => {
    mockCreate.mockResolvedValue(reply([
      outfit([id(1), id(3), id(5)], 'Looks sharp.'),
      outfit([id(2), id(4), id(6)], 'Rustic tones are in your Autumn palette, and the shoes keep it warm.'),
      outfit([id(1), id(4), id(6)], ''),
    ]))
    const { suggestions } = await (await call({ occasion: 'formal' })).json()
    for (const s of suggestions) {
      expect(s.reason).toMatch(/your (Autumn palette|best Autumn colours)/)
      expect(s.reason.length).toBeLessThanOrEqual(140)
      expect(s.reason).not.toMatch(/#[0-9a-f]{6}/i)
    }
    expect(suggestions[1].reason).toBe('Rustic tones are in your Autumn palette, and the shoes keep it warm.')
    // all three pieces are one colour, so the fallback names that single colour
    expect(suggestions[0].reason).toMatch(/^.+ is one of your best Autumn colours\.$/)
  })

  it('gives each piece its category and a photo url (null when there is none)', async () => {
    const { suggestions } = await (await call({ occasion: 'formal' })).json()
    expect(suggestions[0].pieces.map((p: { category: string }) => p.category)).toEqual(['tops', 'bottoms', 'shoes'])
    expect(suggestions[0].pieces.every((p: { image_url: unknown }) => p.image_url === null)).toBe(true)
    expect(suggestions[0].season).toBeUndefined()
    expect((await (await call({ occasion: 'formal' })).json()).season).toBe('autumn')
  })

  it('uses the profile\'s season and hand-edited colours in the prompt', async () => {
    profile = { colour_season: 'winter', best_colours: ['#000080'], avoid_colours: ['#FFB347'] }
    await call({ occasion: 'formal' })
    const prompt = mockCreate.mock.calls[0]![0].messages[0].content
    expect(prompt).toContain('Winter')
    expect(prompt).toContain('#000080')
    expect(prompt).toContain('#FFB347')
  })

  it('asks for a colour profile, with no model call, when there is no season', async () => {
    profile = { colour_season: null, best_colours: [], avoid_colours: [] }
    const res = await call({ occasion: 'formal' })
    expect(res.status).toBe(422)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('says what is missing, with no model call, when there are no formal shoes', async () => {
    wardrobe = FULL.filter(i => i.category !== 'shoes' || i.occasion_tags?.[0] === 'casual')
    const res = await call({ occasion: 'formal' })
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.code).toBe('not_enough_items')
    expect(json.error).toBe('Not enough formal clothes yet. Add a pair of formal shoes.')
    expect(json.missing).toEqual(['shoes'])
    expect(json.have).toEqual(['tops', 'bottoms'])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('says so, with no model call, when the wardrobe is empty', async () => {
    wardrobe = []
    expect((await call({ occasion: 'work' })).status).toBe(422)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('1 top + 1 bottom + 1 pair of shoes: returns 1 outfit and says what to add', async () => {
    wardrobe = [mk(1, 'tops', ['work']), mk(3, 'bottoms', ['work']), mk(5, 'shoes', ['work'])]
    mockCreate.mockResolvedValue(reply([outfit([id(1), id(3), id(5)])]))
    const res = await call({ occasion: 'work' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.suggestions).toHaveLength(1)
    expect(json.limited).toBe(true)
    expect(json.missing).toEqual(['tops'])
    expect(json.message).toBe('Your clothes make 1 different work outfit. Add another work top for more.')
    expect(mockCreate.mock.calls[0]![0].messages[0].content).toContain('Build 1 different complete outfit for')
  })

  it('1/1/1 plus jackets and a watch still returns 1 outfit, not 3 jacket variations', async () => {
    wardrobe = [mk(1, 'tops', ['work']), mk(3, 'bottoms', ['work']), mk(5, 'shoes', ['work']), mk(7, 'outerwear', ['work']), mk(8, 'outerwear', null), mk(9, 'accessories', null)]
    mockCreate.mockResolvedValue(reply([outfit([id(1), id(3), id(5), id(7)]), outfit([id(1), id(3), id(5), id(8)])]))
    const json = await (await call({ occasion: 'work' })).json()
    expect(json.suggestions).toHaveLength(1)
    expect(json.message).toContain('Add another work top')
  })

  it('2 tops + 1 bottom + 1 pair of shoes: returns 2 outfits and asks for trousers', async () => {
    wardrobe = [mk(1, 'tops', ['work']), mk(2, 'tops', ['work']), mk(3, 'bottoms', ['work']), mk(5, 'shoes', ['work'])]
    mockCreate.mockResolvedValue(reply([outfit([id(1), id(3), id(5)]), outfit([id(2), id(3), id(5)])]))
    const json = await (await call({ occasion: 'work' })).json()
    expect(json.suggestions).toHaveLength(2)
    expect(json.missing).toEqual(['bottoms'])
    expect(json.message).toContain('Add another work pair of trousers or a skirt')
  })

  it('3 or more possible: returns 3 with no limit flag', async () => {
    const json = await (await call({ occasion: 'formal' })).json()
    expect(json.suggestions).toHaveLength(3)
    expect(json.limited).toBeUndefined()
  })

  it('does not return the same outfit twice', async () => {
    mockCreate.mockResolvedValue(reply([outfit([id(1), id(3), id(5)]), outfit([id(5), id(3), id(1)]), outfit([id(2), id(4), id(6)])]))
    const res = await call({ occasion: 'formal' })
    const { suggestions, message, missing } = await res.json()
    expect(suggestions).toHaveLength(2)
    expect(message).toContain('Only 2 of 3')
    expect(missing).toHaveLength(1)
  })

  it('only calls the Anthropic model (no other service is imported by this flow)', async () => {
    await call({ occasion: 'formal' })
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})
