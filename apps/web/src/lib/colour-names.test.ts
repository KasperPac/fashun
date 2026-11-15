import { describe, it, expect } from 'vitest'
import { getProfileColours, type ColourSeason } from '@fashun/shared'
import { COLOUR_OPTIONS, colourName, searchColours } from './colour-names'

describe('colourName', () => {
  it('names a known palette colour, ignoring case and whitespace', () => {
    expect(colourName('#d2691e')).toBe('Rust')
    expect(colourName(' #000080 ')).toBe('Navy')
  })

  it('finds the nearest plain name for an unknown colour', () => {
    expect(colourName('#0A0A0A')).toBe('Black')
    expect(colourName('#FAFAFA')).toBe('White')
  })

  it('never returns a hex code, even for invalid input', () => {
    expect(colourName('not-a-colour')).toBe('Unnamed colour')
    expect(colourName('')).toBe('Unnamed colour')
  })

  it('has a name for every colour in every season profile', () => {
    const seasons: ColourSeason[] = ['spring', 'summer', 'autumn', 'winter']
    for (const season of seasons) {
      const { best, avoid } = getProfileColours(season)
      for (const hex of [...best, ...avoid]) {
        expect(colourName(hex)).not.toMatch(/^#|Unnamed/)
      }
    }
  })
})

describe('searchColours', () => {
  it('returns all named colours for an empty or blank query', () => {
    expect(searchColours('')).toHaveLength(COLOUR_OPTIONS.length)
    expect(searchColours('   ')).toHaveLength(COLOUR_OPTIONS.length)
  })
  it('matches part of a name, ignoring case', () => {
    expect(searchColours('NAV').map((c) => c.name)).toContain('Navy')
    expect(searchColours('zzzz')).toEqual([])
  })
  it('has one entry per name and a valid hex each', () => {
    const names = COLOUR_OPTIONS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    expect(COLOUR_OPTIONS.every((c) => /^#[0-9A-F]{6}$/i.test(c.hex))).toBe(true)
  })
})
