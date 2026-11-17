/**
 * Image search (SerpAPI Google Lens) and background removal (Photoroom) are paid
 * extras behind one switch: off unless ENABLE_PAID_EXTRAS is exactly "true".
 * Try-on (FASHN) has its own switch, tryOnEnabled(), and is not turned on by this one.
 */
export function paidExtrasEnabled(): boolean {
  return process.env.ENABLE_PAID_EXTRAS === 'true'
}

/** Try-on is off unless ENABLE_TRY_ON is exactly "true". Independent of ENABLE_PAID_EXTRAS. */
export function tryOnEnabled(): boolean {
  return process.env.ENABLE_TRY_ON === 'true'
}

/** Gap suggestions (product search for wardrobe gaps) are off unless ENABLE_GAP_SUGGESTIONS is exactly "true". Independent of the other two switches. */
export function gapSuggestionsEnabled(): boolean {
  return process.env.ENABLE_GAP_SUGGESTIONS === 'true'
}
