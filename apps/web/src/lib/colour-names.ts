/** Plain-English names for the palette colours, so no swatch is ever shown without its name. */
const NAMED: Record<string, string> = {
  '#FFB347': 'Apricot', '#FF9B9B': 'Soft coral', '#FFD700': 'Gold', '#FFFACD': 'Lemon cream',
  '#C8A96E': 'Light camel', '#FF7F50': 'Coral', '#98C878': 'Fresh green', '#FFDAB9': 'Peach',
  '#F5DEB3': 'Wheat', '#FFA07A': 'Salmon', '#E6B89C': 'Warm blush', '#90C070': 'Apple green',
  '#B0C4DE': 'Powder blue', '#36454F': 'Charcoal', '#9370DB': 'Purple',
  '#DDA0DD': 'Soft plum', '#C8A2C8': 'Lilac', '#E6E6FA': 'Lavender', '#D0A8D8': 'Orchid',
  '#AFEEEE': 'Pale aqua', '#A8B0C0': 'Cool grey', '#778899': 'Slate', '#D8BFD8': 'Thistle',
  '#87CEEB': 'Sky blue', '#B0B0C8': 'Dusty lavender', '#C0B0D8': 'Wisteria',
  '#FF6600': 'Bright orange', '#808000': 'Olive', '#8B4513': 'Saddle brown',
  '#D2691E': 'Rust', '#CD853F': 'Camel', '#A0522D': 'Sienna', '#8B6914': 'Mustard',
  '#556B2F': 'Moss green', '#704214': 'Chocolate', '#C68642': 'Caramel', '#B8860B': 'Antique gold',
  '#6B4226': 'Coffee', '#8B7355': 'Taupe', '#4A3728': 'Dark brown',
  '#FFB6C1': 'Baby pink', '#0047AB': 'Cobalt', '#808080': 'Mid grey',
  '#000080': 'Navy', '#800020': 'Burgundy', '#4B0082': 'Indigo', '#006400': 'Forest green',
  '#C0C0C0': 'Silver', '#FFFFFF': 'White', '#000000': 'Jet black', '#DC143C': 'Crimson',
  '#00008B': 'Royal navy', '#191970': 'Midnight blue', '#8B0000': 'Deep red',
  '#C19A6B': 'Tan', '#F5F5DC': 'Beige', '#C8A951': 'Old gold',
  '#CC5500': 'Burnt orange', '#FF00FF': 'Magenta', '#D2B48C': 'Sand',
}

/** Named reference colours used to describe a colour that isn't in the table above. */
const REFERENCE: Array<[string, string]> = [
  ['Black', '#000000'], ['White', '#FFFFFF'], ['Grey', '#808080'], ['Navy', '#000080'],
  ['Blue', '#2255CC'], ['Light blue', '#87CEEB'], ['Green', '#2E8B57'], ['Olive', '#808000'],
  ['Yellow', '#F2D024'], ['Orange', '#E87722'], ['Red', '#CC2222'], ['Burgundy', '#800020'],
  ['Pink', '#F4A6C0'], ['Purple', '#7B3FA0'], ['Brown', '#6B4226'], ['Camel', '#C19A6B'],
  ['Beige', '#E8DCC0'], ['Cream', '#FFFDD0'],
]

function normalise(hex: string): string {
  return hex.trim().toUpperCase()
}

function distance(a: string, b: string): number {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return [0, 1, 2].reduce((sum, i) => sum + (channel(a, i) - channel(b, i)) ** 2, 0)
}

/** Returns a plain name for a 6-digit hex colour. Never returns the hex itself. */
export function colourName(hex: string): string {
  const key = normalise(hex)
  if (NAMED[key]) return NAMED[key]
  if (!/^#[0-9A-F]{6}$/.test(key)) return 'Unnamed colour'
  let best = REFERENCE[0]
  for (const ref of REFERENCE) {
    if (distance(key, ref[1]) < distance(key, best[1])) best = ref
  }
  return best[0]
}

export interface ColourOption { hex: string; name: string }

/** Every named colour a user can pick for a piece, one entry per name, sorted by name. */
export const COLOUR_OPTIONS: ColourOption[] = (() => {
  const byName = new Map<string, string>()
  for (const [hex, name] of Object.entries(NAMED)) if (!byName.has(name)) byName.set(name, hex)
  for (const [name, hex] of REFERENCE) if (!byName.has(name)) byName.set(name, hex)
  return [...byName].map(([name, hex]) => ({ hex, name })).sort((a, b) => a.name.localeCompare(b.name))
})()

/** Colours whose name contains the query, ignoring case and surrounding spaces. Empty query returns all. */
export function searchColours(query: string): ColourOption[] {
  const q = query.trim().toLowerCase()
  return q ? COLOUR_OPTIONS.filter((c) => c.name.toLowerCase().includes(q)) : COLOUR_OPTIONS
}
