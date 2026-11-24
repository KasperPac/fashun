/**
 * Colour words shops put in a listing title, each mapped to a palette reference colour
 * (the same hexes colour-names.ts uses), so a title's word can be matched against the user's palette.
 */
const WORDS: Array<[RegExp, string]> = [
  [/black/i, '#000000'],
  [/white/i, '#FFFFFF'],
  [/navy/i, '#000080'],
  [/khaki|olive/i, '#808000'],
  [/burgundy|maroon/i, '#800020'],
  [/charcoal/i, '#36454F'],
  [/grey|gray/i, '#808080'],
  [/beige|stone|oatmeal/i, '#F5F5DC'],
  [/cream|ivory/i, '#FFFDD0'],
  [/tan/i, '#C19A6B'],
  [/camel/i, '#CD853F'],
  [/brown|chocolate/i, '#6B4226'],
  [/rust/i, '#D2691E'],
  [/mustard/i, '#8B6914'],
  [/red/i, '#DC143C'],
  [/pink/i, '#F4A6C0'],
  [/purple/i, '#7B3FA0'],
  [/lilac|lavender/i, '#C8A2C8'],
  [/orange/i, '#E87722'],
  [/yellow/i, '#F2D024'],
  [/green/i, '#2E8B57'],
  [/sky blue|light blue/i, '#87CEEB'],
  [/blue/i, '#2255CC'],
]

/**
 * The colour a listing title names, as "#RRGGBB", or null when it names none or names
 * more than one (a two-colour item is left to the photo reading). Whole words only.
 */
export function titleColour(title: string): string | null {
  const text = title.replace(/[-–—/,()]/g, ' ')
  const found = new Set<string>()
  for (const [re, hex] of WORDS) {
    const word = new RegExp(`\\b(?:${re.source})\\b`, 'i')
    if (word.test(text)) found.add(hex)
  }
  // "Sky blue" also contains "blue": the more specific word wins.
  if (found.has('#87CEEB')) found.delete('#2255CC')
  return found.size === 1 ? [...found][0] : null
}
