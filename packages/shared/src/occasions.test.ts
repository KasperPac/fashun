import { describe, it, expect } from 'vitest'
import { OCCASIONS, OCCASION_LABELS } from './types'
import { isOccasionTag, sanitiseOccasionTags, occasionFromText } from './occasions'

describe('occasions', () => {
  it('has exactly the four occasions with display labels', () => {
    expect(OCCASIONS).toEqual(['casual', 'smart-casual', 'work', 'formal'])
    expect(OCCASION_LABELS).toEqual({
      casual: 'Casual', 'smart-casual': 'Smart casual', work: 'Work', formal: 'Formal',
    })
  })

  it('isOccasionTag rejects old and unknown values', () => {
    expect(isOccasionTag('formal')).toBe(true)
    expect(isOccasionTag('dinner')).toBe(false)
    expect(isOccasionTag('event')).toBe(false)
    expect(isOccasionTag(undefined)).toBe(false)
  })

  it('sanitiseOccasionTags filters, dedupes and orders', () => {
    expect(sanitiseOccasionTags(['formal', 'dinner', 'casual', 'formal'])).toEqual(['casual', 'formal'])
    expect(sanitiseOccasionTags([])).toEqual([])
    expect(sanitiseOccasionTags(null)).toEqual([])
    expect(sanitiseOccasionTags('casual')).toEqual([])
  })

  it('occasionFromText maps free-form text', () => {
    expect(occasionFromText('Weekend brunch')).toBe('casual')
    expect(occasionFromText('Work meeting')).toBe('work')
    expect(occasionFromText('Dinner')).toBe('smart-casual')
    expect(occasionFromText('Smart casual')).toBe('smart-casual')
    expect(occasionFromText('Wedding guest')).toBe('formal')
    expect(occasionFromText('event')).toBe('formal')
    expect(occasionFromText('Formal')).toBe('formal')
  })

  it('occasionFromText does not read "informal" as formal, and maps semi-formal and party to smart-casual', () => {
    expect(occasionFromText('Informal')).toBe('casual')
    expect(occasionFromText('Informal gathering')).toBe('casual')
    expect(occasionFromText('Semi-formal')).toBe('smart-casual')
    expect(occasionFromText('Party')).toBe('smart-casual')
  })

  it('occasionFromText returns null for blank, non-string or unmatched', () => {
    expect(occasionFromText('')).toBeNull()
    expect(occasionFromText('   ')).toBeNull()
    expect(occasionFromText(null)).toBeNull()
    expect(occasionFromText('Skiing')).toBeNull()
    expect(occasionFromText('Workout')).toBeNull()
  })
})
