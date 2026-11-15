'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { WardrobeCategory } from '@fashun/shared'
import { supabase } from '@/lib/supabase/client'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ErrorState, Toast } from '@/components/ui/Feedback'
import { nextMissingPiece } from '@/lib/first-pieces'
import { addHref } from '@/lib/wardrobe-view'
import { onboardingHref } from '@/lib/onboarding-back'

const SLOTS: Array<{ category: WardrobeCategory; label: string }> = [
  { category: 'tops', label: 'Top' },
  { category: 'bottoms', label: 'Bottom' },
  { category: 'shoes', label: 'Shoes' },
]

type OwnedItem = { category: string; name: string }

function FirstPiecesContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [toast, setToast] = useState<string | null>(params.get('added') ? `${params.get('added')} added.` : null)
  const clearToast = useCallback(() => setToast(null), [])
  const [items, setItems] = useState<OwnedItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [finishFailed, setFinishFailed] = useState(false)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (params.get('added')) router.replace(onboardingHref('/onboarding/items', params.get('from')))
    // Only on first render: the toast text was already captured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('wardrobe_items')
      .select('category, name')
      .eq('ownership', 'owned')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setFailed(true)
        else setItems(data ?? [])
      })
    return () => { cancelled = true }
  }, [attempt])

  const load = useCallback(() => {
    setFailed(false)
    setAttempt((a) => a + 1)
  }, [])

  async function finish() {
    setFinishing(true)
    setFinishFailed(false)
    try {
      const res = await fetch('/api/onboarding/complete', { method: 'POST' })
      if (!res.ok) throw new Error('complete failed')
      router.push('/style-me')
    } catch {
      setFinishFailed(true)
      setFinishing(false)
    }
  }

  if (failed) {
    return (
      <main className="mx-auto w-full max-w-[480px] px-6 py-8">
        <ErrorState message="Couldn't load your wardrobe." onRetry={load} />
      </main>
    )
  }

  const have = (category: WardrobeCategory) => items?.find((i) => i.category === category)
  const missing = nextMissingPiece(items?.map((i) => i.category) ?? [])

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-6 py-8">
      <h1 className="font-display text-[44px] font-extrabold uppercase leading-none">Add a top, a bottom and shoes</h1>
      <p className="text-base leading-[1.4]">That&apos;s enough for your first outfits. You can add more any time.</p>

      <ul className="flex flex-col gap-3">
        {SLOTS.map(({ category, label }) => {
          const item = have(category)
          return (
            <li
              key={category}
              className={`flex min-h-16 items-center justify-between gap-3 bg-card px-3 ${
                item ? 'border-[1.5px] border-ink' : 'border-[1.5px] border-dashed border-ink'
              }`}
            >
              <div className="min-w-0">
                <p className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">{label}</p>
                {item && (
                  <p className="truncate text-[15px] font-semibold">
                    {item.name} <span className="text-ink-2">✓ Added</span>
                  </p>
                )}
              </div>
              {!item && items !== null && (
                <ButtonLink href={addHref(category, null, 'onboarding')} fullWidth={false} compact variant="secondary">
                  Add
                </ButtonLink>
              )}
            </li>
          )
        })}
      </ul>

      {missing ? (
        <p className="text-[15px] font-semibold">{missing.prompt}</p>
      ) : (
        <Button busy={finishing} busyLabel="Just a moment…" onClick={finish}>Style me</Button>
      )}
      {finishFailed && (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          <span aria-hidden="true">⚠ </span>Couldn&apos;t reach Fashun. Check your connection and try again.
        </p>
      )}
      <Button variant="text" onClick={finish} disabled={finishing}>Skip for now</Button>
      {toast && <Toast message={toast} onDone={clearToast} />}
    </main>
  )
}

export default function FirstPiecesStep() {
  return (
    <Suspense fallback={null}>
      <FirstPiecesContent />
    </Suspense>
  )
}
