// THROWAWAY one-off backfill — see docs/superpowers/specs/2026-06-05-backfill-stock-images-design.md
// Retroactively upgrades photo-only wardrobe items to official stock images, interactively (y/n per item).
//
// Run from C:\dev\fashun:
//   node apps/web/scripts/backfill-stock-images.mjs <email> [--dry-run] [--yes] [--limit N]
//
// All of NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY are read
// from process.env first, then apps/web/.env.local. Flags:
//   --dry-run   report candidates for each item, write nothing, no prompt
//   --yes       auto-apply the top candidate (non-interactive); without it you're prompted y/n
//   --limit N   only process the first N matching items (good for a cautious live test)
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const BUCKET = 'wardrobe-images'
const MODEL = 'claude-haiku-4-5-20251001'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

// ---- args & env ----
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const autoYes = args.includes('--yes')
const includeLinked = args.includes('--include-linked')  // testing: ignore the photo-only filter
const limitArg = args.find((a) => a.startsWith('--limit'))
const limit = limitArg ? Number(args[args.indexOf(limitArg) + 1] ?? limitArg.split('=')[1]) : Infinity
const interactive = !dryRun && !autoYes
const email = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a))
if (!email) {
  console.error('Usage: node apps/web/scripts/backfill-stock-images.mjs <email> [--dry-run] [--yes] [--limit N]')
  process.exit(2)
}

