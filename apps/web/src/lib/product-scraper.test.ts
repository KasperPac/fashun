import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scrapeProductPage } from './product-scraper'

const HTML = `<!doctype html><html><head>
<title>Fallback Title</title>
<meta property="og:title" content="Rust Linen Shirt" />
<meta property="og:image" content="https://cdn.shop.com/shirt.jpg" />
<meta property="og:site_name" content="THE ICONIC" />
<meta property="product:price:amount" content="89.95" />
<script type="application/ld+json">
{"@type":"Product","name":"Rust Linen Shirt","color":"Rust","offers":{"price":"89.95"}}
</script>
</head><body><p>A breathable warm-weather shirt.</p><script>ignored()</script></body></html>`

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(HTML),
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('scrapeProductPage', () => {
  it('extracts og tags', async () => {
    const page = await scrapeProductPage('https://shop.com/p/1')
    expect(page.title).toBe('Rust Linen Shirt')
    expect(page.imageUrl).toBe('https://cdn.shop.com/shirt.jpg')
    expect(page.retailer).toBe('THE ICONIC')
    expect(page.price).toBe(89.95)
  })

  it('parses the first Product JSON-LD block', async () => {
    const page = await scrapeProductPage('https://shop.com/p/1')
    expect(page.jsonLd).toMatchObject({ '@type': 'Product', color: 'Rust' })
  })

  it('includes a tag-stripped text snippet without script contents', async () => {
    const page = await scrapeProductPage('https://shop.com/p/1')
    expect(page.textSnippet).toContain('breathable warm-weather shirt')
    expect(page.textSnippet).not.toContain('ignored()')
  })

  it('falls back to <title> when og:title is absent', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, text: () => Promise.resolve('<title>Only Title</title>'),
    })
    const page = await scrapeProductPage('https://shop.com/p/2')
    expect(page.title).toBe('Only Title')
  })

  it('does not truncate a double-quoted value containing an apostrophe', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(`<meta property="og:title" content="Men's Linen Shirt" />`),
    })
    const page = await scrapeProductPage('https://shop.com/p/3')
    expect(page.title).toBe("Men's Linen Shirt")
  })

  it('throws when the response is not ok', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 403 })
    await expect(scrapeProductPage('https://shop.com/blocked')).rejects.toThrow()
  })
})
