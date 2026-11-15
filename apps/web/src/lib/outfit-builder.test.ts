import { describe, it, expect } from 'vitest'
import { describeShortfall, eligibleItems, isEligibleForOccasion, validateSuggestions, type OwnedItem } from './outfit-builder'

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

describe('eligibleItems', () => {
  it('filters by occasion', () => {
    const items = [item('a', 'tops', ['casual']), item('b', 'tops', ['formal'])]
    expect(eligibleItems(items, 'formal').map(i => i.id)).toEqual(['b'])
  })
})
