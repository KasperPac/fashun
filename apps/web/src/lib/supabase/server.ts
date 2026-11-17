import { createServerClient as _createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@fashun/shared'

// @supabase/ssr 0.4 declares its client with the generics of an older
// supabase-js, where the third slot is the schema object. The installed
// supabase-js expects the schema name there, and with the schema object every
// table row resolved to `never`. Passing the name keeps rows typed.

// Next.js 16: cookies() is async
export async function createServerClient() {
  const cookieStore = await cookies()
  return _createServerClient<Database, 'public', 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

export async function createServiceClient() {
  return _createServerClient<Database, 'public', 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}
