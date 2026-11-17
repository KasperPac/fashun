import { describe, it, expect } from 'vitest'
import { wardrobeGaps, type GapItem } from './wardrobe-gaps'

const item = (id: string, category: string, occasion_tags: string[] | null, ownership: string = 'owned'): GapItem =>
  ({ id, name: id, category, colours: null, occasion_tags, ownership })

const full = (tag: string) => [
  item('t1', 'tops', [tag]), item('t2', 'tops', [tag]),
  item('b1', 'bottoms', [tag]), item('b2', 'bottoms', [tag]),
  item('s1', 'shoes', [tag]), item('s2', 'shoes', [tag]),
]

describe('wardrobeGaps', () => {
  it('reports missing Work shoes', () => {
    const gaps = wardrobeGaps(full('work').filter((i) => i.category !== 'shoes'), 'work')
    expect(gaps).toEqual([{ category: 'shoes', occasion: 'work', kind: 'missing', label: 'Work shoes', card: 'No Work shoes yet' }])
  })
  it('reports an only-one Casual top, and nothing with two of each', () => {
    const items = full('casual').filter((i) => i.id !== 't2')
    expect(wardrobeGaps(items, 'casual')).toEqual([
      { category: 'tops', occasion: 'casual', kind: 'only-one', label: 'another Casual top', card: 'another Casual top' },
    ])
    expect(wardrobeGaps(full('casual'), 'casual')).toEqual([])
  })
  it('words only-one bottoms and shoes', () => {
    const items = [item('t1', 'tops', null), item('t2', 'tops', null), item('b', 'bottoms', null), item('s', 'shoes', null)]
    expect(wardrobeGaps(items, 'work').map((g) => g.label)).toEqual(['another Work bottom', 'another pair of Work shoes'])
  })
  it('reports everything missing for an empty wardrobe', () => {
    expect(wardrobeGaps([], 'formal').map((g) => [g.category, g.kind, g.card])).toEqual([
      ['tops', 'missing', 'No Formal tops yet'],
      ['bottoms', 'missing', 'No Formal bottoms yet'],
      ['shoes', 'missing', 'No Formal shoes yet'],
    ])
  })
  it('never counts wishlist items as owned', () => {
    const items = [...full('work').filter((i) => i.category !== 'shoes'), item('w1', 'shoes', ['work'], 'wishlist'), item('w2', 'shoes', ['work'], 'wishlist')]
    expect(wardrobeGaps(items, 'work').map((g) => [g.category, g.kind])).toEqual([['shoes', 'missing']])
    const one = [...full('work'), item('w3', 'tops', ['work'], 'wishlist')].filter((i) => i.id !== 't2')
    expect(wardrobeGaps(one, 'work').map((g) => [g.category, g.kind])).toEqual([['tops', 'only-one']])
  })
  it('ignores outerwear, bags and accessories', () => {
    const extras = [item('o', 'outerwear', null), item('g', 'bags', null), item('a', 'accessories', null)]
    expect(wardrobeGaps([...full('work'), ...extras], 'work')).toEqual([])
    expect(wardrobeGaps(extras, 'work').map((g) => g.category)).toEqual(['tops', 'bottoms', 'shoes'])
  })
  it('respects occasion eligibility', () => {
    expect(wardrobeGaps(full('casual'), 'formal').map((g) => g.kind)).toEqual(['missing', 'missing', 'missing'])
  })
})
