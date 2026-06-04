export interface ScrapedPage {
  url: string
  title: string | null
  imageUrl: string | null
  price: number | null
  retailer: string | null
  jsonLd: Record<string, unknown> | null
  textSnippet: string
}

function metaContent(html: string, property: string): string | null {
  // Matches <meta property="og:x" content="..."> in either attribute order.
  // content value must close with the same delimiter it opened with, so values
  // containing an apostrophe (e.g. content="Men's Jeans") aren't truncated.
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=(?:"([^"]*)"|'([^']*)')` +
    `|<meta[^>]+content=(?:"([^"]*)"|'([^']*)')[^>]*(?:property|name)=["']${property}["']`,
    'i',
  )
  const m = html.match(re)
  return m ? (m[1] ?? m[2] ?? m[3] ?? m[4] ?? null) : null
}

function firstProductJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim())
      const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : []
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...graph]
      for (const node of nodes) {
        const type = node?.['@type']
        if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
          return node as Record<string, unknown>
        }
      }
    } catch {
      // skip malformed JSON-LD blocks
    }
  }
  return null
}

function textSnippet(html: string, limit = 4000): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return body.slice(0, limit)
}

export async function scrapeProductPage(url: string): Promise<ScrapedPage> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      Accept: 'text/html',
    },
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const html = await res.text()

  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null
  const priceRaw = metaContent(html, 'product:price:amount') ?? metaContent(html, 'og:price:amount')
  const price = priceRaw ? Number.parseFloat(priceRaw) : null

  return {
    url,
    title: metaContent(html, 'og:title') ?? titleTag,
    imageUrl: metaContent(html, 'og:image'),
    price: Number.isFinite(price as number) ? price : null,
    retailer: metaContent(html, 'og:site_name'),
    jsonLd: firstProductJsonLd(html),
    textSnippet: textSnippet(html),
  }
}
