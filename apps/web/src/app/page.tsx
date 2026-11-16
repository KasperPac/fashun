import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { landingPath } from '@/lib/landing'

/** Signed out → start screen. Signed in → Style me, or the next unfinished onboarding step. */
export default async function RootPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('colour_season, onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle()
  const { count } = await supabase
    .from('wardrobe_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('ownership', 'owned')

  redirect(landingPath({
    hasProfile: Boolean(profile?.colour_season),
    pieceCount: count ?? 0,
    onboardingDone: Boolean(profile?.onboarding_completed_at),
  }))
}
