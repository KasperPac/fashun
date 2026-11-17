import { ButtonLink } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Feedback'
import {
  GAP_NO_TIER_LINE, GAP_OFFLINE_LINE, GAP_UNAVAILABLE_LINE,
  budgetHref, cardSourceLine, pausedLine,
  type GapRow, type GapStatus,
} from '@/lib/gap-card'
import type { OccasionTag } from '@fashun/shared'

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"><path d="M9 5l7 7-7 7" /></svg>
  )
}

/**
 * The Fill the gaps card. Rows open the suggestions sheet only when the status is ready and the
 * person is online; in every other state they are plain text. Stays white with ink text on Formal.
 */
export default function FillTheGapsCard({
  rows,
  status,
  online,
  occasion,
  seasonName,
  onOpen,
}: {
  rows: GapRow[]
  /** null while the status call is still running. */
  status: GapStatus | null
  online: boolean
  occasion: OccasionTag
  seasonName: string
  onOpen: (row: GapRow, trigger: HTMLButtonElement) => void
}) {
  if (rows.length === 0) return null
  const ready = status?.status === 'ready'
  const tappable = ready && online

  let line: React.ReactNode = null
  if (status === null) line = <Skeleton className="h-[15px] w-3/4" />
  else if (status.status === 'ready') line = <p className="text-[15px] text-ink-2">{cardSourceLine(status.tier, seasonName)}</p>
  else if (status.status === 'no_tier') line = <p className="text-[15px] font-semibold">{GAP_NO_TIER_LINE}</p>
  else if (status.status === 'paused') line = <p className="text-[15px] font-semibold">{pausedLine(status.resume_on)}</p>
  else line = <p className="text-[15px] font-semibold">{GAP_UNAVAILABLE_LINE}</p>

  return (
    <section aria-labelledby="fill-the-gaps" className="flex border-2 border-ink bg-card text-ink">
      <span aria-hidden="true" className="w-2 shrink-0 bg-signal" />
      <div className="min-w-0 flex-1 p-3">
        <h2 id="fill-the-gaps" className="font-display text-[22px] font-extrabold uppercase leading-tight">Fill the gaps</h2>
        <div className="mb-2 mt-1">{line}</div>
        <ul className="border-t-[1.5px] border-ink">
          {rows.map((row) => (
            <li key={row.category} className="border-b-[1.5px] border-ink last:border-b-0">
              {tappable || status === null ? (
                <button
                  type="button"
                  disabled={!tappable}
                  aria-label={row.ariaLabel}
                  onClick={(e) => onOpen(row, e.currentTarget)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left disabled:cursor-default"
                >
                  <span className="min-w-0 font-display text-[15px] font-bold uppercase tracking-[1px]">{row.label}</span>
                  <span className="flex shrink-0 items-center gap-2 text-[15px] text-ink-2">
                    {row.status}
                    <Chevron />
                  </span>
                </button>
              ) : (
                <div className="flex min-h-12 w-full items-center justify-between gap-3 py-2">
                  <span className="min-w-0 font-display text-[15px] font-bold uppercase tracking-[1px]">{row.label}</span>
                  <span className="shrink-0 text-[15px] text-ink-2">{row.status}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
        {ready && !online && <p role="status" className="mt-2 text-[15px] font-semibold">{GAP_OFFLINE_LINE}</p>}
        {status?.status === 'no_tier' && (
          <div className="mt-3">
            <ButtonLink href={budgetHref(occasion)} variant="secondary" compact>Pick a budget</ButtonLink>
          </div>
        )}
      </div>
    </section>
  )
}
