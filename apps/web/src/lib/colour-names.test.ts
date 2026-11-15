import { describe, it, expect } from 'vitest'
import { getProfileColours, type ColourSeason } from '@fashun/shared'
import { colourName } from './colour-names'

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
