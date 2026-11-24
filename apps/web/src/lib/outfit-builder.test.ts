import { describe, it, expect } from 'vitest'
import { describeFewer, describeShortfall, possibleOutfitCount, eligibleItems, finaliseReason, isEligibleForOccasion, missingCategories, presentCategories, validateSuggestions, type OwnedItem } from './outfit-builder'

const item = (id: string, category: string, occasion_tags: string[] | null, colours: string[] | null = ['#112233']): OwnedItem =>
  ({ id, name: id, category, colours, occasion_tags })

describe('isEligibleForOccasion', () => {
  it.each([
    [['casual'], 'formal', false],
    [['casual', 'casual'], 'formal', false],
    [['casual', 'formal'], 'formal', true],
    [['formal'], 'casual', false],
    [['formal', 'work'], 'casual', true],
    [[], 'formal', true],
    [null, 'casual', true],
    [['casual'], 'work', true],
    [['formal'], 'smart-casual', true],
  ] as const)('tags %j for %s -> %s', (tags, occasion, expected) => {
    expect(isEligibleForOccasion({ occasion_tags: tags ? [...tags] : null }, occasion)).toBe(expected)
  })
})

describe('describeShortfall', () => {
  it('names every missing category', () => {
    expect(describeShortfall([item('a', 'tops', ['formal'])], 'formal'))
      .toBe('Not enough formal clothes yet. Add a pair of formal trousers or a skirt and a pair of formal shoes.')
  })
  it('is null with enough for 3 different outfits', () => {
    const items = [item('t1', 'tops', null), item('t2', 'tops', null), item('t3', 'tops', null), item('b', 'bottoms', null), item('s', 'shoes', null)]
    expect(describeShortfall(items, 'work')).toBeNull()
  })
  it('ignores items of other categories', () => {
    expect(describeShortfall([item('o', 'outerwear', null), item('x', 'bags', null)], 'work')).toContain('Add a work top')
  })
})

const set = (t: number, b: number, s: number, extra: OwnedItem[] = []): OwnedItem[] => [
  ...Array.from({ length: t }, (_, i) => item(`t${i}`, 'tops', null)),
  ...Array.from({ length: b }, (_, i) => item(`b${i}`, 'bottoms', null)),
  ...Array.from({ length: s }, (_, i) => item(`s${i}`, 'shoes', null)),
  ...extra,
]

describe('possibleOutfitCount and describeFewer', () => {
  it('1 top + 1 bottom + 1 shoes: 1 outfit, and says to add a top', () => {
    expect(possibleOutfitCount(set(1, 1, 1))).toBe(1)
    expect(describeShortfall(set(1, 1, 1), 'work')).toBeNull()
    expect(describeFewer(set(1, 1, 1), 'work')).toBe('Your clothes make 1 different work outfit. Add another work top for more.')
  })
  it('2/1/1: 2 outfits, and the advice moves on to trousers', () => {
    expect(possibleOutfitCount(set(2, 1, 1))).toBe(2)
    expect(describeFewer(set(2, 1, 1), 'work')).toBe('Your clothes make 2 different work outfits. Add another work pair of trousers or a skirt for more.')
  })
  it('3 or more outfits: capped at 3 and no message', () => {
    for (const [t, b, s] of [[3, 1, 1], [2, 2, 1], [2, 2, 2], [5, 5, 5]]) {
      expect(possibleOutfitCount(set(t, b, s))).toBe(3)
      expect(describeFewer(set(t, b, s), 'work')).toBeNull()
    }
  })
  it('following the advice always changes it, until 3 outfits are possible', () => {
    const counts: [number, number, number] = [1, 1, 1]
    const seen = new Set<string>()
    const idx = { tops: 0, bottoms: 1, shoes: 2 } as const
    for (let guard = 0; guard < 6; guard++) {
      const items = set(...counts)
      const msg = describeFewer(items, 'work')
      if (!msg) break
      expect(seen.has(msg)).toBe(false)
      seen.add(msg)
      counts[idx[missingCategories(items)[0]]]++
    }
    expect(possibleOutfitCount(set(...counts))).toBe(3)
  })
  it('jackets, bags and a watch do not add outfits or hide the advice', () => {
    const extras = [item('j1', 'outerwear', null), item('j2', 'outerwear', null), item('w', 'accessories', null)]
    expect(possibleOutfitCount(set(1, 1, 1, extras))).toBe(1)
    expect(describeFewer(set(1, 1, 1, extras), 'work')).toContain('Add another work top')
  })
  it('is 0 / null when a top, bottom or shoes is missing', () => {
    expect(possibleOutfitCount(set(1, 0, 1))).toBe(0)
    expect(describeFewer(set(1, 0, 1), 'work')).toBeNull()
    expect(possibleOutfitCount([])).toBe(0)
  })
})

