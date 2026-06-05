/**
 * Blocks SSRF to loopback / private / link-local hosts and non-http(s) schemes.
 * Used before any server-side fetch of a user/3rd-party-supplied URL.
 */
export function isPubliclyFetchable(rawUrl: string): boolean {
  let u: URL
  try { u = new URL(rawUrl) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  // IPv6 loopback / unspecified
  if (host === '::1' || host === '[::1]' || host === '::') return false
  // IPv4 literal private / loopback / link-local ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 127 || a === 10 || a === 0) return false
    if (a === 169 && b === 254) return false           // link-local
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
  }
  return true
}
