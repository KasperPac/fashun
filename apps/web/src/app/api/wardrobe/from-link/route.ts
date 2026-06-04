import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { scrapeProductPage } from '@/lib/product-scraper'
import { extractProduct } from '@/lib/product-extractor'
import { uploadImageFromUrl } from '@/lib/store-image'
import { z } from 'zod'

const Schema = z.object({
  url: z.string().url().optional(),
  itemPhotoBase64: z.string().optional(),
  description: z.string().min(2).optional(),
  store: z.string().min(1).optional(),
})

// Blocks SSRF to loopback / private / link-local hosts and non-http(s) schemes.
function isPubliclyFetchable(rawUrl: string): boolean {
  let u: URL
  try { u = new URL(rawUrl) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  // IPv6 loopback / unspecified
  if (host === '::1' || host === '[::1]' || host === '::' ) return false
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

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = Schema.safeParse(body)
  if (!parsed.success || (!parsed.data.url && !parsed.data.description)) {
    return NextResponse.json({ error: 'Provide a url or a description' }, { status: 400 })
  }

  // URL mode
  if (parsed.data.url) {
    const url = parsed.data.url
    if (!isPubliclyFetchable(url)) {
      return NextResponse.json({ error: 'That URL cannot be fetched' }, { status: 400 })
    }
    try {
      const page = await scrapeProductPage(url)
      const product = await extractProduct(page)

      let processedImageUrl: string | null = null
      if (product.imageUrl) {
        try {
          processedImageUrl = await uploadImageFromUrl(supabase, product.imageUrl, user.id)
        } catch {
          processedImageUrl = null
        }
      }

      // Colour resolution (variant photo-matching added in Task 5)
      const colours = product.colourVariants.length
        ? [product.colourVariants[0].hex]
        : product.colours

      return NextResponse.json({
        mode: 'confirm',
        product: {
          suggestedName: product.name,
          category: product.category,
          colours,
          colourVariants: product.colourVariants,
          styleTags: product.styleTags,
          processedImageUrl,
          storeUrl: url,
          price: product.price,
          retailer: product.retailer,
        },
      })
    } catch {
      return NextResponse.json({ mode: 'manual', storeUrl: url, reason: 'Could not read that page' })
    }
  }

  // Search mode — implemented in Task 6
  return NextResponse.json({ error: 'Search mode not yet available' }, { status: 400 })
}
