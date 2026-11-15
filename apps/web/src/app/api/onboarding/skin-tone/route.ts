import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { determineColourSeason, getProfileColours, HAIR_COLOURS, EYE_COLOURS, STYLE_PREFS } from '@fashun/shared'
import type { ColourProfileResponse } from '@fashun/shared'
import { z } from 'zod'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const schema = z.object({
  imageBase64: z.string().min(100),
})

const AnalysisSchema = z.object({
  undertone: z.enum(['warm', 'cool', 'neutral']),
  depth: z.enum(['light', 'medium', 'deep']),
  hairColour: z.enum(HAIR_COLOURS),
  eyeColour: z.enum(EYE_COLOURS),
  suggestedStyles: z.array(z.enum(STYLE_PREFS)).min(1).max(4),
})

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid image' }, { status: 400 })

  let message: Awaited<ReturnType<typeof anthropic.messages.create>>
  try {
    message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: parsed.data.imageBase64 },
          },
          {
            type: 'text',
            text: `Analyse this selfie photo for a personal colour profile. Respond with ONLY valid JSON in this exact format:
{"undertone": "warm|cool|neutral", "depth": "light|medium|deep", "hairColour": "${HAIR_COLOURS.join('|')}", "eyeColour": "${EYE_COLOURS.join('|')}", "suggestedStyles": ["style", "style"]}
undertone: warm = yellow/olive/peachy, cool = pink/blue/rosy, neutral = mix of both.
depth: light = fair/light, medium = medium/tan/olive, deep = dark/deep brown.
hairColour and eyeColour: pick the closest option.
suggestedStyles: 2 to 4 of ${STYLE_PREFS.join(', ')} that would suit this person.
No explanation, no markdown, just the JSON object.`,
          },
        ],
      }],
    })
  } catch {
    return NextResponse.json({ error: 'Could not analyse selfie' }, { status: 502 })
  }

  let analysis: z.infer<typeof AnalysisSchema>
  try {
    const textContent = 'content' in message ? message.content[0] : undefined
    if (!textContent || textContent.type !== 'text') throw new Error('unexpected response type')
    // Strip markdown code fences if Claude wraps the JSON
    const cleaned = textContent.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()
    // Extract first JSON object in case there's surrounding text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON found')
    analysis = AnalysisSchema.parse(JSON.parse(jsonMatch[0]))
  } catch {
    return NextResponse.json({ error: 'Could not analyse skin tone' }, { status: 422 })
  }

  const season = determineColourSeason(analysis.undertone, analysis.depth)
  const { best, avoid } = getProfileColours(season)

  // Only derived results are saved. The selfie (imageBase64) is never written anywhere.
  const { error } = await supabase
    .from('users')
    .update({
      skin_undertone: analysis.undertone,
      skin_depth: analysis.depth,
      hair_colour: analysis.hairColour,
      eye_colour: analysis.eyeColour,
      colour_season: season,
      best_colours: best,
      avoid_colours: avoid,
      suggested_styles: analysis.suggestedStyles,
    })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: 'Could not save colour profile' }, { status: 500 })

  const result: ColourProfileResponse = {
    undertone: analysis.undertone,
    depth: analysis.depth,
    hairColour: analysis.hairColour,
    eyeColour: analysis.eyeColour,
    season,
    bestColours: best,
    avoidColours: avoid,
    suggestedStyles: analysis.suggestedStyles,
  }
  return NextResponse.json(result)
}
