import { OCCASIONS, type OccasionTag } from './types'

export function isOccasionTag(value: unknown): value is OccasionTag {
  return typeof value === 'string' && (OCCASIONS as readonly string[]).includes(value)
}

/** Keeps only valid occasions, removes duplicates, keeps the canonical order. */
export function sanitiseOccasionTags(value: unknown): OccasionTag[] {
  if (!Array.isArray(value)) return []
  return OCCASIONS.filter((o) => value.includes(o))
}

// Order matters: the first rule that matches wins. Mirrors the SQL mapping in
// supabase/migrations/006_four_occasions.sql.
const FREE_TEXT_RULES: [RegExp, OccasionTag][] = [
  [/smart[\s-]*casual|dinner|\bdate\b|cocktail|drinks|evening/i, 'smart-casual'],
  [/formal|event|wedding|gala|black[\s-]*tie|party|ceremony/i, 'formal'],
  [/\bwork\b|office|business|meeting|interview|professional/i, 'work'],
  [/casual|weekend|brunch|relax|everyday|errand|lounge/i, 'casual'],
]

/**
 * Maps a free-form occasion label (e.g. "Weekend brunch") to one of the four
 * occasions, or null when nothing fits.
 */
export function occasionFromText(value: unknown): OccasionTag | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  if (isOccasionTag(text)) return text
  for (const [re, occasion] of FREE_TEXT_RULES) {
    if (re.test(text)) return occasion
  }
  return null
}
