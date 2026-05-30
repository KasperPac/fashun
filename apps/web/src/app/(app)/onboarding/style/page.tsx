'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StyleGrid from '@/components/StyleGrid'
import type { StylePref } from '@fashun/shared'

export default function StylePage() {
  const router = useRouter()
  const [selected, setSelected] = useState<StylePref[]>(['casual'])
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    if (selected.length === 0) return
    setLoading(true)
    await fetch('/api/onboarding/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style_prefs: selected }),
    })
    router.push('/onboarding/budget')
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black mb-1">How do you dress? 👗</h2>
        <p className="text-zinc-400 text-sm">Pick all that apply — we&apos;ll tailor recommendations to your vibe.</p>
      </div>
      <StyleGrid selected={selected} onChange={setSelected} />
      <button
        onClick={handleContinue}
        disabled={selected.length === 0 || loading}
        className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50"
      >
        Continue →
      </button>
    </div>
  )
}
