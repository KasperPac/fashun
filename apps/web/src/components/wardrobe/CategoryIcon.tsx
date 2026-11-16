import type { WardrobeCategory } from '@fashun/shared'

const PATHS: Record<WardrobeCategory, string> = {
  tops: 'M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 0 1-8 0z',
  bottoms: 'M7 3h10l1 18h-5l-1-10-1 10H6z',
  shoes: 'M3 16v-3l4-1 3-5 3 4 8 2v3z',
  outerwear: 'M9 3l-6 4v14h6V9l3 3 3-3v12h6V7l-6-4-3 3z',
  bags: 'M5 8h14l1 13H4zM9 8V6a3 3 0 0 1 6 0v2',
  accessories: 'M12 3l3 6 6 1-4.5 4 1.5 6-6-3.5L6 20l1.5-6L3 10l6-1z',
}

/** A plain outline icon for a wardrobe category, for tiles with no photo. Decorative. */
export default function CategoryIcon({ category, size = 22 }: { category: WardrobeCategory; size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d={PATHS[category]} />
    </svg>
  )
}
