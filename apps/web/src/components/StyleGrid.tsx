'use client'
import type { StylePref } from '@fashun/shared'

const STYLES: { value: StylePref; label: string; emoji: string; description: string }[] = [
  { value: 'casual', label: 'Casual', emoji: '👟', description: 'Everyday comfort' },
  { value: 'smart-casual', label: 'Smart Casual', emoji: '🧥', description: 'Polished but relaxed' },
  { value: 'business', label: 'Business', emoji: '👔', description: 'Professional & sharp' },
  { value: 'streetwear', label: 'Streetwear', emoji: '🧢', description: 'Urban & bold' },
  { value: 'minimalist', label: 'Minimalist', emoji: '🤍', description: 'Clean & simple' },
  { value: 'athleisure', label: 'Athleisure', emoji: '🏃', description: 'Active & sporty' },
  { value: 'bohemian', label: 'Bohemian', emoji: '🌸', description: 'Free & flowy' },
  { value: 'glam', label: 'Glam', emoji: '✨', description: 'Dressed up always' },
]

interface Props {
  selected: StylePref[]
  onChange: (prefs: StylePref[]) => void
}

export default function StyleGrid({ selected, onChange }: Props) {
  function toggle(value: StylePref) {
    onChange(
      selected.includes(value)
        ? selected.filter(s => s !== value)
        : [...selected, value]
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {STYLES.map(style => {
        const active = selected.includes(style.value)
        return (
          <button
            key={style.value}
            type="button"
            onClick={() => toggle(style.value)}
            className={`rounded-xl p-3 text-left border-2 transition-all ${
              active
                ? 'border-purple-500 bg-purple-950'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
            }`}
          >
            <div className="text-2xl mb-1">{style.emoji}</div>
            <div className={`font-bold text-sm ${active ? 'text-white' : 'text-zinc-400'}`}>
              {style.label}
            </div>
            <div className="text-zinc-600 text-xs mt-0.5">{style.description}</div>
          </button>
        )
      })}
    </div>
  )
}
