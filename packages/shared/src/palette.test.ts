import { describe, it, expect } from 'vitest'
import { determineColourSeason } from './palette'

describe('determineColourSeason', () => {
  it.each([
    ['warm', 'light', 'spring'],
    ['warm', 'medium', 'autumn'],
    ['warm', 'deep', 'autumn'],
    ['cool', 'light', 'summer'],
    ['cool', 'medium', 'summer'],
    ['cool', 'deep', 'winter'],
    ['neutral', 'light', 'spring'],
    ['neutral', 'medium', 'spring'],
    ['neutral', 'deep', 'winter'],
  ] as const)('%s + %s = %s', (undertone, depth, expected) => {
    expect(determineColourSeason(undertone, depth)).toBe(expected)
  })
})
