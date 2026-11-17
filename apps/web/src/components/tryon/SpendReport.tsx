import { formatUsd } from '@/lib/try-on'
import { formatPrice, monthName, nextMonthName, percentUsed, type SpendReport } from '@/lib/try-on-spend-client'

/** Bar with its percentage written out, so it never relies on length or colour alone. */
export function SpendMeter({ spentUnits, capUnits, month }: { spentUnits: number; capUnits: number; month: string }) {
  const percent = percentUsed(spentUnits, capUnits)
  const reached = spentUnits >= capUnits
  return (
    <div>
      <div
        role="meter"
        aria-label="Spend this month"
        aria-valuemin={0}
        aria-valuenow={Math.min(spentUnits, capUnits) / 10_000}
        aria-valuemax={capUnits / 10_000}
        aria-valuetext={`${formatUsd(spentUnits)} of ${formatUsd(capUnits)}`}
        className="mt-4 h-3 w-full border-2 border-ink bg-tile"
      >
        <div className={`h-full ${reached ? 'bg-danger' : 'bg-ink'}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-[15px] font-semibold">
        {reached
          ? `Cap reached · try-on paused until 1 ${nextMonthName(month)}`
          : `${percent}% used · resets 1 ${nextMonthName(month)} (Sydney time)`}
      </p>
    </div>
  )
}

/** The owner's spend: this month, the figures behind it, and earlier months. */
export default function SpendReportView({ report }: { report: SpendReport }) {
  const { spentUnits, capUnits, priceUnits } = report
  const price = priceUnits === null ? null : formatPrice(priceUnits)
  return (
    <div className="mx-auto w-full max-w-[480px] px-6 py-8">
      <p className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">This month · {monthName(report.month)}</p>
      {spentUnits === null ? (
        <p role="status" className="mt-2 text-[15px] font-semibold">
          Spend isn&apos;t shown because {capUnits === null ? 'neither the price per image nor the monthly cap is' : "the price per image isn't"} set. The image counts below are still right.
        </p>
      ) : (
        <>
          <p className="mt-2 font-display text-[52px] font-extrabold leading-none">{formatUsd(spentUnits)}</p>
          {capUnits === null ? (
            <p className="mt-2 text-[15px] font-semibold">The monthly cap isn&apos;t set, so no new try-on pictures are made.</p>
          ) : (
            <>
              <p className="mt-1 text-base">of {formatUsd(capUnits)} cap</p>
              <SpendMeter spentUnits={spentUnits} capUnits={capUnits} month={report.month} />
            </>
          )}
        </>
      )}

      <dl className="mt-6 border-y-[1.5px] border-ink">
        <div className="flex min-h-12 items-center justify-between py-2"><dt>Outfits tried on</dt><dd className="font-semibold tabular-nums">{report.pictures}</dd></div>
        <div className="flex min-h-12 items-center justify-between border-t border-ink py-2"><dt>FASHN images</dt><dd className="font-semibold tabular-nums">{report.images}</dd></div>
        {price && <div className="flex min-h-12 items-center justify-between border-t border-ink py-2"><dt>Price per image</dt><dd className="font-semibold tabular-nums">{price}</dd></div>}
      </dl>

      <h2 className="mt-8 font-display text-[15px] font-bold uppercase tracking-[2px]">Previous months</h2>
      {report.previous.length === 0 ? (
        <p className="mt-2 text-[15px]">No earlier months yet.</p>
      ) : (
        <table className="mt-2 w-full text-[15px]">
          <caption className="sr-only">Try-on spend in previous months, newest first</caption>
          <thead>
            <tr className="border-b-[1.5px] border-ink text-left">
              <th scope="col" className="py-2 font-semibold">Month</th>
              <th scope="col" className="py-2 text-right font-semibold">Outfits</th>
              <th scope="col" className="py-2 text-right font-semibold">Images</th>
              <th scope="col" className="py-2 text-right font-semibold">Spend</th>
            </tr>
          </thead>
          <tbody>
            {report.previous.map((m) => (
              <tr key={m.month} className="border-b border-ink/20">
                <th scope="row" className="py-2 text-left font-normal">{monthName(m.month)}</th>
                <td className="py-2 text-right tabular-nums">{m.pictures}</td>
                <td className="py-2 text-right tabular-nums">{m.images}</td>
                <td className="py-2 text-right tabular-nums">{m.spentUnits === null ? '–' : formatUsd(m.spentUnits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {price && (
        <p className="mt-4 text-[13px] text-ink-2">
          Spend is images × {price}. FASHN&apos;s usage page shows the same images as credits.
        </p>
      )}
    </div>
  )
}
