import { isColourInSeason } from '@fashun/shared'
import type { ColourSeason } from '@fashun/shared'

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * The one definition of "outside the palette", used by the wardrobe screen's
 * palette line and by Style me. A piece is outside the palette when none of its
 * colours passes the season rule. Pieces with no usable colour are never judged.
 */
export function isOutsidePalette(colours: string[], season: ColourSeason): boolean {
  const valid = colours.filter((c) => HEX.test(c))
  return valid.length > 0 && !valid.some((c) => isColourInSeason(c, season))
}

/**
 * A single colour counts as in the palette only when it passes the season rule
 * and is not one of the user's saved avoid colours. Reasons may only claim
 * palette membership for these colours.
 */
export function isInPaletteColour(hex: string, season: ColourSeason, avoid: string[] = []): boolean {
  if (!HEX.test(hex)) return false
  const h = hex.toUpperCase()
  return isColourInSeason(h, season) && !avoid.some((a) => a.toUpperCase() === h)
}

/** Style me's off-palette piece: outside the palette (above), or any colour is a saved avoid colour. */
export function isOffPalettePiece(colours: string[], season: ColourSeason, avoid: string[] = []): boolean {
  const valid = colours.filter((c) => HEX.test(c))
  const avoided = valid.some((c) => avoid.some((a) => a.toUpperCase() === c.toUpperCase()))
  return avoided || isOutsidePalette(colours, season)
}
