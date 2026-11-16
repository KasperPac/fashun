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
  const navy = '#000080'
  const camel = '#C19A6B'
  it('keeps a good one-sentence reason that names the season palette', () => {
    const r = 'Navy and Camel are both in your Autumn palette, and the boots keep it warm.'
    expect(finaliseReason(r, 'autumn', [navy, camel])).toBe(r)
  })
  it('accepts "your best {Season} colours"', () => {
    const r = 'Navy is one of your best Winter colours, and the shoes sharpen it.'
    expect(finaliseReason(r, 'winter', [navy])).toBe(r)
  })
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['does not name the season', 'Looks sharp.'],
    ['names the season but not in the pattern', 'Rich Autumn tones.'],
    ['two sentences', 'Navy is in your Autumn palette. The boots help.'],
    ['over 140 characters', `Navy is in your Autumn palette, and ${'the shoes keep it warm '.repeat(8)}.`],
  ])('replaces a reason that is %s', (_label, reason) => {
    const out = finaliseReason(reason, 'autumn', [navy, camel])
    expect(out).toMatch(/^\w[\w ]* and \w[\w ]* are both in your Autumn palette\.$/)
    expect(out.length).toBeLessThanOrEqual(140)
  })
  it('uses one colour name, or none, when that is all there is, and never a hex code', () => {
    expect(finaliseReason('', 'spring', [navy, navy])).toMatch(/is one of your best Spring colours\.$/)
    expect(finaliseReason('', 'spring', ['', 'nope'])).toBe('This outfit is built from your Spring palette.')
    expect(finaliseReason('', 'spring', [navy])).not.toContain('#')
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
