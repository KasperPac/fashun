import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { scrapeProductPage } from '@/lib/product-scraper'
import { extractProduct } from '@/lib/product-extractor'
import { uploadImageFromUrl } from '@/lib/store-image'
import { signWardrobeImage } from '@/lib/wardrobe-image'
import { matchVariantToPhoto } from '@/lib/variant-matcher'
import { searchProduct } from '@/lib/product-search'
import { extractProductViaClaude } from '@/lib/product-fetch-claude'
import { isPubliclyFetchable } from '@/lib/ssrf'
import type { ExtractedProduct } from '@/lib/product-extractor'
import { z } from 'zod'

const Schema = z.object({
  url: z.string().url().optional(),
  itemPhotoBase64: z.string().optional(),
  description: z.string().min(2).optional(),
  store: z.string().min(1).optional(),
})

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
    let product: ExtractedProduct | null = null
    try {
      const page = await scrapeProductPage(url)
      product = await extractProduct(page)
    } catch (err) {
      // Direct fetch blocked (e.g. retailer bot-protection 403s Vercel's IP).
      // Fall back to Claude's server-side web_fetch (different IP, Anthropic infra).
      console.error('[from-link] direct scrape failed, trying Claude web_fetch', url, err instanceof Error ? err.message : err)
      try {
        product = await extractProductViaClaude(url)
      } catch (claudeErr) {
        console.error('[from-link] Claude web_fetch threw', url, claudeErr instanceof Error ? claudeErr.message : claudeErr)
      }
    }

    if (!product) {
      console.error('[from-link] both direct + Claude fetch failed', url)
      return NextResponse.json({ mode: 'manual', storeUrl: url, reason: 'Could not read that page' })
    }

    let processedImageUrl: string | null = null
    if (product.imageUrl) {
      try {
        const path = await uploadImageFromUrl(supabase, product.imageUrl, user.id)
        processedImageUrl = await signWardrobeImage(supabase, path, 3600)
      } catch {
        processedImageUrl = null
      }
    }

    // Colour resolution: photo-match a variant if a photo was given, else first variant, else extracted
    let colours: string[]
    if (product.colourVariants.length && parsed.data.itemPhotoBase64) {
      const matched = await matchVariantToPhoto(product.colourVariants, parsed.data.itemPhotoBase64)
      colours = [(matched ?? product.colourVariants[0]).hex]
    } else if (product.colourVariants.length) {
      colours = [product.colourVariants[0].hex]
    } else {
      colours = product.colours
    }

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
  }

  // Search mode
  const candidates = await searchProduct(parsed.data.description!, parsed.data.store ?? '')
  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No matching products found' }, { status: 404 })
  }
  return NextResponse.json({ mode: 'candidates', candidates })
}
