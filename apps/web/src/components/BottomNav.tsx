'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const TABS = [
  { href: '/wardrobe', label: 'Wardrobe', emoji: '👗' },
  { href: '/palette',  label: 'Palette',  emoji: '🎨' },
  { href: '/shop',     label: 'Shop',     emoji: '🛍️' },
]

export default function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-black/90 backdrop-blur border-t border-zinc-800 flex pb-[env(safe-area-inset-bottom,0px)]">
      {TABS.map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs font-semibold transition-colors ${
              active ? 'text-purple-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className="text-lg leading-none">{tab.emoji}</span>
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
