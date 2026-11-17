import type { Department } from '@fashun/shared'

/** The categories a gap can ask for. */
export type GapSearchCategory = 'tops' | 'bottoms' | 'shoes'

export interface GapSearchQuery {
  occasion: 'casual' | 'smart-casual' | 'work' | 'formal'
  category: GapSearchCategory
  department: Department
  /** The user's slider range for the category, in A$ (min, max), ends included. */
  priceRange: readonly [number, number]
}

/** One item as a source returns it, before any filtering. */
export interface RawProduct {
  title: string
  /** The shop name exactly as the source gives it, e.g. "Kmart Australia". */
  shop: string
  /** Price in A$, or null when the source gave none we can read. */
  price: number | null
  imageUrl: string | null
  /** Where the source sends the user for this item. */
  link: string | null
  productId: string | null
  /** Fixture mode only: the colour reading to use instead of the AI ("#RRGGBB", or "unsure"). */
  fixtureColour?: string
}

/** An item that passed every filter. */
export interface GapCandidate {
  title: string
  shop: string
  /** Price in A$. */
  price: number
  imageUrl: string | null
  link: string | null
  productId: string | null
  fixtureColour?: string
}

export class ProductSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductSourceError'
  }
}

/** A place products come from. An empty array is a normal answer; failures throw ProductSourceError. */
export interface ProductSource {
  search(query: GapSearchQuery): Promise<RawProduct[]>
}
