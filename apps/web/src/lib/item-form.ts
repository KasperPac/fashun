import { OCCASIONS } from '@fashun/shared'
import type { OccasionTag, WardrobeCategory } from '@fashun/shared'

export interface ReviewValues {
  name: string
  category: WardrobeCategory
  colours: string[]
  occasions: OccasionTag[]
}

export type ReviewErrors = Partial<Record<'name' | 'colours' | 'occasions', string>>

/** Checks the review form on Save. An empty result means it can be saved. */
export function validateReview(values: ReviewValues): ReviewErrors {
  const errors: ReviewErrors = {}
  if (!values.name.trim()) errors.name = "Give it a name, like 'Navy chinos'."
  if (values.colours.length === 0) errors.colours = 'Add at least one colour so we can match it to your palette.'
  if (values.occasions.length === 0) errors.occasions = 'Pick at least one occasion so we know when to suggest it.'
  return errors
}

/** Adds or removes an occasion, keeping the canonical order. */
export function toggleOccasion(current: OccasionTag[], occasion: OccasionTag): OccasionTag[] {
  const next = current.includes(occasion) ? current.filter((o) => o !== occasion) : [...current, occasion]
  return OCCASIONS.filter((o) => next.includes(o))
}

/** Adds a colour once (case-insensitive); removes it by value. */
export function addColour(current: string[], hex: string): string[] {
  return current.some((c) => c.toLowerCase() === hex.toLowerCase()) ? current : [...current, hex]
}

export function removeColour(current: string[], hex: string): string[] {
  return current.filter((c) => c.toLowerCase() !== hex.toLowerCase())
}

/** "https://www.zara.com/au/en/x" -> "zara.com". Null when the value isn't a web address. */
export function shopDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const { hostname, protocol } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return null
    return hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** A pasted value that is a web address, or null. Trims whitespace. */
export function asWebUrl(value: string): string | null {
  const text = value.trim()
  return shopDomain(text) ? text : null
}

/** "Suggested: Casual, Smart casual", or null when nothing was suggested. */
export function suggestedLine(suggested: OccasionTag[], labels: Record<OccasionTag, string>): string | null {
  const names = OCCASIONS.filter((o) => suggested.includes(o)).map((o) => labels[o])
  return names.length > 0 ? `Suggested: ${names.join(', ')}` : null
}
