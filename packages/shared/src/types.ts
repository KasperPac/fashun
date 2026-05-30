export type SkinUndertone = 'warm' | 'cool' | 'neutral'
export type SkinDepth = 'light' | 'medium' | 'deep'
export type ColourSeason = 'spring' | 'summer' | 'autumn' | 'winter'
export type StylePref =
  | 'casual' | 'smart-casual' | 'business' | 'streetwear'
  | 'minimalist' | 'athleisure' | 'bohemian' | 'glam'
export type WardrobeCategory = 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'bags' | 'accessories'
export type OccasionTag = 'work' | 'casual' | 'dinner' | 'event'
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
  colourSeason?: ColourSeason
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
  suggestedName: string
}
