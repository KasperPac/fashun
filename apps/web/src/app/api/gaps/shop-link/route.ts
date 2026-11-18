import { NextResponse } from 'next/server'
import { z } from 'zod'
import { OCCASIONS } from '@fashun/shared'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { gapSuggestionsEnabled } from '@/lib/paid-extras'
import { gapSearchFixturesEnabled } from '@/lib/gap-search'
import { linkBelongsToShop, resolveShopLink, shopHasHost, type ShopLinkResult } from '@/lib/gap-search/shop-link'
import { dayAndMonth } from '@/lib/gap-card'
import { firstOfNextMonth, tryOnNow } from '@/lib/try-on'
import { GAP_SEARCH_TIMEOUT_MS, gapSearchMonth, readGapSearchCap, reserveGapSearch, withTimeout } from '@/lib/gap-suggestions'

export const maxDuration = 30

const QuerySchema = z.object({
  occasion: z.enum(OCCASIONS),
  category: z.enum(['tops', 'bottoms', 'shoes']),
  t: z.string().min(1).max(500),
})

type StoredItem = { title?: unknown; shop?: unknown; link?: unknown; immersiveToken?: unknown }

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** The "Couldn't open the shop" page (design spec 4.4). No buttons: the Fashun tab is still open behind it. */
function couldntOpen(message: string, status: number, why?: Pick<ShopLinkResult, 'reason' | 'candidates' | 'hosts' | 'path'>) {
  // Diagnosis for QA: a fixed reason code, a count and host names only. Never a key, a path or anything about the person.
  const diagnosis = why
    ? ` data-reason="${escapeHtml(why.reason ?? '')}" data-candidates="${why.candidates}" data-hosts="${escapeHtml(why.hosts.join(','))}" data-path="${why.path}"`
    : ''
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Couldn&#39;t open the shop</title></head>
<body style="margin:0;background:#F4F4F2;color:#14161A;font-family:system-ui,sans-serif">
<main${diagnosis}><div style="background:#14161A;color:#FFFFFF;padding:32px 20px"><p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#E6E7EA">Fashun</p>
<h1 style="margin:0;font-size:28px;font-weight:800;text-transform:uppercase;line-height:1.1">Couldn&#39;t open the shop</h1></div>
<p style="margin:0;padding:20px;font-size:16px;line-height:1.4">${escapeHtml(message)}</p></main></body></html>`
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
  })
}

const unavailablePage = () => couldntOpen("Suggestions aren't available right now.", 503)
const notFoundPage = (shop: string | null, why?: Pick<ShopLinkResult, 'reason' | 'candidates' | 'hosts' | 'path'>) =>
  couldntOpen(`We couldn't find this item on ${shop ?? 'the shop'}'s website. It may have sold out. Close this tab and try another suggestion.`, 404, why)

/** The failure, in one server log line and on the page. Reason, counts and host names only. */
function failedLookup(shop: string, why: Pick<ShopLinkResult, 'reason' | 'candidates' | 'hosts' | 'path'>) {
  console.warn(`gap-shop-link reason=${why.reason} path=${why.path} candidates=${why.candidates} hosts=${why.hosts.join(',') || '-'}`)
  return notFoundPage(shop, why)
}
const toShop = (link: string) => {
  const res = NextResponse.redirect(link, 302)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

/**
 * GET ?occasion=&category=&t= : opens one suggested item on its shop's own website.
 * Only an item in the signed-in user's own stored suggestions is looked up. A stored shop link costs nothing.
 * Otherwise one SerpApi call is made (counted against the monthly limit): the item's own store list when it has a
 * Google page token, else a search limited to the shop's site. A link on the shop's own site is stored.
 */
export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 404 })

  if (!gapSuggestionsEnabled()) return unavailablePage()

  const params = new URL(req.url).searchParams
  const parsed = QuerySchema.safeParse({ occasion: params.get('occasion'), category: params.get('category'), t: params.get('t') })
  if (!parsed.success) return new NextResponse(null, { status: 404 })
  const { occasion, category, t } = parsed.data

  const { data: rows, error } = await supabase
    .from('gap_suggestions')
    .select('id,items')
    .eq('user_id', user.id)
    .eq('occasion', occasion)
    .eq('category', category)
    .order('day', { ascending: false })
    .limit(10)
  if (error) return unavailablePage()
  // The same gap can have several rows (a budget, department or price change): use the newest one that holds the item.
  const isTheItem = (i: StoredItem | null) => typeof i === 'object' && i !== null && i.title === t && typeof i.shop === 'string'
  const row = (rows ?? []).find((r) => Array.isArray(r.items) && (r.items as StoredItem[]).some(isTheItem))
  const items = row ? (row.items as StoredItem[]) : []
  const item = items.find(isTheItem)
  if (!row || !item) return notFoundPage(null)
  const shop = item.shop as string
  const storedLink = typeof item.link === 'string' ? item.link : null
  const token = typeof item.immersiveToken === 'string' && item.immersiveToken !== '' ? item.immersiveToken : null
  const path = token ? 'token' : 'site'

  // A link already on the shop's own site: no search, no cost.
  if (linkBelongsToShop(storedLink, shop)) return toShop(storedLink as string)
  // Saved results never search.
  if (gapSearchFixturesEnabled()) return failedLookup(shop, { reason: 'no_store_on_shop_host', candidates: 0, hosts: [], path })
  if (!process.env.SERPAPI_API_KEY) return unavailablePage()
  // A shop with no known website can never be matched: no search and nothing reserved.
  if (!shopHasHost(shop)) return failedLookup(shop, { reason: 'no_store_on_shop_host', candidates: 0, hosts: [], path })

  const now = tryOnNow()
  const month = gapSearchMonth(now)
  const service = await createServiceClient()
  let count: number | null
  try {
    count = await reserveGapSearch(service, month, readGapSearchCap())
  } catch {
    console.error('gap shop link failed: count_failed')
    return unavailablePage()
  }
  if (count === null) {
    return couldntOpen(`Suggestions are paused until ${dayAndMonth(firstOfNextMonth(month))}, so we can't open this link right now.`, 200)
  }

  let result: ShopLinkResult
  try {
    result = await withTimeout(resolveShopLink({ title: t, shop, token }), GAP_SEARCH_TIMEOUT_MS, () => new Error('timeout'))
  } catch {
    return failedLookup(shop, { reason: 'timeout', candidates: 0, hosts: [], path })
  }
  const found = result.link
  if (!found || !linkBelongsToShop(found, shop)) {
    return failedLookup(shop, { ...result, reason: result.reason ?? 'no_store_on_shop_host' })
  }

  // Stored with the suggestion so a second tap costs nothing. If storing fails the person is still sent on.
  const updated = items.map((i) => (i.title === t && i.shop === shop ? { ...i, link: found } : i))
  const { error: storeError } = await service
    .from('gap_suggestions')
    .update({ items: JSON.parse(JSON.stringify(updated)) })
    .eq('id', row.id)
    .eq('user_id', user.id)
  if (storeError) console.error('gap shop link failed: store_failed')
  return toShop(found)
}
