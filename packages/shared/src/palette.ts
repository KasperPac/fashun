import type { ColourSeason, SkinDepth, SkinUndertone } from './types'

export function determineColourSeason(
  undertone: SkinUndertone,
  depth: SkinDepth
): ColourSeason {
  if (undertone === 'warm') return depth === 'light' ? 'spring' : 'autumn'
  if (undertone === 'cool') return depth === 'deep' ? 'winter' : 'summer'
  // neutral: depth as tiebreaker
  return depth === 'deep' ? 'winter' : 'spring'
}

export const SEASON_LABELS: Record<ColourSeason, string> = {
  spring: 'Warm Spring 🌸',
  summer: 'Cool Summer ☀️',
  autumn: 'Warm Autumn 🍂',
  winter: 'Cool Winter ❄️',
}
