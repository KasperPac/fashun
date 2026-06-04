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
