import { normaliseShopName } from './shop-names'

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

/** True for a shop we know the website of. A shop with no known website is never searched for. */
export function shopHasHost(shop: string): boolean {
  return shopHost(shop) !== null
}

/** The shop's own web address (first host) for a shop name, or null for a shop that isn't an example shop. */
function shopHost(shop: string): string | null {
  return SHOP_HOSTS[normaliseShopName(shop)]?.[0] ?? null
}

/** Why a shop link could not be found. Fixed codes only: never an error text, address or key. */
export type ShopLinkReason = 'no_token' | 'no_results' | 'no_store_on_shop_host' | 'timeout' | 'unreadable' | `http_${number}`

/** The outcome of one shop-link lookup. link is set, or reason says why not. Hosts only, no paths, at most 5. */
export interface ShopLinkResult {
  link: string | null
  reason: ShopLinkReason | null
  candidates: number
  hosts: string[]
  /** Which lookup was made: the item's own store list (token) or a search limited to the shop's site (site). */
  path: 'token' | 'site'
}

const MAX_HOSTS = 5

function hostsOf(links: unknown[]): string[] {
  const out: string[] = []
  for (const l of links) {
    if (typeof l !== 'string') continue
    try {
      const h = new URL(l).hostname.toLowerCase()
      if (h && !out.includes(h)) out.push(h)
    } catch { /* not an address: no host to report */ }
    if (out.length >= MAX_HOSTS) break
  }
  return out
}

/** One SerpApi request: its parsed answer, or the reason it failed. */
async function callSerpApi(params: URLSearchParams): Promise<{ data: unknown } | { reason: ShopLinkReason }> {
  let res: Response
  try {
    res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) })
  } catch {
    return { reason: 'timeout' }
  }
  if (!res.ok) return { reason: `http_${res.status}` }
  try {
    return { data: await res.json() }
  } catch {
    return { reason: 'unreadable' }
  }
}

/** The store links in a google_immersive_product answer (product_results.stores, tolerating the other shapes). */
function immersiveStoreLinks(data: unknown): unknown[] | null {
  const d = data as { product_results?: { stores?: unknown }; immersive_product_results?: { stores?: unknown }; stores?: unknown } | null
  const stores = d?.product_results?.stores ?? d?.immersive_product_results?.stores ?? d?.stores
  if (!Array.isArray(stores)) return null
  return stores.map((s) => (s as { link?: unknown } | null)?.link)
}

/**
 * One SerpApi call, never more. With the item's Google page token: google_immersive_product, which lists the item's
 * stores with direct links, and the first store on the shop's own site is used. Without a token: one Google search
 * limited to the shop's site (site:host). Always answers with a link or a reason (and the hosts it saw), never throws.
 */
export async function resolveShopLink(item: { title: string; shop: string; token?: string | null }): Promise<ShopLinkResult> {
  const key = process.env.SERPAPI_API_KEY
  const path = item.token ? 'token' : 'site'
  const fail = (reason: ShopLinkReason, links: unknown[] = []): ShopLinkResult =>
    ({ link: null, reason, candidates: links.length, hosts: hostsOf(links), path })
  const host = shopHost(item.shop)
  if (!key || !host) return fail('no_store_on_shop_host')

  const params = item.token
    ? new URLSearchParams({ engine: 'google_immersive_product', page_token: item.token, more_stores: 'true', api_key: key })
    : new URLSearchParams({
        engine: 'google', q: `${item.title} site:${host}`, gl: 'au', hl: 'en',
        location: 'Australia', google_domain: 'google.com.au', num: '10', api_key: key,
      })
  const answer = await callSerpApi(params)
  if ('reason' in answer) return fail(answer.reason)

  let links: unknown[] | null
  if (item.token) {
    links = immersiveStoreLinks(answer.data)
  } else {
    const organic = (answer.data as { organic_results?: unknown } | null)?.organic_results
    links = Array.isArray(organic) ? organic.map((r) => (r as { link?: unknown } | null)?.link) : null
  }
  if (!links || links.length === 0) return fail('no_results')
  const found = links.find((l): l is string => typeof l === 'string' && linkBelongsToShop(l, item.shop))
  if (found) return { link: found, reason: null, candidates: links.length, hosts: hostsOf(links), path }
  return fail(item.token ? 'no_store_on_shop_host' : 'no_results', links)
}
