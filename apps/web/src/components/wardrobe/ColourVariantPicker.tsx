'use client'
import type { ColourVariant } from '@/lib/product-extractor'

interface Props {
  variants: ColourVariant[]
  selectedHex: string | undefined
  onSelect: (hex: string) => void
}

export default function ColourVariantPicker({ variants, selectedHex, onSelect }: Props) {
  if (variants.length === 0) return null
  return (
    <div>
      <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Colour</label>
      <div className="flex flex-wrap gap-2">
        {variants.map(v => {
          const active = v.hex === selectedHex
          return (
            <button
              key={v.hex + v.label}
              type="button"
              onClick={() => onSelect(v.hex)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? 'border-purple-500 text-white bg-purple-600/20' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <span className="w-4 h-4 rounded-full border border-white/20" style={{ background: v.hex }} />
              {v.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
