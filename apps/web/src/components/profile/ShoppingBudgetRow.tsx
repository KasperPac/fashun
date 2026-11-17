import Link from 'next/link'
import type { BudgetTier, Department } from '@fashun/shared'
import { budgetRowAriaLabel, budgetRowValue } from '@/lib/budget-view'

/** Profile's "Shopping" section: one 48px row to the Shopping budget page. */
export default function ShoppingBudgetRow({ tier, department }: { tier: BudgetTier | null; department: Department }) {
  return (
    <section aria-labelledby="shopping">
      <h2 id="shopping" className="mb-1 font-display text-[22px] font-extrabold uppercase">Shopping</h2>
      <ul className="border-y-[1.5px] border-ink">
        <li>
          <Link
            href="/profile/budget"
            aria-label={budgetRowAriaLabel(tier, department)}
            className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left"
          >
            <span className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">Shopping budget</span>
            <span className="flex items-center gap-2">
              <span className={`text-base font-medium ${tier ? '' : 'text-ink-2'}`}>{budgetRowValue(tier, department)}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"><path d="M9 5l7 7-7 7" /></svg>
            </span>
          </Link>
        </li>
      </ul>
    </section>
  )
}
