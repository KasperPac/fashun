import type { WardrobeItem } from '@fashun/shared'
import { ColourSwatch } from '@/components/ui/ColourSwatch'
import { firstColourLabel } from '@/lib/wardrobe-view'
import { CATEGORY_LABELS } from '@/lib/wardrobe-view'

const HEX = /^#[0-9a-fA-F]{6}$/

/** Photo on tile grey, the name (2 lines max), and the first colour's name. A button that opens the item sheet. */
export default function ItemTile({ item, onOpen }: { item: WardrobeItem; onOpen: (el: HTMLButtonElement) => void }) {
  const firstHex = item.colours.find((c) => HEX.test(c))
  return (
    <li>
      <button type="button" onClick={(e) => onOpen(e.currentTarget)} className="block w-full text-left">
        <span className="flex aspect-[3/4] w-full items-center justify-center border-[1.5px] border-ink bg-tile">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center font-display text-[13px] font-bold uppercase tracking-[1px] text-ink-2">
              {CATEGORY_LABELS[item.category]}
            </span>
          )}
        </span>
        <span className="mt-2 block line-clamp-2 text-[15px] font-semibold leading-tight">{item.name}</span>
        <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
          {firstHex && <ColourSwatch hex={firstHex} size={16} />}
          {firstColourLabel(item.colours)}
        </span>
      </button>
    </li>
  )
}
