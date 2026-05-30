'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BudgetSliders from '@/components/BudgetSliders'
import { DEFAULT_BUDGETS } from '@fashun/shared'
import type { CategoryBudgets } from '@fashun/shared'

export default function BudgetPage() {
  const router = useRouter()
  const [budgets, setBudgets] = useState<CategoryBudgets>(DEFAULT_BUDGETS)
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    setLoading(true)
    await fetch('/api/onboarding/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgets }),
    })
    router.push('/onboarding/add-items')
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black mb-1">Shopping budget 💛</h2>
        <p className="text-zinc-400 text-sm">We&apos;ll only show items in your range. Change anytime.</p>
      </div>
      <BudgetSliders budgets={budgets} onChange={setBudgets} />
      <button
        onClick={handleContinue}
        disabled={loading}
        className="bg-amber-400 hover:bg-amber-300 text-black rounded-xl py-3 font-bold disabled:opacity-50"
      >
        All set — continue →
      </button>
    </div>
  )
}
