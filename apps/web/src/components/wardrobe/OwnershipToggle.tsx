'use client'

interface Props {
  active: 'owned' | 'wishlist'
  onChange: (v: 'owned' | 'wishlist') => void
}

export default function OwnershipToggle({ active, onChange }: Props) {
  return (
    <div className="flex bg-zinc-900 rounded-xl p-1 gap-1">
      {(['owned', 'wishlist'] as const).map(v => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
            active === v ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {v === 'owned' ? '👗 Owned' : '💛 Wishlist'}
        </button>
      ))}
    </div>
  )
}
