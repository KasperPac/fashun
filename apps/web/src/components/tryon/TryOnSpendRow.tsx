import Link from 'next/link'

/** Owner only: a 48px row to the spend page, with this month's figure. */
export default function TryOnSpendRow({ value }: { value: string }) {
  return (
    <ul className="mt-4 border-y-[1.5px] border-ink">
      <li>
        <Link href="/profile/try-on-spend" className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left">
          <span className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">Try-on spend</span>
          <span className="flex items-center gap-2">
            <span className="text-base font-medium">{value}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"><path d="M9 5l7 7-7 7" /></svg>
          </span>
        </Link>
      </li>
    </ul>
  )
}
