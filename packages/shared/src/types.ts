export type SkinUndertone = 'warm' | 'cool' | 'neutral'
export type SkinDepth = 'light' | 'medium' | 'deep'
export type ColourSeason = 'spring' | 'summer' | 'autumn' | 'winter'
export const HAIR_COLOURS = [
  'black', 'dark-brown', 'brown', 'auburn', 'red', 'blonde', 'grey', 'white',
] as const
export type HairColour = (typeof HAIR_COLOURS)[number]
export const EYE_COLOURS = ['brown', 'hazel', 'green', 'blue', 'grey', 'amber'] as const
export type EyeColour = (typeof EYE_COLOURS)[number]
export const STYLE_PREFS = [
  'casual', 'smart-casual', 'business', 'streetwear',
  'minimalist', 'athleisure', 'bohemian', 'glam',
] as const
export type StylePref = (typeof STYLE_PREFS)[number]
export type WardrobeCategory = 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'bags' | 'accessories'
export const OCCASIONS = ['casual', 'smart-casual', 'work', 'formal'] as const
export type OccasionTag = (typeof OCCASIONS)[number]
export const OCCASION_LABELS: Record<OccasionTag, string> = {
  casual: 'Casual',
  'smart-casual': 'Smart casual',
  work: 'Work',
  formal: 'Formal',
}
export type Ownership = 'owned' | 'wishlist'

export interface CategoryBudgets {
  tops: [number, number]
  bottoms: [number, number]
  shoes: [number, number]
  outerwear: [number, number]
  bags: [number, number]
  accessories: [number, number]
}

export const DEFAULT_BUDGETS: CategoryBudgets = {
  tops: [20, 150],
  bottoms: [30, 200],
  shoes: [50, 350],
  outerwear: [80, 500],
  bags: [40, 300],
  accessories: [10, 100],
}

export interface UserProfile {
  id: string
  email: string
  skinUndertone?: SkinUndertone
  skinDepth?: SkinDepth
  hairColour?: HairColour
  eyeColour?: EyeColour
  colourSeason?: ColourSeason
  bestColours?: string[]
  avoidColours?: string[]
  suggestedStyles?: StylePref[]
  stylePrefs: StylePref[]
  budgets: CategoryBudgets
  tryOnPhotoUrl?: string
  onboardingCompletedAt?: string
  createdAt: string
}

export interface WardrobeItem {
  id: string
  userId: string
  ownership: Ownership
  category: WardrobeCategory
  name: string
  colours: string[]
  styleTags: string[]
  occasionTags: OccasionTag[]
  imageUrl: string
  storeUrl?: string
  affiliateUrl?: string
  price?: number
  retailer?: string
  lastWornAt?: string
  /** True when the item has a "photo of me wearing it". The path itself is never sent to the browser. */
  hasWornPhoto?: boolean
  createdAt: string
}

export interface ProcessItemRequest {
  imageBase64: string
}

export interface ProcessItemResponse {
  processedImageUrl: string
  category: WardrobeCategory
  colours: string[]
  styleTags: string[]
  occasionTags: OccasionTag[]
  suggestedName: string
}

/** Response of the selfie analysis endpoint. The selfie itself is never stored. */
export interface ColourProfileResponse {
  undertone: SkinUndertone
  depth: SkinDepth
  /** Null when the photo reading didn't give a usable value; shown as "not set". */
  hairColour: HairColour | null
  eyeColour: EyeColour | null
  season: ColourSeason
  bestColours: string[]
  avoidColours: string[]
  suggestedStyles: StylePref[]
}