describe('validateSuggestions', () => {
  const items = [item('t1', 'tops', null), item('b1', 'bottoms', null, ['nope']), item('s1', 'shoes', null, null), item('o1', 'outerwear', null)]
  const raw = (item_ids: string[], reason = 'Autumn tones.') => ({ name: 'n', description: 'd', reason, item_ids })

  it('requires a top, bottom and shoes', () => {
    expect(validateSuggestions([raw(['t1', 'b1']), raw(['t1', 'b1', 'o1'])], items, 'work', 'autumn')).toHaveLength(0)
  })
  it('rejects outfits with ids outside the eligible set, and empty ones', () => {
    expect(validateSuggestions([raw(['t1', 'b1', 's1', 'ghost']), raw([])], items, 'work', 'autumn')).toHaveLength(0)
  })
  it('falls back to a neutral colour when the item has no valid hex', () => {
    const [o] = validateSuggestions([raw(['t1', 'b1', 's1', 'o1'])], items, 'work', 'autumn')
    expect(o.pieces.map(p => p.colour_hex)).toEqual(['#112233', '#888888', '#888888', '#112233'])
  })
  it('stops at 3 outfits', () => {
    const more = [...items, item('t2', 'tops', null), item('t3', 'tops', null), item('t4', 'tops', null)]
    const many = ['t1', 't2', 't3', 't4'].map(t => raw([t, 'b1', 's1']))
    expect(validateSuggestions(many, more, 'work', 'autumn')).toHaveLength(3)
  })
})

describe('validateSuggestions with accessories', () => {
  const items = [...set(1, 1, 1), item('j1', 'outerwear', null), item('j2', 'outerwear', null)]
  const raw = (item_ids: string[]) => ({ name: 'n', description: 'd', reason: 'r', item_ids })
  it('does not count the same top, bottom and shoes with a different jacket as another outfit', () => {
    const out = validateSuggestions([raw(['t0', 'b0', 's0']), raw(['t0', 'b0', 's0', 'j1']), raw(['t0', 'b0', 's0', 'j2'])], items, 'work', 'autumn')
    expect(out).toHaveLength(1)
  })
  it('stops at the limit', () => {
    const more = set(3, 1, 1)
    const out = validateSuggestions(['t0', 't1', 't2'].map((t) => raw([t, 'b0', 's0'])), more, 'work', 'autumn', new Set(), 2)
    expect(out).toHaveLength(2)
  })
})

describe('eligibleItems', () => {
  it('filters by occasion', () => {
    const items = [item('a', 'tops', ['casual']), item('b', 'tops', ['formal'])]
    expect(eligibleItems(items, 'formal').map(i => i.id)).toEqual(['b'])
  })
})

