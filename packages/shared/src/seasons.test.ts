import { describe, it, expect } from 'vitest'
import { hexToHsl, isColourInSeason, getSeasonSwatches, SEASON_DESCRIPTIONS } from './seasons'

describe('hexToHsl', () => {
  it('converts pure red', () => {
    const [h, s, l] = hexToHsl('#ff0000')
    expect(h).toBe(0)
    expect(s).toBe(100)
    expect(l).toBe(50)
  })
  it('converts a known brown', () => {
    const [h, s, l] = hexToHsl('#8B4513')
    expect(h).toBeCloseTo(25, 0)
    expect(s).toBeGreaterThan(60)
    expect(l).toBeLessThan(35)
  })
  it('converts white', () => {
    expect(hexToHsl('#ffffff')).toEqual([0, 0, 100])
  })
  it('converts black', () => {
    expect(hexToHsl('#000000')).toEqual([0, 0, 0])
  })
  it('throws on invalid hex input', () => {
    expect(() => hexToHsl('red')).toThrow('hexToHsl: expected 6-digit hex')
    expect(() => hexToHsl('#fff')).toThrow('hexToHsl: expected 6-digit hex')
  })
})

describe('isColourInSeason', () => {
  it('matches autumn earthy tones', () => {
    expect(isColourInSeason('#D2691E', 'autumn')).toBe(true)  // chocolate
    expect(isColourInSeason('#556B2F', 'autumn')).toBe(true)  // dark olive
    expect(isColourInSeason('#B0C4DE', 'autumn')).toBe(false) // light steel blue — cool
  })
  it('matches spring warm clears', () => {
    expect(isColourInSeason('#FFB347', 'spring')).toBe(true)  // peach orange
    expect(isColourInSeason('#FF9B9B', 'spring')).toBe(true)  // coral pink
    expect(isColourInSeason('#000080', 'spring')).toBe(false) // navy — wrong season
  })
  it('matches summer soft cools', () => {
    expect(isColourInSeason('#B0C4DE', 'summer')).toBe(true)  // light steel blue
    expect(isColourInSeason('#DDA0DD', 'summer')).toBe(true)  // plum/lavender
    expect(isColourInSeason('#D2691E', 'summer')).toBe(false) // chocolate — too warm
  })
  it('matches winter cool deeps', () => {
    expect(isColourInSeason('#000080', 'winter')).toBe(true)  // navy
    expect(isColourInSeason('#800020', 'winter')).toBe(true)  // burgundy
    expect(isColourInSeason('#000000', 'winter')).toBe(true)  // black (near-black rule)
    expect(isColourInSeason('#FFFFFF', 'winter')).toBe(true)  // white (near-white rule)
    expect(isColourInSeason('#C8A96E', 'winter')).toBe(false) // camel — too warm
  })
  it('does not match crimson to spring or autumn', () => {
    expect(isColourInSeason('#DC143C', 'winter')).toBe(true)
    expect(isColourInSeason('#DC143C', 'spring')).toBe(false)
    expect(isColourInSeason('#DC143C', 'autumn')).toBe(false)
  })
})

describe('getSeasonSwatches', () => {
  it('returns swatches and avoid arrays for all seasons', () => {
    const seasons = ['spring', 'summer', 'autumn', 'winter'] as const
    for (const season of seasons) {
      const { swatches, avoid } = getSeasonSwatches(season)
      expect(swatches.length).toBeGreaterThanOrEqual(8)
      expect(avoid.length).toBeGreaterThanOrEqual(3)
      swatches.forEach(s => expect(s).toMatch(/^#[0-9a-fA-F]{6}$/))
      avoid.forEach(a => expect(a).toMatch(/^#[0-9a-fA-F]{6}$/))
    }
  })

  it('every swatch passes its own season isColourInSeason check (48/48)', () => {
    const seasons = ['spring', 'summer', 'autumn', 'winter'] as const
    const failures: string[] = []
    for (const season of seasons) {
      const { swatches } = getSeasonSwatches(season)
      for (const swatch of swatches) {
        if (!isColourInSeason(swatch, season)) {
          failures.push(`${swatch} fails ${season}`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('returns shallow copies to prevent mutation', () => {
    const original = getSeasonSwatches('spring')
    original.swatches[0] = '#000000'
    original.avoid[0] = '#FFFFFF'

    const fresh = getSeasonSwatches('spring')
    expect(fresh.swatches[0]).toBe('#FFB347')
    expect(fresh.avoid[0]).toBe('#B0C4DE')
  })
})

describe('SEASON_DESCRIPTIONS', () => {
  it('has a description for all four seasons', () => {
    expect(SEASON_DESCRIPTIONS.spring).toBeTruthy()
    expect(SEASON_DESCRIPTIONS.summer).toBeTruthy()
    expect(SEASON_DESCRIPTIONS.autumn).toBeTruthy()
    expect(SEASON_DESCRIPTIONS.winter).toBeTruthy()
  })
})
