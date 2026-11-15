'use client'
import { usePathname } from 'next/navigation'
import AppNav from '@/components/AppNav'

/** Page frame for signed-in screens. Onboarding is a focused flow, so it has no nav. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname.startsWith('/onboarding')) return <>{children}</>
  return (
    <>
      <div className="flex-1 pb-24 lg:pb-0 lg:pl-60">{children}</div>
      <AppNav />
    </>
  )
}