function envFromLocal(name) {
  if (process.env[name]) return process.env[name]
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const m = env.match(new RegExp(`^${name}=(.*)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {}
  return ''
}

const SUPABASE_URL = envFromLocal('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE = envFromLocal('SUPABASE_SERVICE_ROLE_KEY')
const ANTHROPIC_API_KEY = envFromLocal('ANTHROPIC_API_KEY')
if (!SUPABASE_URL) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL'); process.exit(2) }
if (!SERVICE_ROLE) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY (env or apps/web/.env.local)'); process.exit(2) }
if (!ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY (env or apps/web/.env.local)'); process.exit(2) }

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null

// ---- helpers ----
function mediaTypeFromBase64(b64) {
  if (b64.startsWith('/9j')) return 'image/jpeg'
  if (b64.startsWith('iVBOR')) return 'image/png'
  if (b64.startsWith('UklGR')) return 'image/webp'
  if (b64.startsWith('R0lGOD')) return 'image/gif'
  return 'image/jpeg'
}
function stripFences(text) {
  return text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
}

async function resolveUserId(targetEmail) {
  const want = targetEmail.toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === want)
    if (hit) return hit.id
    if (data.users.length < 1000) break
  }
  return null
}

// Mirrors tagger.ts: single Vision call returning a searchQuery (or '').
async function identify(base64) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaTypeFromBase64(base64), data: base64 } },
        { type: 'text', text: `Analyse this clothing item image. If you can identify the specific product (brand + model), reply with ONLY a concise web search query e.g. "Timberland 6-inch premium boots". If you cannot identify a specific product, reply with ONLY an empty string. No markdown, no explanation.` },
      ],
    }],
  })
  const block = message.content.find((b) => b.type === 'text')
  return block ? block.text.trim().replace(/^["']|["']$/g, '') : ''
}

// Mirrors product-search.ts: web_search over any AU retailer.
async function search(description) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: [{
      role: 'user',
      content: `Find up to 3 specific product pages for "${description}" from any major Australian retailer.
After searching, reply with ONLY a JSON array (no markdown):
[{"url":"direct product page url","title":"product name","imageUrl":"image url or null","retailer":"retailer name"}]`,
    }],
  })
  const texts = message.content.filter((b) => b.type === 'text')
  const last = texts[texts.length - 1]
  if (!last) return []
  try {
    const parsed = JSON.parse(stripFences(last.text))
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((c) => c && typeof c.url === 'string' && /^https?:\/\//.test(c.url))
      .map((c) => ({
        url: c.url,
        title: typeof c.title === 'string' ? c.title : c.url,
        imageUrl: typeof c.imageUrl === 'string' ? c.imageUrl : null,
        retailer: typeof c.retailer === 'string' ? c.retailer : null,
      }))
  } catch { return [] }
}

// og:image from the candidate page; fall back to the search thumbnail.
async function bestImageUrl(candidate) {
  try {
    const res = await fetch(candidate.url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
    if (res.ok) {
      const html = await res.text()
      const m = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i)
      if (m && /^https?:\/\//.test(m[1])) return m[1]
    }
  } catch {}
  return candidate.imageUrl
}

async function ingest(imageUrl, userId) {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': UA, Accept: 'image/*' } })
  if (!res.ok) throw new Error(`image fetch ${res.status}`)
  const contentType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('image too large')
  const path = `${userId}/${randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
  if (error) throw new Error(`upload failed: ${error.message}`)
  return path
}

// ---- main ----
const stats = { processed: 0, updated: 0, skipped: 0, errors: 0 }

try {
  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Resolving ${email}…`)
  const userId = await resolveUserId(email)
  if (!userId) { console.error(`No user found for ${email}`); process.exit(1) }

  let q = supabase
    .from('wardrobe_items')
    .select('id, name, image_url')
    .eq('user_id', userId)
    .not('image_url', 'is', null)
    .not('image_url', 'like', 'http%')
  if (!includeLinked) q = q.is('retailer', null).is('store_url', null)
  const { data: items, error } = await q.order('created_at', { ascending: true })
  if (error) throw new Error(`query failed: ${error.message}`)

  const queue = Number.isFinite(limit) ? items.slice(0, limit) : items
  console.log(`Found ${items.length} photo-only item(s)${queue.length < items.length ? `, processing first ${queue.length}` : ''}.`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : autoYes ? 'AUTO-APPLY top candidate' : 'interactive y/n'}\n`)

  for (const item of queue) {
    stats.processed++
    console.log(`\n— [${stats.processed}/${items.length}] ${item.name}  (${item.image_url})`)
    try {
      const dl = await supabase.storage.from(BUCKET).download(item.image_url)
      if (dl.error || !dl.data) { console.log('  ! could not download image — skipping'); stats.skipped++; continue }
      const base64 = Buffer.from(await dl.data.arrayBuffer()).toString('base64')

      const query = await identify(base64)
      if (!query) { console.log('  · couldn\'t identify — skipping'); stats.skipped++; continue }
      console.log(`  identified as: "${query}"`)

      const candidates = await search(query)
      if (candidates.length === 0) { console.log('  · no matches — skipping'); stats.skipped++; continue }

      const top = candidates[0]
      console.log(`  → ${top.title}  [${top.retailer ?? 'unknown retailer'}]`)
      console.log(`    page:  ${top.url}`)
      console.log(`    image: ${top.imageUrl ?? '(none in search result)'}`)
      if (candidates.length > 1) {
        console.log('    other candidates:')
        for (const c of candidates.slice(1)) console.log(`      - ${c.title} — ${c.url}`)
      }

      if (dryRun) { console.log(`  [dry-run] would ingest & update → ${top.url}`); stats.updated++; continue }

      let apply = autoYes
      if (interactive) {
        const answer = (await rl.question('  Apply this stock image? [y/N] ')).trim().toLowerCase()
        apply = answer === 'y'
      }
      if (!apply) { console.log('  skipped.'); stats.skipped++; continue }

      const imageUrl = await bestImageUrl(top)
      if (!imageUrl) { console.log('  ! no usable image URL — skipping'); stats.skipped++; continue }
      const newPath = await ingest(imageUrl, userId)
      const { error: upErr } = await supabase
        .from('wardrobe_items')
        .update({ image_url: newPath, retailer: top.retailer, store_url: top.url })
        .eq('id', item.id)
      if (upErr) throw new Error(`update failed: ${upErr.message}`)
      console.log(`  ✓ updated → ${newPath}`)
      stats.updated++
    } catch (err) {
      console.log(`  ✗ error: ${err instanceof Error ? err.message : err}`)
      stats.errors++
    }
  }

  console.log(`\nDone${dryRun ? ' (dry run)' : ''}. processed=${stats.processed} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`)
} finally {
  rl?.close()
}
