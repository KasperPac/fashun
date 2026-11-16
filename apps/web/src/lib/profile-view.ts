import type { ColourSeason, StylePref } from '@fashun/shared'

export const SEASON_NAMES: Record<ColourSeason, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
}

export const STYLE_NAMES: Record<StylePref, string> = {
  casual: 'Casual',
  'smart-casual': 'Smart casual',
  business: 'Business',
  streetwear: 'Streetwear',
  minimalist: 'Minimalist',
  athleisure: 'Athleisure',
  bohemian: 'Bohemian',
  glam: 'Glam',
}

export const SKIN_TONE_NAMES = { light: 'Light', medium: 'Medium', deep: 'Deep' } as const
export const UNDERTONE_NAMES = { warm: 'Warm', cool: 'Cool', neutral: 'Neutral' } as const

export const NOT_SURE = 'Not sure. Tap to set it.'

/** "dark-brown" -> "Dark brown". Empty or missing values read as not detected. */
export function traitLabel(value: string | null | undefined): string {
  const clean = value?.trim()
  if (!clean) return NOT_SURE
  const spaced = clean.replace(/-/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** "You're an Autumn", "You're a Winter". */
export function seasonHeadline(season: ColourSeason): string {
  const name = SEASON_NAMES[season]
  return `You're ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`
}
