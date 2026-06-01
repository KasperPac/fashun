import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { SEASON_PROMPT_CONTEXT } from '@fashun/shared'
import type { ColourSeason } from '@fashun/shared'
import { z } from 'zod'

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

const BodySchema = z.object({ item_id: z.string().uuid() })

const PieceSchema = z.object({
  label: z.string(),
  colour_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  item_id: z.string().nullable(),
  in_wardrobe: z.boolean(),
})

const SuggestionSchema = z.object({
  name: z.string(),
  occasion: z.string(),
  pieces: z.array(PieceSchema),
  description: z.string(),
})

const SuggestionsSchema = z.array(SuggestionSchema).min(1).max(3)

type DbItem = { id: string; name: string; category: string; colours: string[] | null }

const CATEGORY_LABELS: Record<string, string> = {
  tops: 'Tops', bottoms: 'Bottoms', shoes: 'Shoes',
  outerwear: 'Outerwear', bags: 'Bags', accessories: 'Accessories',
}

function buildWardrobeSection(items: DbItem[]): string {
  if (items.length === 0) return '(no other items in wardrobe)'
  const grouped: Record<string, DbItem[]> = {}
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  }
  return Object.entries(grouped)
    .map(([cat, catItems]) => {
      const label = CATEGORY_LABELS[cat] ?? cat
      const lines = catItems
        .map(i => `  - ${i.name} [id:${i.id}] | ${(i.colours ?? []).join(', ') || 'unknown colour'}`)
        .join('\n')
      return `${label}:\n${lines}`
    })
    .join('\n')
}

function buildPrompt(
  item: { name: string; category: string; colours: string[] | null },
  season: ColourSeason,
  wardrobeSection: string,
): { system: string; user: string } {
  const ctx = SEASON_PROMPT_CONTEXT[season]
  const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1)
  const anchorColours = (item.colours ?? []).join(', ') || 'unknown colour'

  const system = `You are a personal colour and style consultant. Your outfit suggestions always respect the user's seasonal colour palette. Return only valid JSON — no explanation, no markdown, just the JSON array.`

  const user = `The user's colour season is ${seasonLabel}. ${seasonLabel} suits: ${ctx.suits}. Avoid: ${ctx.avoid}.

Suggest 3 complete outfit combinations built around this anchor item:
**${item.name}** | ${item.category} | Colours: ${anchorColours}

Their wardrobe:
${wardrobeSection}

Rules:
1. Prefer wardrobe pieces — reference them by their id
2. For any suggested item not in their wardrobe, keep colours strictly within the ${seasonLabel} palette above
3. Each outfit must include a top + bottom + shoes minimum
4. Vary occasions across the 3 suggestions

Return exactly this JSON schema (array of 3):
[{"name":"2-3 word name","occasion":"e.g. Weekend brunch","pieces":[{"label":"e.g. Rust linen shirt","colour_hex":"#rrggbb","item_id":"uuid or null","in_wardrobe":true}],"description":"One sentence."}]`

  return { system, user }
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const [itemRes, profileRes, wardrobeRes] = await Promise.all([
    (supabase.from('wardrobe_items').select('id,name,category,colours,image_url').eq('id', parsed.data.item_id).eq('user_id', user.id).single() as unknown as Promise<{ data: { id: string; name: string; category: string; colours: string[] | null; image_url: string } | null; error: unknown }>),
    (supabase.from('users').select('colour_season').eq('id', user.id).single() as unknown as Promise<{ data: { colour_season: string | null } | null; error: unknown }>),
    (supabase.from('wardrobe_items').select('id,name,category,colours').eq('user_id', user.id).neq('id', parsed.data.item_id).eq('ownership', 'owned') as unknown as Promise<{ data: DbItem[] | null; error: unknown }>),
  ])

  if (!itemRes.data) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const item = itemRes.data
  const VALID_SEASONS = new Set<string>(['spring', 'summer', 'autumn', 'winter'])
  const rawSeason = profileRes.data?.colour_season ?? ''
  const season = (VALID_SEASONS.has(rawSeason) ? rawSeason : 'autumn') as ColourSeason
  const otherItems = Array.isArray(wardrobeRes.data) ? wardrobeRes.data : []
  const wardrobeSection = buildWardrobeSection(otherItems)
  const { system, user: userMsg } = buildPrompt(item, season, wardrobeSection)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await getAnthropic().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userMsg }],
      })
      const content = message.content[0]
      if (content.type !== 'text') throw new Error('Unexpected content type')
      const raw = content.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      const suggestions = SuggestionsSchema.parse(JSON.parse(raw))
      return NextResponse.json({ suggestions })
    } catch {
      if (attempt === 1) return NextResponse.json({ error: 'Failed to generate outfits' }, { status: 500 })
    }
  }
}
