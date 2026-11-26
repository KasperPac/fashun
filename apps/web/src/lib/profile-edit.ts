import { EYE_COLOURS, HAIR_COLOURS, STYLE_PREFS, getProfileColours } from '@fashun/shared'
import type { ColourSeason, StylePref } from '@fashun/shared'
import { colourName } from './colour-names'
import { SEASON_NAMES, SKIN_TONE_NAMES, STYLE_NAMES, UNDERTONE_NAMES, traitLabel } from './profile-view'

export type TraitKey = 'skin' | 'undertone' | 'hair' | 'eyes'

export interface TraitOption { value: string; label: string }

export interface TraitConfig {
  key: TraitKey
  /** Row label, e.g. "Skin tone". */
  label: string
  /** Sheet title, e.g. "Hair colour". */
  sheetTitle: string
  /** Lower-case name for the aria-label, e.g. "hair colour". */
  spoken: string
  options: TraitOption[]
  /** The profile field the choice is saved to. */
  field: 'skin_depth' | 'skin_undertone' | 'hair_colour' | 'eye_colour'
}

const fromNames = (names: Record<string, string>): TraitOption[] =>
  Object.entries(names).map(([value, label]) => ({ value, label }))
const fromSlugs = (slugs: readonly string[]): TraitOption[] => slugs.map((value) => ({ value, label: traitLabel(value) }))

export const TRAITS: Record<TraitKey, TraitConfig> = {
  skin: { key: 'skin', label: 'Skin tone', sheetTitle: 'Skin tone', spoken: 'skin tone', options: fromNames(SKIN_TONE_NAMES), field: 'skin_depth' },
  undertone: { key: 'undertone', label: 'Undertone', sheetTitle: 'Undertone', spoken: 'undertone', options: fromNames(UNDERTONE_NAMES), field: 'skin_undertone' },
  hair: { key: 'hair', label: 'Hair', sheetTitle: 'Hair colour', spoken: 'hair colour', options: fromSlugs(HAIR_COLOURS), field: 'hair_colour' },
  eyes: { key: 'eyes', label: 'Eyes', sheetTitle: 'Eye colour', spoken: 'eye colour', options: fromSlugs(EYE_COLOURS), field: 'eye_colour' },
}

/** The option whose label equals the shown value, so the sheet can tick it. Null when unset. */
export function currentOptionValue(trait: TraitConfig, shown: string | null): string | null {
  if (!shown) return null
  return trait.options.find((o) => o.label.toLowerCase() === shown.toLowerCase())?.value ?? null
}

/** Style choices are multi-select with at least one kept. Returns the same list when the last one is removed. */
export function toggleStyle(current: StylePref[], style: StylePref): StylePref[] {
  if (current.includes(style)) return current.length === 1 ? current : current.filter((s) => s !== style)
  return STYLE_PREFS.filter((s) => s === style || current.includes(s))
}

export const STYLE_OPTIONS: TraitOption[] = STYLE_PREFS.map((value) => ({ value, label: STYLE_NAMES[value] }))

export const SEASON_ORDER: ColourSeason[] = ['spring', 'summer', 'autumn', 'winter']

/** Four named swatches that show what a season looks like, e.g. "Rust, Olive, Camel, Teal". */
export function seasonSampleColours(season: ColourSeason): Array<{ hex: string; name: string }> {
  return getProfileColours(season).best.slice(0, 4).map((hex) => ({ hex, name: colourName(hex) }))
}

export function seasonSavedMessage(season: ColourSeason): string {
  return `Saved. New outfits will use your ${SEASON_NAMES[season]} palette.`
}
