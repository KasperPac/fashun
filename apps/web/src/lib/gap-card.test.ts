import { describe, it, expect } from 'vitest'
import { priceText, priceSpoken, dayAndMonth, photoHref, andList, orList } from './gap-card'

describe('gap card wording', () => {
  it('writes prices with no cents when whole', () => {
    expect(priceText(35)).toBe('A$35')
    expect(priceText(49.95)).toBe('A$49.95')
    expect(priceText(49.5)).toBe('A$49.50')
    expect(priceText(1200)).toBe('A$1,200')
    expect(priceSpoken(35)).toBe('35 Australian dollars')
  })
  it('names the day and month', () => {
    expect(dayAndMonth('2026-12-01')).toBe('1 December')
    expect(dayAndMonth('2027-01-01')).toBe('1 January')
  })
  it('joins shop lists', () => {
    expect(andList(['A', 'B', 'C'])).toBe('A, B and C')
    expect(orList(['A', 'B', 'C'])).toBe('A, B or C')
    expect(andList(['A'])).toBe('A')
  })
  it('has no photo address when the item has no photo', () => {
    expect(photoHref('work', 'shoes', null)).toBeNull()
  })
})
