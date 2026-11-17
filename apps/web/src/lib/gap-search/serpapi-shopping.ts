import { buildSearchText } from './query'
import {
  ProductSourceError,
  type GapSearchCategory,
  type GapSearchQuery,
  type ProductSource,
  type RawProduct,
} from './product-source'
import tops from './fixtures/google-shopping-au-tops.json'
import bottoms from './fixtures/google-shopping-au-bottoms.json'
import shoes from './fixtures/google-shopping-au-shoes.json'

/** The one server setting that switches to saved results: exactly "1". */
export function gapSearchFixturesEnabled(): boolean {
  return process.env.GAP_SEARCH_FIXTURES === '1'
}

const FIXTURES: Record<GapSearchCategory, unknown> = { tops, bottoms, shoes }

const ENDPOINT = 'https://serpapi.com/search.json'
const SEARCH_TIMEOUT_MS = 12_000

/** Reads "$49.95" or "A$1,200.00" when the response has no extracted_price. */
function parsePrice(item: Record<string, unknown>): number | null {
  if (typeof item.extracted_price === 'number') return item.extracted_price
  if (typeof item.price === 'string') {
    const n = Number(item.price.replace(/[^0-9.]/g, ''))
    return item.price.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** Maps the documented Google Shopping response (`shopping_results`) to raw products. */
export function parseShoppingResults(data: unknown): RawProduct[] {
  const results = (data as { shopping_results?: unknown } | null)?.shopping_results
  if (!Array.isArray(results)) return []
  const out: RawProduct[] = []
  for (const r of results) {
    if (typeof r !== 'object' || r === null) continue
    const item = r as Record<string, unknown>
    const title = str(item.title)
    const shop = str(item.source)
    if (!title || !shop) continue
    out.push({
      title,
      shop,
      price: parsePrice(item),
      imageUrl: str(item.thumbnail),
      link: str(item.link) ?? str(item.product_link),
      productId: str(item.product_id),
    })
  }
  return out
}

/** SerpApi Google Shopping, Australia. The only place that knows about SerpApi. */
export const serpapiShopping: ProductSource = {
  async search(query: GapSearchQuery): Promise<RawProduct[]> {
    if (gapSearchFixturesEnabled()) return parseShoppingResults(FIXTURES[query.category])
    const key = process.env.SERPAPI_API_KEY
    if (!key) throw new ProductSourceError('SERPAPI_API_KEY is not set')
    const params = new URLSearchParams({
      engine: 'google_shopping',
      q: buildSearchText(query),
      gl: 'au',
      hl: 'en',
      location: 'Australia',
      google_domain: 'google.com.au',
      min_price: String(query.priceRange[0]),
      max_price: String(query.priceRange[1]),
      api_key: key,
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
    return parseShoppingResults(data)
  },
}
