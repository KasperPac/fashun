'use client'
import { OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, WardrobeItem } from '@fashun/shared'
import { BottomSheet } from '@/components/ui/Overlays'
import { Button } from '@/components/ui/Button'
import { ColourSwatch } from '@/components/ui/ColourSwatch'
import { colourName } from '@/lib/colour-names'
import { CATEGORY_LABELS, isDarkOccasion, occasionColour, paletteLine } from '@/lib/wardrobe-view'

const HEX = /^#[0-9a-fA-F]{6}$/

/** Item detail: photo, name, category, colours, occasions, palette line, Edit and Delete. */
export default function ItemSheet({
  item,
  season,
  onClose,
  onEdit,
  onDelete,
}: {
  item: WardrobeItem | null
  season: ColourSeason | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const palette = item ? paletteLine(item.colours, season) : null
  return (
    <BottomSheet open={item !== null} title={item?.name ?? 'Item'} onClose={onClose} side>
      {item && (
        <div className="flex flex-col gap-4">
          <div className="flex aspect-[4/5] w-full items-center justify-center border-[1.5px] border-ink bg-tile">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
            ) : (
              <span className="font-display text-[15px] font-bold uppercase tracking-[1px] text-ink-2">
                {CATEGORY_LABELS[item.category]}
              </span>
            )}
          </div>
          <dl className="flex flex-col gap-3 text-[15px]">
            <div>
              <dt className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">Category</dt>
              <dd>{CATEGORY_LABELS[item.category]}</dd>
            </div>
            <div>
              <dt className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">Colours</dt>
              <dd>
                {item.colours.filter((c) => HEX.test(c)).length === 0 ? (
                  'No colour'
                ) : (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {item.colours.filter((c) => HEX.test(c)).map((hex) => (
                      <li key={hex} className="inline-flex items-center gap-1.5">
                        <ColourSwatch hex={hex} size={20} />
                        {colourName(hex)}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">Occasions</dt>
              <dd>
                {item.occasionTags.length === 0 ? (
                  'None set'
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {item.occasionTags.map((o) => (
                      <li
                        key={o}
                        style={{ backgroundColor: occasionColour(o) }}
                        className={`border border-ink px-2 py-1 font-display text-[13px] font-bold uppercase tracking-[1px] ${
                          isDarkOccasion(o) ? 'text-on-dark' : 'text-ink'
                        }`}
                      >
                        {OCCASION_LABELS[o]}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
          {palette && <p className="text-[15px] font-semibold">{palette}</p>}
          <div className="flex flex-col gap-3">
            <Button variant="secondary" onClick={onEdit}>Edit</Button>
            <Button variant="destructive" onClick={onDelete}>Delete</Button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
