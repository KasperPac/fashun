'use client'
import type { CategoryBudgets, WardrobeCategory } from '@fashun/shared'
import { dollars } from '@/lib/budget-view'

const CATEGORY_META: { key: WardrobeCategory; label: string; max: number }[] = [
  { key: 'tops', label: 'Tops', max: 500 },
  { key: 'bottoms', label: 'Bottoms', max: 500 },
  { key: 'shoes', label: 'Shoes', max: 1000 },
  { key: 'outerwear', label: 'Outerwear', max: 1000 },
  { key: 'bags', label: 'Bags', max: 800 },
  { key: 'accessories', label: 'Accessories', max: 300 },
]

const ALL_CATEGORIES: WardrobeCategory[] = CATEGORY_META.map((c) => c.key)

interface Props {
  budgets: CategoryBudgets
  onChange: (budgets: CategoryBudgets) => void
  /** Which sliders to show, in the order of the list below. Defaults to all six. */
  categories?: WardrobeCategory[]
  disabled?: boolean
}

export default function BudgetSliders({ budgets, onChange, categories = ALL_CATEGORIES, disabled = false }: Props) {
  function updateRange(key: WardrobeCategory, index: 0 | 1, value: number) {
    const current = budgets[key]
    const next: [number, number] = index === 0
      ? [Math.min(value, current[1] - 10), current[1]]
      : [current[0], Math.max(value, current[0] + 10)]
    onChange({ ...budgets, [key]: next })
  }

  return (
    <div className="flex flex-col gap-5">
      {CATEGORY_META.filter(({ key }) => categories.includes(key)).map(({ key, label, max }) => {
        const [low, high] = budgets[key]
        const lower = label.toLowerCase()
        return (
          <div key={key}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink">{label}</span>
              <span className="text-[15px] font-semibold text-ink">{dollars(low)} – {dollars(high)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-10 text-[13px] text-ink-2">{dollars(0)}</span>
              <div className="flex flex-1 flex-col gap-1">
                <input
                  type="range" min={0} max={max} step={5}
                  value={low}
                  disabled={disabled}
                  aria-label={`Lowest price for ${lower}`}
                  aria-valuetext={dollars(low)}
                  onChange={(e) => updateRange(key, 0, Number(e.target.value))}
                  className="h-11 w-full accent-ink"
                />
                <input
                  type="range" min={0} max={max} step={5}
                  value={high}
                  disabled={disabled}
                  aria-label={`Highest price for ${lower}`}
                  aria-valuetext={dollars(high)}
                  onChange={(e) => updateRange(key, 1, Number(e.target.value))}
                  className="h-11 w-full accent-ink"
                />
              </div>
              <span className="w-14 text-right text-[13px] text-ink-2">{dollars(max)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
