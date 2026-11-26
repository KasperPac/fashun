import { describe, it, expect } from 'vitest'
import { TRAITS, currentOptionValue, seasonSampleColours, seasonSavedMessage, toggleStyle } from './profile-edit'

describe('trait options', () => {
  it('match what the profile API accepts', () => {
    expect(TRAITS.skin.options.map((o) => o.value)).toEqual(['light', 'medium', 'deep'])
    expect(TRAITS.undertone.options.map((o) => o.label)).toEqual(['Warm', 'Cool', 'Neutral'])
    expect(TRAITS.hair.options.find((o) => o.value === 'dark-brown')?.label).toBe('Dark brown')
    expect(TRAITS.eyes.options.map((o) => o.value)).toContain('hazel')
  })
})

describe('currentOptionValue', () => {
  it('finds the option for the shown label, case-insensitively', () => {
    expect(currentOptionValue(TRAITS.hair, 'Dark brown')).toBe('dark-brown')
    expect(currentOptionValue(TRAITS.skin, 'deep')).toBe('deep')
  })
  it('returns null for unset or unknown values', () => {
    expect(currentOptionValue(TRAITS.hair, null)).toBeNull()
    expect(currentOptionValue(TRAITS.hair, '')).toBeNull()
    expect(currentOptionValue(TRAITS.hair, 'Purple')).toBeNull()
  })
})

describe('toggleStyle', () => {
  it('adds in canonical order and removes', () => {
    expect(toggleStyle(['business'], 'casual')).toEqual(['casual', 'business'])
    expect(toggleStyle(['casual', 'business'], 'casual')).toEqual(['business'])
  })
  it('never removes the last style', () => {
    expect(toggleStyle(['glam'], 'glam')).toEqual(['glam'])
  })
})

describe('season', () => {
  it('offers four named sample colours', () => {
    const sample = seasonSampleColours('autumn')
    expect(sample).toHaveLength(4)
    expect(sample.every((c) => c.name.length > 0 && !c.name.startsWith('#'))).toBe(true)
  })
  it('words the saved banner with the new season', () => {
    expect(seasonSavedMessage('spring')).toBe('Saved. New outfits will use your Spring palette.')
  })
})
