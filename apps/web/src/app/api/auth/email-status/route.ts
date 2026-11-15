import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254) })

/** Tells the start screen whether to ask for a password (known email) or an invite code (new email). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', parsed.data.email)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Could not check this email' }, { status: 500 })
  return NextResponse.json({ known: data !== null })
}
