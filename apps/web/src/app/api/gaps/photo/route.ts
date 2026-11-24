import { NextResponse } from 'next/server'
import { z } from 'zod'
import { OCCASIONS } from '@fashun/shared'
import { createServerClient } from '@/lib/supabase/server'
import { gapSuggestionsEnabled } from '@/lib/paid-extras'
import { gapSearchFixturesEnabled } from '@/lib/gap-search'
import { isPubliclyFetchable } from '@/lib/ssrf'

const QuerySchema = z.object({
  occasion: z.enum(OCCASIONS),
  category: z.enum(['tops', 'bottoms', 'shoes']),
  u: z.string().min(1).max(2048),
})

const MAX_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 8000
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)\b/i

/** A plain stand-in picture, used in fixture mode so nothing leaves the app. */
const STAND_IN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 120"><rect width="96" height="120" fill="#E4E1D8"/><rect x="28" y="40" width="40" height="40" fill="none" stroke="#14161A" stroke-width="2"/></svg>'

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Photo not found</title></head>
<body style="margin:0;background:#F4F4F2;color:#14161A;font-family:system-ui,sans-serif"><main><div style="background:#14161A;color:#FFFFFF;padding:32px 20px"><p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#E6E7EA">Fashun</p>
<h1 style="margin:0;font-size:28px;font-weight:800;text-transform:uppercase;line-height:1.1">Photo not found</h1></div>
<p style="margin:0;padding:20px;font-size:16px;line-height:1.4">We couldn&#39;t find this photo. Close this tab and go back to Fashun.</p></main></body></html>`
const notFound = () => new NextResponse(NOT_FOUND_HTML, {
  status: 404,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
})

/**
 * GET ?occasion=&category=&u= : the photo of one suggested item, fetched by the app for a signed-in user.
 * Only an address saved in that user's own stored suggestions is fetched, so this is not an open proxy.
 */
export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!gapSuggestionsEnabled()) return notFound()

  const params = new URL(req.url).searchParams
  const parsed = QuerySchema.safeParse({ occasion: params.get('occasion'), category: params.get('category'), u: params.get('u') })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid photo' }, { status: 400 })
  const { occasion, category, u } = parsed.data

  const { data: rows, error } = await supabase
    .from('gap_suggestions')
    .select('items')
    .eq('user_id', user.id)
    .eq('occasion', occasion)
    .eq('category', category)
    .order('day', { ascending: false })
    .limit(10)
  if (error) return notFound()
  const stored = (rows ?? []).some((r) =>
    Array.isArray(r.items) && r.items.some((i) => typeof i === 'object' && i !== null && (i as { imageUrl?: unknown }).imageUrl === u))
  if (!stored) return notFound()

  if (gapSearchFixturesEnabled()) {
    return new NextResponse(STAND_IN, {
      headers: { 'Content-Type': 'image/svg+xml', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'private, max-age=3600' },
    })
  }

  if (!u.startsWith('https://') || !isPubliclyFetchable(u)) return notFound()
  try {
    const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !IMAGE_TYPES.test(type)) return notFound()
    const bytes = await res.arrayBuffer()
    if (bytes.byteLength > MAX_BYTES) return notFound()
    return new NextResponse(bytes, {
      headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' },
    })
  } catch {
    return notFound()
  }
}
