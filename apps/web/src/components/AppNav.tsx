'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'

const icon = (children: ReactNode) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    {children}
  </svg>
)

const TABS = [
  { href: '/style-me', label: 'Style me', icon: icon(<path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />) },
  { href: '/wardrobe', label: 'Wardrobe', icon: icon(<path d="M9 3h6l1 4 5 3v2h-4v9H7v-9H3v-2l5-3z" />) },
  { href: '/saved', label: 'Saved', icon: icon(<path d="M6 3h12v18l-6-4-6 4z" />) },
  { href: '/profile', label: 'Profile', icon: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7" /></>) },
] as const

/** Bottom bar on phone, 240px left rail from 1024px. Same four tabs. */
export default function AppNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main"
      className="on-dark fixed inset-x-0 bottom-0 z-40 bg-ink pb-[env(safe-area-inset-bottom,0px)] lg:inset-y-0 lg:right-auto lg:w-60 lg:pb-0 lg:pt-10"
    >
      <p className="mb-6 hidden px-6 font-display text-[40px] font-extrabold uppercase leading-none tracking-[-1px] text-on-dark lg:block">
        Fashun
      </p>
      <ul className="flex lg:flex-col">
        {TABS.map((tab) => {
          const current = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          return (
            <li key={tab.href} className="flex-1 lg:flex-none">
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-2 font-display text-xs font-bold uppercase tracking-[1px] lg:min-h-14 lg:flex-row lg:justify-start lg:gap-3 lg:px-6 lg:text-[15px] ${
                  current ? 'text-on-dark' : 'text-nav-muted'
                }`}
              >
                {tab.icon}
                <span className="flex flex-col items-center gap-1 lg:items-start">
                  {tab.label}
                  <span
                    aria-hidden="true"
                    className={`h-[3px] w-8 ${current ? 'bg-signal' : 'bg-transparent'}`}
                  />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
