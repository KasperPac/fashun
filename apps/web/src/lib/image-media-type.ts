export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/**
 * Detects an image's media type from its base64 header. Anthropic rejects a
 * base64 image whose declared media_type doesn't match its bytes (HTTP 400), so
 * callers must declare the real type rather than assuming one. Phone photos are
 * usually JPEG, so that's the default for anything unrecognised.
 */
export function mediaTypeFromBase64(b64: string): ImageMediaType {
  if (b64.startsWith('/9j')) return 'image/jpeg'
  if (b64.startsWith('iVBOR')) return 'image/png'
  if (b64.startsWith('UklGR')) return 'image/webp'
  if (b64.startsWith('R0lGOD')) return 'image/gif'
  return 'image/jpeg'
}
