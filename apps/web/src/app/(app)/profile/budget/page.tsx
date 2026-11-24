import { Suspense } from 'react'
import BudgetScreen from '@/components/budget/BudgetScreen'

export default function ShoppingBudgetPage() {
  return (
    <main>
      <Suspense fallback={null}>
        <BudgetScreen />
      </Suspense>
    </main>
  )
}
