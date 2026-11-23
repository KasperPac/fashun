'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  BUDGET_TIERS,
  BUDGET_TIER_DEFINITIONS,
  DEPARTMENTS,
  DEPARTMENT_NAMES,
  shopsList,
  tierRanges,
  type BudgetTier,
  type CategoryBudgets,
  type Department,
} from '@fashun/shared'
import { supabase } from '@/lib/supabase/client'
import { useOnline } from '@/lib/browser-state'
import {
  BUDGET_LOAD_FAILED,
  BUDGET_OFFLINE,
  BUDGET_SAVE_FAILED,
  RANGES_SAVE_FAILED,
  budgetBackHref,
  parseBudgetRow,
  tierPickedMessage,
  topsRangeLine,
  type BudgetState,
} from '@/lib/budget-view'
import { saveBudgetPatch } from '@/lib/budget-client'
import { ErrorState, Skeleton, Toast } from '@/components/ui/Feedback'
import { Kicker, ScreenBlock } from '@/components/ui/Onboarding'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { OptionRow, SaveError } from '@/components/profile/ProfileSheets'
import BudgetSliders from '@/components/BudgetSliders'

const SAVE_DELAY_MS = 800
const SAVED_SHOWN_MS = 4000

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; initial: BudgetState }
type SliderStatus = 'idle' | 'saving' | 'saved' | 'failed'

async function loadBudget(): Promise<BudgetState> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('users')
    .select('budget_tier, department, budgets')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (error) throw error
  return parseBudgetRow(data ?? {})
}

function BackLink({ href, onLeave }: { href: string; onLeave: () => void }) {
  return (
    <Link href={href} aria-label="Back" onClick={onLeave} className="-ml-3 mb-2 flex h-11 w-11 items-center justify-center text-(--on-block)">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"><path d="M15 5l-7 7 7 7" /></svg>
    </Link>
  )
}

/** The Shopping budget page: loads, then hands over to the editor. */
export default function BudgetScreen() {
  const params = useSearchParams()
  const backHref = budgetBackHref(params.get('from'), params.get('occasion'))
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const flush = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    loadBudget().then(
      (initial) => { if (!cancelled) setLoad({ status: 'ready', initial }) },
      () => { if (!cancelled) setLoad({ status: 'error' }) },
    )
    return () => { cancelled = true }
  }, [attempt])

  const retry = () => { setLoad({ status: 'loading' }); setAttempt((n) => n + 1) }

  return (
    <div data-occasion="house">
      <ScreenBlock theme="house">
        <BackLink href={backHref} onLeave={() => flush.current()} />
        <Kicker>Profile</Kicker>
        <h1 className="mt-2 font-display text-[52px] font-extrabold uppercase leading-none tracking-[-1px]">Shopping<br />budget</h1>
        <p className="mt-3 max-w-[480px] text-base leading-[1.4] text-(--on-block-2)">
          Pick where you like to shop. Suggestions only come from these shops, within your price ranges.
        </p>
      </ScreenBlock>
      {load.status === 'loading' && (
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-6 py-8">
          <p role="status" className="sr-only">Loading your budget…</p>
          {[72, 72, 72, 72, 44, 64, 64, 64].map((h, i) => <Skeleton key={i} className={h === 72 ? 'h-[72px]' : h === 44 ? 'h-11' : 'h-16'} />)}
        </div>
      )}
      {load.status === 'error' && (
        <div className="mx-auto w-full max-w-[480px] px-6 py-8"><ErrorState message={BUDGET_LOAD_FAILED} onRetry={retry} /></div>
      )}
      {load.status === 'ready' && <BudgetEditor initial={load.initial} flushRef={flush} />}
    </div>
  )
}

