import Link from 'next/link'
import { OCCASION_LABELS } from '@fashun/shared'
import { addHref, isDarkOccasion, occasionColour, type Readiness } from '@/lib/wardrobe-view'

/** Four tiles, one per occasion: Ready (to Style me) or Needs {piece} (to Add with presets). */
export default function ReadyStrip({ readiness, loading = false }: { readiness: Readiness[]; loading?: boolean }) {
  return (
    <section aria-labelledby="ready-heading">
      <h2 id="ready-heading" className="mb-2 font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">
        Ready for outfits?
      </h2>
      <ul className="grid grid-cols-4 gap-2">
        {readiness.map((r) => {
          if (loading) {
            return (
              <li key={r.occasion}>
                <div
                  style={{ backgroundColor: occasionColour(r.occasion) }}
                  className={`flex min-h-16 flex-col justify-between border-[1.5px] border-ink p-1.5 font-display text-xs font-bold uppercase leading-tight tracking-[0.5px] ${
                    isDarkOccasion(r.occasion) ? 'text-on-dark' : 'text-ink'
                  }`}
                >
                  <span>{OCCASION_LABELS[r.occasion]}</span>
                </div>
              </li>
            )
          }
          const href = r.ready ? `/style-me?occasion=${r.occasion}` : addHref(r.missing, r.occasion)
          return (
            <li key={r.occasion}>
              <Link
                href={href}
                style={{ backgroundColor: occasionColour(r.occasion) }}
                className={`flex min-h-16 flex-col justify-between border-[1.5px] border-ink p-1.5 font-display text-xs font-bold uppercase leading-tight tracking-[0.5px] ${
                  isDarkOccasion(r.occasion) ? 'text-on-dark' : 'text-ink'
                }`}
              >
                <span>{OCCASION_LABELS[r.occasion]}</span>
                <span>{r.ready ? '✓ ' : ''}{r.status}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