describe('finaliseReason', () => {
  const navy = '#000080' // outside Autumn
  const camel = '#C19A6B' // in Autumn
  const rust = '#D2691E'
  const tan = '#C19A6B'
  const blue = '#2E5C9E'
  const white = '#FFFFFF'
  it('keeps a good one-sentence reason that names the season palette', () => {
    const r = 'Rust and Camel are both in your Autumn palette, and the boots keep it warm.'
    expect(finaliseReason(r, 'autumn', [rust, camel])).toBe(r)
  })
  it('accepts "your best {Season} colours"', () => {
    const r = 'Rust is one of your best Autumn colours, and it lifts the neutrals.'
    expect(finaliseReason(r, 'autumn', [rust])).toBe(r)
  })
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['does not name the season', 'Looks sharp.'],
    ['names the season but not in the pattern', 'Rich Autumn tones.'],
    ['two sentences', 'Rust is in your Autumn palette. The boots help.'],
    ['over 140 characters', `Rust is in your Autumn palette, and ${'the shoes keep it warm '.repeat(8)}.`],
  ])('replaces a reason that is %s', (_label, reason) => {
    const out = finaliseReason(reason, 'autumn', [rust, camel])
    expect(out).toMatch(/^\w[\w ]* and \w[\w ]* are both in your Autumn palette\.$/)
    expect(out.length).toBeLessThanOrEqual(140)
  })
  it('uses one colour name, or a neutral line, and never a hex code', () => {
    expect(finaliseReason('', 'autumn', [rust, rust])).toMatch(/is one of your best Autumn colours\.$/)
    expect(finaliseReason('', 'spring', ['', 'nope'])).not.toMatch(/palette|best/i)
    expect(finaliseReason('', 'autumn', [rust])).not.toContain('#')
  })

  it('accepts an honest off-palette reason', () => {
    const r = 'The blue stripe sits outside your Autumn palette, but camel chinos and tan shoes warm it up.'
    expect(finaliseReason(r, 'autumn', [blue, white, camel, tan])).toBe(r)
  })
  it('replaces a reason that says an off-palette colour is in the palette', () => {
    const out = finaliseReason('Blue and camel are both in your Autumn palette, and the stripe adds interest.', 'autumn', [blue, white, camel])
    expect(out).toBe('Tan is one of your best Autumn colours.')
    expect(out).not.toMatch(/blue|white/i)
  })
  it('replaces "one of your best colours" for an off-palette colour', () => {
    const out = finaliseReason('Blue is one of your best Autumn colours, and tan boots ground it.', 'autumn', [blue, tan])
    expect(out).not.toMatch(/blue/i)
  })
  it('replaces an "outside" reason when nothing in the outfit is outside', () => {
    const out = finaliseReason('The rust tee sits outside your Autumn palette, but camel warms it.', 'autumn', [rust, camel])
    expect(out).toBe('Rust and Tan are both in your Autumn palette.')
  })
  it('fallback for an outfit with one in-palette colour claims only that colour', () => {
    const out = finaliseReason('', 'autumn', [blue, navy, tan])
    expect(out).toBe('Tan is one of your best Autumn colours.')
  })
  it('fallback with no in-palette colours makes no palette claim', () => {
    const out = finaliseReason('', 'autumn', [blue, navy, '#1C1C1C'])
    expect(out).not.toMatch(/palette|best/i)
    expect(out.length).toBeLessThanOrEqual(140)
    expect(out).not.toMatch(/[.!?]\s+\S/)
  })
  it('never claims a saved avoid colour is in the palette', () => {
    const out = finaliseReason('Rust and camel are both in your Autumn palette, and tan boots finish it.', 'autumn', [rust, camel], [camel])
    expect(out).toBe('Rust is one of your best Autumn colours.')
    expect(finaliseReason('', 'autumn', [camel], [camel])).not.toMatch(/palette|best/i)
  })
  it("never claims a mixed-colour piece's off-palette colour", () => {
    const out = finaliseReason('Blue and camel are both in your Autumn palette, and boots finish it.', 'autumn', [rust, blue, camel])
    expect(out).not.toMatch(/blue/i)
  })
  describe('false palette claims (KAS-628 round 1)', () => {
    const camelHex = '#CD853F'
    const tanHex = '#C19A6B'
    const stripe = [blue, white, camelHex, tanHex]
    it.each([
      'Navy and camel are both in your Autumn palette, and tan boots finish it.',
      'The navy stripe and camel are both in your Autumn palette, and tan boots finish it.',
      'The striped shirt and camel chinos are both in your Autumn palette, and tan boots finish it.',
    ])('replaces "%s" for an outfit with an off-palette shirt', (r) => {
      const out = finaliseReason(r, 'autumn', stripe)
      expect(out).not.toBe(r)
      expect(out).not.toMatch(/navy|blue|white|striped/i)
    })
    it.each([
      ['#000000', 'Black and camel are both in your Autumn palette, and the tee keeps it easy.'],
      ['#00008B', 'Navy and camel are both in your Autumn palette, and the tee keeps it easy.'],
    ])('replaces a claim when the shoes %s are off-palette', (shoes, r) => {
      const out = finaliseReason(r, 'autumn', [rust, camelHex, shoes])
      expect(out).not.toBe(r)
      expect(out).not.toMatch(/black|navy/i)
    })
    it('does not accept an honest form that does not name the off-palette colour', () => {
      const r = 'Camel sits outside your Autumn palette, but blue warms it up.'
      expect(finaliseReason(r, 'autumn', stripe)).not.toBe(r)
      const r2 = 'The striped shirt sits outside your Autumn palette, but camel warms it up.'
      expect(finaliseReason(r2, 'autumn', stripe)).not.toBe(r2)
    })
    it('does not accept a 3-digit hex code', () => {
      const r = '#FFF sits outside your Autumn palette, but camel warms it up.'
      expect(finaliseReason(r, 'autumn', stripe)).not.toBe(r)
    })
  })
  it.each(['spring', 'summer', 'autumn', 'winter'] as const)('every fallback form in %s is one short sentence with no hex', (season) => {
    const longest = ['#00008B', '#191970', '#C8A951', '#E6B89C', '#FFFACD']
    for (const hexes of [longest, longest.slice(0, 1), [], ['#00008B', '#191970']]) {
      const out = finaliseReason('', season, hexes)
      expect(out.length).toBeLessThanOrEqual(140)
      expect(out).not.toMatch(/#[0-9a-f]{3}/i)
      expect(out).not.toMatch(/[.!?]\s+\S/)
      expect(out.endsWith('.')).toBe(true)
    }
  })
  it('replaces a reason with a hex code or two sentences or over 140 characters', () => {
    const honest = 'The blue stripe sits outside your Autumn palette, but camel warms it up.'
    expect(finaliseReason('#2E5C9E sits outside your Autumn palette, but camel warms it up.', 'autumn', [blue, camel])).not.toContain('#')
    expect(finaliseReason('The blue stripe sits outside your Autumn palette. Camel warms it up.', 'autumn', [blue, camel])).toBe('Tan is one of your best Autumn colours.')
    const long = `${honest.slice(0, -1)} and ${'so very warm '.repeat(10)}.`
    expect(long.length).toBeGreaterThan(140)
    expect(finaliseReason(long, 'autumn', [blue, camel]).length).toBeLessThanOrEqual(140)
  })
  it('works for other seasons', () => {
    const peach = '#FFCBA4'
    expect(finaliseReason('White sits outside your Spring palette, but peach lifts it.', 'spring', [white, peach])).toBe('White sits outside your Spring palette, but peach lifts it.')
    expect(finaliseReason('White and peach are both in your Spring palette, and it is fresh.', 'spring', [white, peach])).not.toMatch(/white/i)
  })
})

