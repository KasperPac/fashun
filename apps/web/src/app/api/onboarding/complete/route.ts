import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('users')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}
