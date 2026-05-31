import type { ColourSeason } from './types'

/** Convert a 6-digit hex colour string to [hue(0-360), saturation(0-100), lightness(0-100)] */
export function hexToHsl(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`hexToHsl: expected 6-digit hex, got "${hex}"`)
  }
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return [0, 0, Math.round(l * 100)]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h: number
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
    case g: h = ((b - r) / d + 2) / 6; break
    default: h = ((r - g) / d + 4) / 6
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

/**
 * Returns true if the given hex colour falls within the HSL profile for the season.
 *
 * Season profiles:
 *  Spring  — warm clear hue (H 0–100 or 300–360), S > 20%, L 40–92%
 *  Autumn  — warm earthy hue (H 0–95 or 300–360), S 15–90%, L 15–65%
 *  Summer  — cool soft hue (H 90–310), S 5–72%, L 35–95%
 *  Winter  — cool blue (H 100–280) with S > 20% and L < 75%,
 *            OR cool magenta (H 280–360) with S > 20% and L < 70%,
 *            OR very dark (L < 15%),
 *            OR very pale (S < 10% and L > 85%),
 *            OR dark crimson (H ≤ 5 or H ≥ 340, L ≤ 40, S ≥ 30%),
 *            OR cool neutral mid-tone (S < 15%, L 50–80%)
 */
export function isColourInSeason(hex: string, season: ColourSeason): boolean {
  const [h, s, l] = hexToHsl(hex)

  const isWarmClearHue = h <= 100 || h >= 300
  const isWarmEarthyHue = h <= 95 || h >= 300
  const isCoolSoftHue = h >= 90 && h <= 310
  const isCoolBlueHue = h >= 100 && h <= 280
  // Note: spans 280–360, deliberately overlapping the warm-hue ranges (H≥300)
  // used only for winter deep cool crimsons/purples
  const isCoolMagentaHue = h >= 280 && h <= 360

  switch (season) {
    case 'spring':
      return isWarmClearHue && s > 20 && l >= 40 && l <= 92
        && !(h >= 335 && s > 60 && l < 60)   // exclude crimsons (winter reds)

    case 'autumn':
      return isWarmEarthyHue && s >= 15 && s <= 90 && l >= 15 && l <= 65
        && !(h >= 335 && s > 60 && l < 60)   // exclude crimsons (winter reds)

    case 'summer':
      return isCoolSoftHue && s >= 5 && s <= 72 && l >= 35 && l <= 95

    case 'winter':
      return (isCoolBlueHue && s > 20 && l < 75) ||
             (isCoolMagentaHue && s > 20 && l < 70) ||
             l < 15 ||
             (s < 10 && l > 85) ||
             ((h <= 5 || h >= 340) && l <= 40 && s >= 30) ||
             (s < 15 && l >= 50 && l <= 80)

    default:
      return false
  }
}

const SEASON_SWATCHES: Record<ColourSeason, { swatches: string[]; avoid: string[] }> = {
  spring: {
    swatches: [
      '#FFB347', '#FF9B9B', '#FFD700', '#FFFACD',
      '#C8A96E', '#FF7F50', '#98C878', '#FFDAB9',
      '#F5DEB3', '#FFA07A', '#E6B89C', '#90C070',
    ],
    avoid: ['#B0C4DE', '#36454F', '#9370DB'],
  },
  summer: {
    swatches: [
      '#DDA0DD', '#B0C4DE', '#C8A2C8', '#E6E6FA',
      '#D0A8D8', '#AFEEEE', '#A8B0C0', '#778899',
      '#D8BFD8', '#87CEEB', '#B0B0C8', '#C0B0D8',
    ],
    avoid: ['#FF6600', '#808000', '#8B4513'],
  },
  autumn: {
    swatches: [
      '#8B4513', '#D2691E', '#CD853F', '#A0522D',
      '#8B6914', '#556B2F', '#704214', '#C68642',
      '#B8860B', '#6B4226', '#8B7355', '#4A3728',
    ],
    avoid: ['#FFB6C1', '#0047AB', '#808080'],
  },
  winter: {
    swatches: [
      '#000080', '#800020', '#4B0082', '#006400',
      '#C0C0C0', '#FFFFFF', '#000000', '#DC143C',
      '#00008B', '#708090', '#191970', '#8B0000',
    ],
    avoid: ['#C19A6B', '#F5F5DC', '#C8A951'],
  },
}

/** Returns curated swatch and avoid-colour hex arrays for a given season */
export function getSeasonSwatches(season: ColourSeason): { swatches: string[]; avoid: string[] } {
  const { swatches, avoid } = SEASON_SWATCHES[season]
  return { swatches: [...swatches], avoid: [...avoid] }
}

/** One-line descriptions for the palette page hero card */
export const SEASON_DESCRIPTIONS: Record<ColourSeason, string> = {
  spring:  'Light, warm and clear — peachy, coral and camel tones',
  summer:  'Soft, cool and muted — dusty rose, lavender and powder blue',
  autumn:  'Rich, earthy and warm — rust, olive and golden tones',
  winter:  'High contrast and cool — navy, burgundy and icy white',
}