describe('validateSuggestions with off-palette pieces', () => {
  const pieces = [
    item('shirt', 'tops', ['casual'], ['#2E5C9E', '#FFFFFF']),
    item('tee', 'tops', ['casual'], ['#D2691E']),
    item('jeans', 'bottoms', ['casual'], ['#000080']),
    item('chinos', 'bottoms', ['casual'], ['#CD853F']),
    item('boots', 'shoes', ['casual'], ['#C19A6B']),
  ]
  const sug = (ids: string[], reason: string) => ({ name: 'n', description: 'd', reason, item_ids: ids })
  it('keeps outfits with one or two off-palette pieces and an honest reason', () => {
    const honest = 'The blue stripe sits outside your Autumn palette, but camel chinos and tan boots warm it up.'
    const out = validateSuggestions([sug(['shirt', 'chinos', 'boots'], honest), sug(['shirt', 'jeans', 'boots'], 'Blue and camel are both in your Autumn palette.')], pieces, 'casual', 'autumn')
    expect(out).toHaveLength(2)
    expect(out[0]!.reason).toBe(honest)
    expect(out[1]!.reason).not.toMatch(/blue/i)
  })
  it('keeps today\'s wording for an in-palette outfit', () => {
    const r = 'Rust and camel are both in your Autumn palette, and tan boots finish it.'
    const [o] = validateSuggestions([sug(['tee', 'chinos', 'boots'], r)], pieces, 'casual', 'autumn')
    expect(o!.reason).toBe(r)
  })
  it('uses the saved avoid colours', () => {
    const r = 'Rust and camel are both in your Autumn palette, and tan boots finish it.'
    const [o] = validateSuggestions([sug(['tee', 'chinos', 'boots'], r)], pieces, 'casual', 'autumn', new Set(), 3, ['#CD853F'])
    expect(o!.reason).toBe('Rust and Tan are both in your Autumn palette.')
    expect(o!.reason).not.toMatch(/camel/i)
  })
})

describe('missingCategories and presentCategories', () => {
  it('lists every category with nothing eligible', () => {
    const eligible = [item('t', 'tops', null), item('o', 'outerwear', null)]
    expect(missingCategories(eligible)).toEqual(['bottoms', 'shoes'])
    expect(presentCategories(eligible)).toEqual(['tops'])
  })
  it('asks for the category with the fewest pieces when none is empty', () => {
    const eligible = [item('t1', 'tops', null), item('t2', 'tops', null), item('b', 'bottoms', null), item('s', 'shoes', null)]
    expect(missingCategories(eligible)).toEqual(['bottoms'])
  })
  it('handles an empty wardrobe', () => {
    expect(missingCategories([])).toEqual(['tops', 'bottoms', 'shoes'])
    expect(presentCategories([])).toEqual([])
  })
})
