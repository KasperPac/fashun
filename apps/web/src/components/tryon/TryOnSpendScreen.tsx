'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Kicker, ScreenBlock } from '@/components/ui/Onboarding'
import SpendReportView from '@/components/tryon/SpendReport'
import { SPEND_LOAD_FAILED, loadSpendReport, type SpendReport } from '@/lib/try-on-spend-client'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; report: SpendReport }

/** The owner page body: the header block, then the loaded spend. */
export default function TryOnSpendScreen() {
  const [state, setState] = useState<State>({ status: 'loading' })

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadSpendReport({ fetch: (...a) => fetch(...a) }).then((report) => {
      if (!cancelled) setState(report ? { status: 'ready', report } : { status: 'error' })
    })
    return () => { cancelled = true }
  }, [attempt])

  const retry = () => { setState({ status: 'loading' }); setAttempt((n) => n + 1) }

  return (
    <div data-occasion="house">
      <ScreenBlock theme="house">
        <Link href="/profile" aria-label="Back" className="-ml-3 mb-2 flex h-11 w-11 items-center justify-center text-(--on-block)">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"><path d="M15 5l-7 7 7 7" /></svg>
        </Link>
        <Kicker>Owner only</Kicker>
        <h1 className="mt-2 font-display text-[52px] font-extrabold uppercase leading-none tracking-[-1px]">Try-on spend</h1>
      </ScreenBlock>
      {state.status === 'loading' && (
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-6 py-8">
          <p role="status" className="sr-only">Loading try-on spend…</p>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      )}
      {state.status === 'error' && (
        <div className="mx-auto w-full max-w-[480px] px-6 py-8"><ErrorState message={SPEND_LOAD_FAILED} onRetry={retry} /></div>
      )}
      {state.status === 'ready' && <SpendReportView report={state.report} />}
    </div>
  )
}
