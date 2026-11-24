import type { ColourSeason } from '@fashun/shared'
import { colourName } from '../colour-names'
import { SEASON_NAMES } from '../profile-view'

/** The user's palette as the Palette screen shows it. */
export interface GapPalette {
  season: ColourSeason
  best: string[]
  avoid: string[]
}

/** Reads one photo and returns its main colour as "#RRGGBB", or null when it can't say (unsure, pattern, several colours). Throws when the photo can't be read or the AI call fails. */
export type ColourTagger = (imageUrl: string) => Promise<string | null>

/** Thrown when no photo in the batch could be tagged, so there is nothing trustworthy to show. */
export class ColourTaggingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ColourTaggingError'
  }
}

/** At most this many candidates are tagged per search. */
export const MAX_TAGGED = 12

/** How far a reading may be from a palette colour (distance in RGB) and still count as that colour. */
const MATCH_DISTANCE = 90

/** A colour word in a title must be this close to the best colour it matches, so the reason line never names a different colour from the title's. */
export const TITLE_MATCH_DISTANCE = 40

const HEX = /^#[0-9A-F]{6}$/i

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value.trim())
}

function distance(a: string, b: string): number {
  const channel = (hex: string, i: number) => parseInt(hex.trim().slice(1 + i * 2, 3 + i * 2), 16)
  return Math.sqrt([0, 1, 2].reduce((sum, i) => sum + (channel(a, i) - channel(b, i)) ** 2, 0))
}

/**
 * The user's best colour a reading counts as, or null. The reading is matched to the nearest
 * colour among the best and avoid lists; it must be close enough, and that colour must be a best
 * one. A reading nearest an avoid colour, or near neither list, is not kept.
 */
export function matchBestColour(reading: string, palette: Pick<GapPalette, 'best' | 'avoid'>, maxDistance = MATCH_DISTANCE): string | null {
  if (!isHex(reading)) return null
  let nearest: { hex: string; best: boolean; d: number } | null = null
  const consider = (hex: string, best: boolean) => {
    if (!isHex(hex)) return
    const d = distance(reading, hex)
    // On a tie the avoid colour wins, so a doubtful reading is dropped.
    if (!nearest || d < nearest.d || (d === nearest.d && !best)) nearest = { hex, best, d }
  }
  for (const hex of palette.best) consider(hex, true)
  for (const hex of palette.avoid) consider(hex, false)
  const found = nearest as { hex: string; best: boolean; d: number } | null
  return found && found.best && found.d <= maxDistance ? found.hex.toUpperCase() : null
}

/** "Navy, one of your Winter colours." */
export function reasonLine(bestHex: string, season: ColourSeason): string {
  return `${colourName(bestHex)}, one of your ${SEASON_NAMES[season]} colours.`
}
