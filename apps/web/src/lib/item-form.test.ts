import { describe, it, expect } from 'vitest'
import { OCCASION_LABELS } from '@fashun/shared'
import { addColour, asWebUrl, removeColour, shopDomain, suggestedLine, toggleOccasion, validateReview } from './item-form'

const ok = { name: 'Navy chinos', category: 'bottoms' as const, colours: ['#000080'], occasions: ['work' as const] }

describe('validateReview', () => {
  it('passes a complete form', () => {
    expect(validateReview(ok)).toEqual({})
  })
  it('asks for a name, treating whitespace as empty', () => {
    expect(validateReview({ ...ok, name: '   ' }).name).toBe("Give it a name, like 'Navy chinos'.")
  })
  it('asks for a colour and an occasion', () => {
    const e = validateReview({ ...ok, colours: [], occasions: [] })
    expect(e.colours).toBe('Add at least one colour so we can match it to your palette.')
    expect(e.occasions).toBe('Pick at least one occasion so we know when to suggest it.')
  })
  it('reports every problem at once', () => {
    expect(Object.keys(validateReview({ ...ok, name: '', colours: [], occasions: [] }))).toHaveLength(3)
  })
})

describe('toggleOccasion', () => {
  it('adds in canonical order and removes', () => {
    expect(toggleOccasion(['formal'], 'casual')).toEqual(['casual', 'formal'])
    expect(toggleOccasion(['casual', 'formal'], 'casual')).toEqual(['formal'])
    expect(toggleOccasion([], 'work')).toEqual(['work'])
  })
})

describe('colour list', () => {
  it('adds once ignoring case, and removes ignoring case', () => {
    expect(addColour(['#abcdef'], '#ABCDEF')).toEqual(['#abcdef'])
    expect(addColour([], '#000080')).toEqual(['#000080'])
    expect(removeColour(['#ABCDEF', '#000080'], '#abcdef')).toEqual(['#000080'])
    expect(removeColour([], '#000080')).toEqual([])
  })
})

describe('shopDomain / asWebUrl', () => {
  it('reads the shop name from a link', () => {
    expect(shopDomain('https://www.zara.com/au/en/shirt.html')).toBe('zara.com')
    expect(shopDomain('http://shop.example.co.uk/x')).toBe('shop.example.co.uk')
  })
  it('rejects things that are not web links', () => {
    expect(shopDomain('')).toBeNull()
    expect(shopDomain(null)).toBeNull()
    expect(shopDomain('not a url')).toBeNull()
    expect(shopDomain('javascript:alert(1)')).toBeNull()
    expect(asWebUrl('  hello ')).toBeNull()
    expect(asWebUrl('  https://a.com/x ')).toBe('https://a.com/x')
  })
})

describe('suggestedLine', () => {
  it('lists suggestions in order, or nothing', () => {
    expect(suggestedLine(['smart-casual', 'casual'], OCCASION_LABELS)).toBe('Suggested: Casual, Smart casual')
    expect(suggestedLine([], OCCASION_LABELS)).toBeNull()
  })
})
