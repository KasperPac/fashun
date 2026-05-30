'use client'
import type { WardrobeCategory } from '@fashun/shared'

export type CategoryOption = WardrobeCategory | 'all'

const CATEGORIES: { value: CategoryOption; label: string; emoji: string }[] = [
  { value: 'all', label: 'All', emoji: '' },
  { value: 'tops', label: 'Tops', emoji: '👔' },
  { value: 'bottoms', label: 'Bottoms', emoji: '👖' },
  { value: 'shoes', label: 'Shoes', emoji: '👟' },
  { value: 'outerwear', label: 'Outerwear', emoji: '🧥' },
  { value: 'bags', label: 'Bags', emoji: '👜' },
  { value: 'accessories', label: 'Accessories', emoji: '💍' },
]

interface Props {
  active: CategoryOption
  onChange: (cat: CategoryOption) => void
}

export default function CategoryCarousel({ active, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {CATEGORIES.map(cat => (
        <button
          key={cat.value}
          type="button"
          onClick={() => onChange(cat.value)}
          className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
            active === cat.value
              ? 'bg-purple-600 text-white'
              : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          {cat.emoji && <span className="mr-1">{cat.emoji}</span>}
          {cat.label}
        </button>
      ))}
    </div>
  )
}
