const ORDER = [
  { category: 'tops', prompt: 'Add a top to see your first outfits.' },
  { category: 'bottoms', prompt: 'Add a bottom to see your first outfits.' },
  { category: 'shoes', prompt: 'Add shoes to see your first outfits.' },
] as const

/** The next of top, bottom, shoes the user hasn't added yet, or null when all three are in. */
export function nextMissingPiece(ownedCategories: string[]): { category: string; prompt: string } | null {
  return ORDER.find((slot) => !ownedCategories.includes(slot.category)) ?? null
}
