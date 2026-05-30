import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({ code: z.string().min(1) })

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', parsed.data.code.toUpperCase())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  }
  if (data.used_by) {
    return NextResponse.json({ error: 'Invite code already used' }, { status: 409 })
  }

  return NextResponse.json({ valid: true })
}
