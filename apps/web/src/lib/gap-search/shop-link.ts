import { normaliseShopName } from './shop-names'
import { ProductSourceError } from './product-source'

const ENDPOINT = 'https://serpapi.com/search.json'
const SEARCH_TIMEOUT_MS = 12_000
/**
 * Each example shop's real website (normalised shop name -> hosts). A link counts only on one of these
 * hosts or a subdomain of it, so kmart.com, kmart.xyz and other look-alikes are refused.
 */
const SHOP_HOSTS: Record<string, readonly string[]> = {
  kmart: ['kmart.com.au'],
  target: ['target.com.au'],
  bigw: ['bigw.com.au'],
  uniqlo: ['uniqlo.com'],
  cottonon: ['cottonon.com'],
  handm: ['hm.com'],
  countryroad: ['countryroad.com.au'],
  myer: ['myer.com.au'],
  davidjones: ['davidjones.com'],
  theiconic: ['theiconic.com.au'],
  roddandgunn: ['roddandgunn.com'],
  rmwilliams: ['rmwilliams.com.au'],
  mjbale: ['mjbale.com'],
}

/**
 * True only for an https address on the named shop's own website (kmart.com.au, www.kmart.com.au and
 * shop.kmart.com.au for "Kmart"). Google, any other host and look-alikes such as kmart.com or
 * kmart.example.com are refused.
 */
export function linkBelongsToShop(link: string | null | undefined, shop: string): boolean {
  if (!link) return false
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false
  const hosts = SHOP_HOSTS[normaliseShopName(shop)]
  if (!hosts) return false
  const host = url.hostname.toLowerCase()
  return hosts.some((h) => host === h || host.endsWith(`.${h}`))
}

/** The shop's own web address (first host) for a shop name, or null for a shop that isn't an example shop. */
function shopHost(shop: string): string | null {
  return SHOP_HOSTS[normaliseShopName(shop)]?.[0] ?? null
}

/**
 * The first web result on the shop's own site, from one Google search limited to that site (site:host),
 * so the shop's page is found even when Google ranks other sellers first. Null when there is none.
 */
export async function searchShopLink(item: { title: string; shop: string }): Promise<string | null> {
  const key = process.env.SERPAPI_API_KEY
  if (!key) throw new ProductSourceError('SERPAPI_API_KEY is not set')
  const host = shopHost(item.shop)
  if (!host) return null
  const params = new URLSearchParams({
    engine: 'google', q: `${item.title} site:${host}`, gl: 'au', hl: 'en',
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

