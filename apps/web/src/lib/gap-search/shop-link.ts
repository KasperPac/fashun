import { normaliseShopName } from './shop-names'
import { ProductSourceError } from './product-source'

const ENDPOINT = 'https://serpapi.com/search.json'
const SEARCH_TIMEOUT_MS = 12_000
const GENERIC_SECOND_LEVEL = new Set(['com', 'net', 'org', 'co', 'gov', 'edu'])

/** Shops whose web address is not their name. Keys and values are normalised. */
const HOST_ALIASES: Record<string, readonly string[]> = { handm: ['hm'] }

/** "https://www2.hm.com/en_au/x" -> "hm"; "kmart.com.au" -> "kmart". Null when it is not an https address. */
function hostLabel(link: string): string | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const parts = url.hostname.toLowerCase().split('.')
  if (parts.length < 2) return null
  parts.pop()
  if (parts.length > 1 && GENERIC_SECOND_LEVEL.has(parts[parts.length - 1])) parts.pop()
  return parts[parts.length - 1] ?? null
}

/**
 * True only for an https address on the named shop's own website (kmart.com.au, www.kmart.com.au and
 * shop.kmart.com.au for "Kmart"). Google and any other host, including look-alikes such as
 * kmart.example.com, are refused.
 */
export function linkBelongsToShop(link: string | null | undefined, shop: string): boolean {
  if (!link) return false
  const label = hostLabel(link)
  const wanted = normaliseShopName(shop)
  if (!label || !wanted) return false
  const normLabel = label.replace(/[^a-z0-9]/g, '')
  return normLabel === wanted || (HOST_ALIASES[wanted] ?? []).includes(normLabel)
}

/** The first web result on the shop's own site, from one Google search. Null when there is none. */
export async function searchShopLink(item: { title: string; shop: string }): Promise<string | null> {
  const key = process.env.SERPAPI_API_KEY
  if (!key) throw new ProductSourceError('SERPAPI_API_KEY is not set')
  const params = new URLSearchParams({
    engine: 'google', q: `${item.title} ${item.shop}`, gl: 'au', hl: 'en',
    location: 'Australia', google_domain: 'google.com.au', num: '10', api_key: key,
  })
  let res: Response
  try {
    res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) })
  } catch {
    throw new ProductSourceError('Product search could not be reached')
  }
  if (!res.ok) throw new ProductSourceError(`Product search failed (HTTP ${res.status})`)
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new ProductSourceError('Product search returned an unreadable answer')
  }
  const results = (data as { organic_results?: unknown } | null)?.organic_results
  if (!Array.isArray(results)) return null
  for (const r of results) {
    const link = (r as { link?: unknown } | null)?.link
    if (typeof link === 'string' && linkBelongsToShop(link, item.shop)) return link
  }
  return null
}

