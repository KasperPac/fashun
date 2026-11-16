import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { SEASON_PROMPT_CONTEXT, OCCASIONS, OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, OccasionTag } from '@fashun/shared'
import { z } from 'zod'
import {
  OUTFIT_COUNT, describeFewer, describeShortfall, eligibleItems, missingCategories, possibleOutfitCount, presentCategories, seasonLabel, validateSuggestions,
  type BuiltOutfit, type OwnedItem,
} from '@/lib/outfit-builder'
import { signWardrobeImage } from '@/lib/wardrobe-image'
import { logClaudeError, logClaudeFailure } from '@/lib/claude-log'

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

// v1: build outfits around one chosen item. Occasion mode: build from the whole wardrobe.
const BodySchema = z.union([
  z.object({ item_id: z.string().uuid() }),
  z.object({ occasion: z.enum(OCCASIONS) }),
])

const OccasionSuggestionsSchema = z.array(z.object({
  name: z.string().min(1),
  description: z.string(),
  reason: z.string(),
  item_ids: z.array(z.string()).min(1).max(8),
})).min(1).max(OUTFIT_COUNT)

const ColourListSchema = z.array(z.string()).nullable().optional()

function buildOccasionPrompt(
  occasion: OccasionTag,
  season: ColourSeason,
  bestColours: string[],
  avoidColours: string[],
  items: OwnedItem[],
  count: number,
): { system: string; user: string } {
  const ctx = SEASON_PROMPT_CONTEXT[season]
  const label = seasonLabel(season)
  const system = `You are a personal colour and style consultant. You only use clothes the user already owns, and you only refer to them by the ids you are given. Return only valid JSON, no explanation, no markdown.`
  const lines = items
    .map(i => `- [id:${i.id}] ${i.name} | ${i.category} | ${(i.colours ?? []).join(', ') || 'unknown colour'} | ${(i.occasion_tags ?? []).join(', ') || 'untagged'}`)
    .join('\n')
  const user = `The user's colour season is ${label}. ${label} suits: ${ctx.suits}. Avoid: ${ctx.avoid}.
Their best colours: ${bestColours.join(', ') || 'none saved'}. Colours to avoid: ${avoidColours.join(', ') || 'none saved'}.

Build ${count} different complete outfit${count === 1 ? '' : 's'} for the occasion: ${OCCASION_LABELS[occasion]}.

Their wardrobe (use ONLY these items, by id):
${lines}

Rules:
1. Every outfit has at least one top, one bottom and one pair of shoes. Outerwear, bags and accessories are optional.
2. Use only ids from the list above. Never invent an item.
3. Each outfit must suit the occasion. Never use an item tagged only casual for a formal outfit.
4. The reason is ONE sentence of at most 140 characters, using the colour names of the pieces (never hex codes). Use this pattern: "{Colour A} and {colour B} are both in your ${label} palette, and {short styling reason}." If only one palette colour is used: "{Colour A} is one of your best ${label} colours, and {short styling reason}."

Return exactly this JSON (array of ${count}):
[{"name":"2-3 word name","description":"One sentence.","reason":"One sentence in the pattern above.","item_ids":["uuid","uuid","uuid"]}]`
  return { system, user }
}

async function generateForOccasion(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string, occasion: OccasionTag) {
  const [profileRes, wardrobeRes] = await Promise.all([
    (supabase.from('users').select('colour_season,best_colours,avoid_colours').eq('id', userId).single() as unknown as Promise<{ data: { colour_season: string | null; best_colours: string[] | null; avoid_colours: string[] | null } | null; error: unknown }>),
    (supabase.from('wardrobe_items').select('id,name,category,colours,occasion_tags,image_url').eq('user_id', userId).eq('ownership', 'owned') as unknown as Promise<{ data: Array<OwnedItem & { image_url?: string | null }> | null; error: unknown }>),
  ])
  if (wardrobeRes.error) return NextResponse.json({ error: 'Failed to load wardrobe' }, { status: 500 })

  const season = profileRes.data?.colour_season ?? ''
  if (!Object.keys(SEASON_PROMPT_CONTEXT).includes(season)) {
    return NextResponse.json({ error: 'Add your colour profile first so outfits can match your palette.', code: 'no_colour_profile' }, { status: 422 })
  }
  const colourSeason = season as ColourSeason

  const eligible = eligibleItems(Array.isArray(wardrobeRes.data) ? wardrobeRes.data : [], occasion)
  const shortfall = describeShortfall(eligible, occasion)
  if (shortfall) {
    return NextResponse.json({
      error: shortfall,
      code: 'not_enough_items',
      missing: missingCategories(eligible),
      have: presentCategories(eligible),
    }, { status: 422 })
  }

  const target = possibleOutfitCount(eligible)
  const best = ColourListSchema.safeParse(profileRes.data?.best_colours).data ?? []
  const avoid = ColourListSchema.safeParse(profileRes.data?.avoid_colours).data ?? []
  const { system, user } = buildOccasionPrompt(occasion, colourSeason, best, avoid, eligible, target)

  const outfits: BuiltOutfit[] = []
  const seen = new Set<string>()
  for (let attempt = 0; attempt < 2 && outfits.length < target; attempt++) {
    try {
      const message = await getAnthropic().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1536,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const content = message.content[0]
      if (content.type !== 'text') throw new Error('Unexpected content type')
      const raw = content.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      const parsed = OccasionSuggestionsSchema.parse(JSON.parse(raw))
      const usable = validateSuggestions(parsed, eligible, occasion, colourSeason, seen, target - outfits.length).slice(0, target - outfits.length)
      if (usable.length === 0) logClaudeFailure('outfits-generate', 'no usable outfits')
      outfits.push(...usable)
    } catch (err) {
      logClaudeError('outfits-generate', err)
      // try once more; the outcome is judged below
    }
  }
  if (outfits.length === 0) return NextResponse.json({ error: 'Failed to generate outfits' }, { status: 500 })
  const imageById = new Map((wardrobeRes.data ?? []).map((i) => [i.id, i.image_url ?? null]))
  const withImages = await Promise.all(outfits.map(async (o) => ({
    ...o,
    pieces: await Promise.all(o.pieces.map(async (p) => {
      const stored = imageById.get(p.item_id)
      return { ...p, image_url: stored ? await signWardrobeImage(supabase, stored, 3600) : null }
    })),
  })))
  return NextResponse.json({
    suggestions: withImages,
    season: colourSeason,
    ...(outfits.length < OUTFIT_COUNT ? { missing: missingCategories(eligible) } : {}),
    // The wardrobe only allows this many different outfits: asking again gives the same ones.
    ...(target < OUTFIT_COUNT && outfits.length === target ? { limited: true, message: describeFewer(eligible, occasion) } : {}),
    ...(outfits.length < target ? { message: `Only ${outfits.length} of ${target} outfits could be built. Try again.` } : {}),
  })
}

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

  if ('occasion' in parsed.data) return generateForOccasion(supabase, user.id, parsed.data.occasion)

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
    } catch (err) {
      logClaudeError('outfits-generate', err)
      if (attempt === 1) return NextResponse.json({ error: 'Failed to generate outfits' }, { status: 500 })
    }
  }
}
