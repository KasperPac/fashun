'use client'
import type { CategoryBudgets, WardrobeCategory } from '@fashun/shared'

const CATEGORY_META: { key: WardrobeCategory; label: string; emoji: string; max: number }[] = [
  { key: 'tops', label: 'Tops', emoji: '👔', max: 500 },
  { key: 'bottoms', label: 'Bottoms', emoji: '👖', max: 500 },
  { key: 'shoes', label: 'Shoes', emoji: '👟', max: 1000 },
  { key: 'outerwear', label: 'Outerwear', emoji: '🧥', max: 1000 },
  { key: 'bags', label: 'Bags', emoji: '👜', max: 800 },
  { key: 'accessories', label: 'Accessories', emoji: '💍', max: 300 },
]

interface Props {
  budgets: CategoryBudgets
  onChange: (budgets: CategoryBudgets) => void
}

export default function BudgetSliders({ budgets, onChange }: Props) {
  function updateRange(key: WardrobeCategory, index: 0 | 1, value: number) {
    const current = budgets[key]
    const next: [number, number] = index === 0
      ? [Math.min(value, current[1] - 10), current[1]]
      : [current[0], Math.max(value, current[0] + 10)]
    onChange({ ...budgets, [key]: next })
  }

  return (
    <div className="flex flex-col gap-5">
      {CATEGORY_META.map(({ key, label, emoji, max }) => (
        <div key={key}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-white flex items-center gap-1.5">
              <span>{emoji}</span> {label}
            </span>
            <span className="text-xs text-zinc-400">
              ${budgets[key][0]} – ${budgets[key][1]}
            </span>
          </div>
          <div className="flex gap-3 items-center">
            <span className="text-xs text-zinc-600 w-4">$0</span>
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="range" min={0} max={max} step={5}
                value={budgets[key][0]}
                onChange={e => updateRange(key, 0, Number(e.target.value))}
                className="w-full accent-amber-400"
              />
              <input
                type="range" min={0} max={max} step={5}
                value={budgets[key][1]}
                onChange={e => updateRange(key, 1, Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
            <span className="text-xs text-zinc-600 w-8">${max}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
