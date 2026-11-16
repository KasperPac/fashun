import type { ReactNode } from 'react'
import { CATEGORY_LABELS } from '@/lib/wardrobe-view'
import type { WardrobeCategory } from '@fashun/shared'

export interface TagPiece {
  key: string
  label: string
  category: string | null
  imageUrl: string | null
  removed: boolean
}

const CUT = 'polygon(0 0, calc(100% - 42px) 0, 100% 30px, 100% 100%, 0 100%)'

function categoryLabel(category: string | null): string {
  return category && category in CATEGORY_LABELS ? CATEGORY_LABELS[category as WardrobeCategory] : 'Piece'
}

export function PieceTile({ piece, onOpen, size = 'md' }: { piece: TagPiece; onOpen?: (key: string, el: HTMLButtonElement) => void; size?: 'md' | 'sm' }) {
  const small = size === 'sm'
  const photo = piece.imageUrl && !piece.removed
  const inner = (
    <>
      <span className={`flex ${small ? 'h-[72px] w-[56px]' : 'h-[92px] w-[72px]'} items-center justify-center overflow-hidden border-[1.5px] border-ink bg-tile`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={piece.imageUrl ?? ''} alt={piece.label} className="h-full w-full object-contain" />
        ) : (
          <span className="px-1 text-center font-display text-xs font-bold uppercase leading-tight tracking-[0.5px] text-ink-2">
            {categoryLabel(piece.category)}
          </span>
        )}
      </span>
      <span className={`mt-1 block ${small ? 'w-[56px]' : 'w-[72px]'} break-words font-display text-xs font-bold uppercase leading-tight tracking-[0.5px]`}>
        {piece.label}
      </span>
      {piece.removed && <span className="mt-0.5 block w-[72px] text-xs leading-tight text-ink-2">No longer in your wardrobe</span>}
    </>
  )
  return (
    <li>
      {onOpen && !piece.removed ? (
        <button type="button" onClick={(e) => onOpen(piece.key, e.currentTarget)} className="block text-left">
          {inner}
        </button>
      ) : (
        inner
      )}
    </li>
  )
}

/** The outfit card: white, 2px ink, cut top-right corner with a punched hole. */
export default function HangTag({
  kicker,
  name,
  pieces,
  reason,
  accent,
  note,
  onOpenPiece,
  children,
}: {
  kicker: string
  name: string
  pieces: TagPiece[]
  reason: string | null
  accent: string | null
  note?: string
  onOpenPiece?: (key: string, el: HTMLButtonElement) => void
  children?: ReactNode
}) {
  return (
    <article className="relative bg-ink p-[2px]" style={{ clipPath: CUT }}>
      <div className="relative bg-card p-5" style={{ clipPath: CUT }}>
        <span aria-hidden="true" className="absolute right-6 top-2 h-3 w-3 rounded-full border-2 border-ink bg-page" />
        <p className="font-display text-sm font-bold uppercase tracking-[1.5px] text-ink-2">{kicker}</p>
        <h2 className="mb-4 font-display text-[31px] font-extrabold uppercase leading-[1.05]">{name}</h2>
        <ul className="mb-4 flex flex-wrap gap-3">
          {pieces.map((p) => (
            <PieceTile key={p.key} piece={p} onOpen={onOpenPiece} />
          ))}
        </ul>
        {reason && (
          <div className="mb-4 flex gap-3">
            <span aria-hidden="true" className="w-1 shrink-0" style={{ backgroundColor: accent ?? 'transparent' }} />
            <p className="text-[15px] font-medium leading-[1.4]">{reason}</p>
          </div>
        )}
        {note && <p className="mb-4 text-sm text-ink-2">{note}</p>}
        {children}
      </div>
    </article>
  )
}
