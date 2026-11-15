import { describe, it, expect } from 'vitest'
import { filterSaved, joinPieces, noSavedMessage, savedCountLabel, savedDate, savedOn } from './saved-outfits'

describe('joinPieces', () => {
  const wardrobe = new Map([['a', { category: 'tops', imageUrl: 'https://img/a.png' }]])
  it('adds category and photo from the wardrobe', () => {
    const [p] = joinPieces([{ label: 'Navy shirt', colour_hex: '#000080', item_id: 'a', in_wardrobe: true }], wardrobe)
    expect(p).toEqual({ label: 'Navy shirt', colourHex: '#000080', itemId: 'a', category: 'tops', imageUrl: 'https://img/a.png', removed: false })
  })
  it('marks a piece whose wardrobe item was deleted as removed, keeping its label', () => {
    const [p] = joinPieces([{ label: 'Old boots', colour_hex: '#111111', item_id: 'gone', in_wardrobe: true }], wardrobe)
    expect(p).toMatchObject({ label: 'Old boots', removed: true, category: null, imageUrl: null })
  })
  it('does not mark v1 suggestions with no item as removed', () => {
    const [p] = joinPieces([{ label: 'Rust shirt', colour_hex: '#B7410E', item_id: null, in_wardrobe: false }], wardrobe)
    expect(p.removed).toBe(false)
  })
  it('copes with a missing label, a bad colour and a non-array', () => {
    const [p] = joinPieces([{ label: '  ', item_id: '' }], wardrobe)
    expect(p).toMatchObject({ label: 'Piece', colourHex: '#888888', itemId: null, removed: false })
    expect(joinPieces(null, wardrobe)).toEqual([])
    expect(joinPieces({}, wardrobe)).toEqual([])
  })
})

describe('savedDate', () => {
  it('formats as day and month', () => {
    expect(savedOn('2026-11-16T10:00:00')).toBe('Saved 16 Nov')
    expect(savedDate('2026-01-05T23:59:00')).toBe('5 Jan')
  })
  it('does not print NaN for a bad date', () => {
    expect(savedDate('not a date')).toBe('')
    expect(savedOn('')).toBe('Saved')
  })
})

describe('filterSaved and noSavedMessage', () => {
  const list = [{ occasion: 'formal' as const }, { occasion: 'work' as const }, { occasion: null }]
  it('filters by occasion; all keeps everything, including untagged', () => {
    expect(filterSaved(list, 'all')).toHaveLength(3)
    expect(filterSaved(list, 'formal')).toEqual([{ occasion: 'formal' }])
    expect(filterSaved(list, 'casual')).toEqual([])
  })
  it('words the empty states', () => {
    expect(noSavedMessage('formal')).toBe('No saved Formal outfits.')
    expect(noSavedMessage('smart-casual')).toBe('No saved Smart casual outfits.')
    expect(noSavedMessage('all')).toBe('No saved outfits yet')
  })
})

describe('savedCountLabel', () => {
  it('hides the count when there are none', () => {
    expect(savedCountLabel(0)).toBeNull()
  })
  it('words one and many', () => {
    expect(savedCountLabel(1)).toBe('1 outfit')
    expect(savedCountLabel(3)).toBe('3 outfits')
  })
})
