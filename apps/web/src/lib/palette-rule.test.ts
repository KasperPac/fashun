import { describe, it, expect } from 'vitest'
import { isInPaletteColour, isOffPalettePiece, isOutsidePalette } from './palette-rule'
import { paletteLine } from './wardrobe-view'

describe('palette rule', () => {
  it('judges a piece by whether any colour passes the season', () => {
    expect(isOutsidePalette(['#2E5C9E', '#FFFFFF'], 'autumn')).toBe(true)
    expect(isOutsidePalette(['#D2691E', '#2E5C9E'], 'autumn')).toBe(false)
    expect(isOutsidePalette([], 'autumn')).toBe(false)
    expect(isOutsidePalette(['nope'], 'autumn')).toBe(false)
  })
  it('treats a saved avoid colour as off-palette and not in the palette', () => {
    expect(isOffPalettePiece(['#CD853F'], 'autumn')).toBe(false)
    expect(isOffPalettePiece(['#cd853f'], 'autumn', ['#CD853F'])).toBe(true)
    expect(isInPaletteColour('#CD853F', 'autumn', ['#cd853f'])).toBe(false)
    expect(isInPaletteColour('#D2691E', 'autumn')).toBe(true)
  })
  it('agrees with the wardrobe screen line', () => {
    expect(paletteLine(['#2E5C9E', '#FFFFFF'], 'autumn')).toContain('Outside your Autumn palette')
    expect(paletteLine(['#D2691E'], 'autumn')).toBe('✓ In your Autumn palette')
  })
})
