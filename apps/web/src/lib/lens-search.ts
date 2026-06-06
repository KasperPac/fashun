import type { ProductCandidate } from './product-search'

interface LensMatch {
  link?: unknown
  title?: unknown
  thumbnail?: unknown
  source?: unknown
  price?: { extracted_value?: unknown }
}

/**
 * Reverse-image product search via SerpAPI Google Lens. Sends a publicly-reachable
 * image URL (a short-lived signed bucket URL) and maps the top visual matches to
 * candidates with real thumbnails. Returns [] on missing key / error / no matches.
 */
export async function searchByImage(imageUrl: string, query?: string): Promise<ProductCandidate[]> {
  const key = process.env.SERPAPI_API_KEY
  if (!key) return []
  try {
    const params = new URLSearchParams({
      engine: 'google_lens',
      url: imageUrl,
      country: 'au',
      hl: 'en',
      api_key: key,
    })
    if (query) params.set('q', query)
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`)
    if (!res.ok) return []
    const data = await res.json()
    const matches: LensMatch[] = Array.isArray(data.visual_matches) ? data.visual_matches : []
    return matches
      .slice(0, 3)
      .filter((m) => typeof m.link === 'string' && typeof m.thumbnail === 'string')
      .map((m) => ({
        url: m.link as string,
        title: typeof m.title === 'string' ? m.title : (m.link as string),
        imageUrl: m.thumbnail as string,
        retailer: typeof m.source === 'string' ? m.source : null,
        price: typeof m.price?.extracted_value === 'number' ? m.price.extracted_value : undefined,
      }))
  } catch {
    return []
  }
}
