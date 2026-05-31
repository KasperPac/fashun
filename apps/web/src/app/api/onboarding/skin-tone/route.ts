import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { determineColourSeason } from '@fashun/shared'
import type { SkinUndertone, SkinDepth } from '@fashun/shared'
import { z } from 'zod'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const schema = z.object({
  imageBase64: z.string().min(100),
})

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid image' }, { status: 400 })

  const message = await anthropic.messages.create({
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
          text: `Analyse this selfie photo for skin tone only. Respond with ONLY valid JSON in this exact format:
{"undertone": "warm|cool|neutral", "depth": "light|medium|deep"}
undertone: warm = yellow/olive/peachy, cool = pink/blue/rosy, neutral = mix of both.
depth: light = fair/light, medium = medium/tan/olive, deep = dark/deep brown.
No explanation, no markdown, just the JSON object.`,
        },
      ],
    }],
  })

  let undertone: SkinUndertone
  let depth: SkinDepth
  try {
    const textContent = message.content[0]
    if (textContent.type !== 'text') throw new Error('unexpected response type')
    // Strip markdown code fences if Claude wraps the JSON
    const cleaned = textContent.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()
    // Extract first JSON object in case there's surrounding text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON found')
    const raw = JSON.parse(jsonMatch[0])
    undertone = raw.undertone
    depth = raw.depth
    if (!undertone || !depth) throw new Error('missing fields')
  } catch {
    return NextResponse.json({ error: 'Could not analyse skin tone' }, { status: 422 })
  }

  const season = determineColourSeason(undertone, depth)

  await supabase
    .from('users')
    .update({ skin_undertone: undertone, skin_depth: depth, colour_season: season })
    .eq('id', user.id)

  return NextResponse.json({ undertone, depth, season })
}
