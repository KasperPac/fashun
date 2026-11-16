/**
 * One switch for every paid third-party extra: try-on (Fashn.ai), image search
 * (SerpAPI Google Lens) and background removal (Photoroom).
 * Off unless ENABLE_PAID_EXTRAS is exactly "true".
 */
export function paidExtrasEnabled(): boolean {
  return process.env.ENABLE_PAID_EXTRAS === 'true'
}