export function BudgetEditor({ initial, flushRef }: { initial: BudgetState; flushRef: { current: () => void } }) {
  const online = useOnline()
  const [tier, setTier] = useState<BudgetTier | null>(initial.tier)
  const [department, setDepartment] = useState<Department>(initial.department)
  const [budgets, setBudgets] = useState<CategoryBudgets>(initial.budgets)
  const [tierBusy, setTierBusy] = useState(false)
  const [tierError, setTierError] = useState<string | null>(null)
  const [deptError, setDeptError] = useState<string | null>(null)
  const [slider, setSlider] = useState<SliderStatus>('idle')
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const latest = useRef(budgets)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  const clearPending = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    dirty.current = false
  }

  const saveRanges = useCallback(async (keepalive = false) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    dirty.current = false
    setSlider('saving')
    const ok = await saveBudgetPatch({ budgets: latest.current }, undefined, keepalive)
    if (!ok) { setSlider('failed'); return }
    setSlider('saved')
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSlider('idle'), SAVED_SHOWN_MS)
  }, [])

  // A pending slider save is sent before leaving the page.
  useEffect(() => {
    flushRef.current = () => { if (dirty.current) void saveRanges(true) }
    return () => { flushRef.current = () => {} }
  }, [flushRef, saveRanges])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  function moveSliders(next: CategoryBudgets) {
    latest.current = next
    setBudgets(next)
    dirty.current = true
    setSlider('idle')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void saveRanges() }, SAVE_DELAY_MS)
  }

  async function pickTier(next: BudgetTier) {
    if (next === tier || tierBusy) return
    const previous = { tier, budgets }
    const ranges = tierRanges(next)
    clearPending()
    setSlider('idle')
    setTierError(null)
    setTierBusy(true)
    setTier(next)
    setBudgets(ranges)
    latest.current = ranges
    const ok = await saveBudgetPatch({ budget_tier: next, budgets: ranges })
    setTierBusy(false)
    if (!ok) {
      setTier(previous.tier)
      setBudgets(previous.budgets)
      latest.current = previous.budgets
      setTierError(BUDGET_SAVE_FAILED)
      return
    }
    setToast(tierPickedMessage(next))
  }

  async function pickDepartment(next: Department) {
    if (next === department) return
    const previous = department
    setDeptError(null)
    setDepartment(next)
    const ok = await saveBudgetPatch({ department: next })
    if (!ok) { setDepartment(previous); setDeptError(BUDGET_SAVE_FAILED); return }
    setToast('Saved.')
  }

  const locked = !online

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-8 px-6 py-8">
      {!online && <p role="status" className="text-[15px] font-semibold">{BUDGET_OFFLINE}</p>}

      <section aria-labelledby="where-you-shop">
        <h2 id="where-you-shop" className="mb-1 font-display text-[22px] font-extrabold uppercase">Where you shop</h2>
        <ul role="radiogroup" aria-labelledby="where-you-shop" className="border-t-[1.5px] border-ink">
          {BUDGET_TIERS.map((code) => (
            <OptionRow key={code} role="radio" selected={tier === code} disabled={locked || tierBusy} onClick={() => pickTier(code)}>
              <span className="font-display text-[22px] font-extrabold uppercase">{BUDGET_TIER_DEFINITIONS[code].name}</span>
              <span className={`text-[13px] ${tier === code ? 'font-semibold text-ink' : 'font-normal text-ink-2'}`}>{shopsList(code)}</span>
              <span className={`text-[13px] ${tier === code ? 'font-semibold text-ink' : 'font-normal text-ink-2'}`}>{topsRangeLine(code)}</span>
            </OptionRow>
          ))}
        </ul>
        <SaveError message={tierError} />
      </section>

      <section aria-labelledby="i-shop">
        <h2 id="i-shop" className="mb-3 font-display text-[22px] font-extrabold uppercase">I shop</h2>
        <div role="radiogroup" aria-labelledby="i-shop" className="flex flex-wrap gap-2">
          {DEPARTMENTS.map((d) => (
            <Chip key={d} role="radio" selected={department === d} disabled={locked} onClick={() => pickDepartment(d)}>
              {DEPARTMENT_NAMES[d]}
            </Chip>
          ))}
        </div>
        <SaveError message={deptError} />
      </section>

      <section aria-labelledby="your-ranges">
        <h2 id="your-ranges" className="mb-1 font-display text-[22px] font-extrabold uppercase">Your price ranges</h2>
        <p className="mb-4 text-[15px] text-ink-2">Suggestions stay within these.</p>
        <BudgetSliders budgets={budgets} onChange={moveSliders} categories={['tops', 'bottoms', 'shoes']} disabled={locked || tierBusy} />
        <div role="status" className="mt-4 min-h-6 text-[15px]">
          {slider === 'saving' && 'Saving…'}
          {slider === 'saved' && 'Saved.'}
          {slider === 'failed' && (
            <span className="flex flex-wrap items-center gap-2 font-semibold text-danger">
              <span><span aria-hidden="true">⚠ </span>{RANGES_SAVE_FAILED}</span>
              <Button variant="text" fullWidth={false} onClick={() => { void saveRanges() }}>Try again</Button>
            </span>
          )}
        </div>
      </section>

      {toast && <Toast message={toast} onDone={clearToast} />}
    </div>
  )
}
