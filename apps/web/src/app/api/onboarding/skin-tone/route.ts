import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { determineColourSeason, getProfileColours, HAIR_COLOURS, EYE_COLOURS, STYLE_PREFS } from '@fashun/shared'
import type { ColourProfileResponse } from '@fashun/shared'
import { z } from 'zod'
import { logClaudeError, logClaudeFailure } from '@/lib/claude-log'
import { parseSkinToneReply } from '@/lib/skin-tone-parse'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const schema = z.object({
  imageBase64: z.string().min(100),
})

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    logClaudeFailure('skin-tone', 'not signed in')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    logClaudeFailure('skin-tone', 'bad request')
    return NextResponse.json({ error: 'Invalid image' }, { status: 400 })
  }

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
hairColour and eyeColour: use exactly one of the listed values, the closest option.
suggestedStyles: 2 to 4, each exactly one of ${STYLE_PREFS.join(', ')}, that would suit this person.
No explanation, no markdown, just the JSON object.`,
          },
        ],
      }],
    })
  } catch (err) {
    logClaudeError('skin-tone', err)
    return NextResponse.json({ error: 'Could not analyse selfie' }, { status: 502 })
  }

  const textContent = 'content' in message ? message.content[0] : undefined
  if (!textContent || textContent.type !== 'text') {
    logClaudeFailure('skin-tone', 'no text in reply')
    return NextResponse.json({ error: 'Could not analyse skin tone' }, { status: 422 })
  }
  const reading = parseSkinToneReply(textContent.text)
  if (!reading.ok) {
    logClaudeFailure('skin-tone', reading.reason)
    return NextResponse.json({ error: 'Could not analyse skin tone' }, { status: 422 })
  }
  for (const field of reading.dropped) logClaudeFailure('skin-tone', `dropped: ${field}`)
  const analysis = reading.analysis

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
  if (error) {
    logClaudeFailure('skin-tone', `save failed ${error.code ?? 'unknown'}`)
    return NextResponse.json({ error: 'Could not save colour profile' }, { status: 500 })
  }

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
