'use client'

interface Props {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

export default function PaletteFilterToggle({ enabled, onChange }: Props) {
  return (
    <div className="flex gap-2 mt-3">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
          !enabled ? 'bg-purple-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
        }`}
      >
        All items
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
          enabled ? 'bg-purple-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
        }`}
      >
        🎨 In palette
      </button>
    </div>
  )
}
