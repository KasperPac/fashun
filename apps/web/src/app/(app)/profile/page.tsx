'use client'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import ProfileView from '@/components/profile/ProfileView'
import { Button } from '@/components/ui/Button'

export default function ProfilePage() {
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <main>
      <ProfileView
        headline="tab"
        footer={<Button variant="text" fullWidth={false} onClick={signOut}>Sign out</Button>}
      />
    </main>
  )
}
