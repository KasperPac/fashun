import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { isTryOnOwner } from '@/lib/try-on'
import TryOnSpendScreen from '@/components/tryon/TryOnSpendScreen'

/** Owner only. Everyone else, signed in or not, gets the standard "not found" page. */
export default async function TryOnSpendPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isTryOnOwner(user.id)) notFound()
  return <main><TryOnSpendScreen /></main>
}
