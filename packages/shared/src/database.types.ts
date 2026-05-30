// Auto-generated from Supabase schema — regenerate with:
// npx supabase gen types typescript --linked > packages/shared/src/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          skin_undertone: 'warm' | 'cool' | 'neutral' | null
          skin_depth: 'light' | 'medium' | 'deep' | null
          colour_season: 'spring' | 'summer' | 'autumn' | 'winter' | null
          style_prefs: string[]
          budgets: Json
          try_on_photo_url: string | null
          onboarding_completed_at: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          skin_undertone?: 'warm' | 'cool' | 'neutral' | null
          skin_depth?: 'light' | 'medium' | 'deep' | null
          colour_season?: 'spring' | 'summer' | 'autumn' | 'winter' | null
          style_prefs?: string[]
          budgets?: Json
          try_on_photo_url?: string | null
          onboarding_completed_at?: string | null
          created_at?: string
        }
        Update: {
          skin_undertone?: 'warm' | 'cool' | 'neutral' | null
          skin_depth?: 'light' | 'medium' | 'deep' | null
          colour_season?: 'spring' | 'summer' | 'autumn' | 'winter' | null
          style_prefs?: string[]
          budgets?: Json
          try_on_photo_url?: string | null
          onboarding_completed_at?: string | null
        }
      }
      wardrobe_items: {
        Row: {
          id: string
          user_id: string
          ownership: 'owned' | 'wishlist'
          category: 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'bags' | 'accessories'
          name: string
          colours: string[]
          style_tags: string[]
          occasion_tags: string[]
          image_url: string
          store_url: string | null
          affiliate_url: string | null
          price: number | null
          retailer: string | null
          last_worn_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ownership: 'owned' | 'wishlist'
          category: 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'bags' | 'accessories'
          name: string
          colours?: string[]
          style_tags?: string[]
          occasion_tags?: string[]
          image_url: string
          store_url?: string | null
          affiliate_url?: string | null
          price?: number | null
          retailer?: string | null
          last_worn_at?: string | null
          created_at?: string
        }
        Update: {
          ownership?: 'owned' | 'wishlist'
          category?: 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'bags' | 'accessories'
          name?: string
          colours?: string[]
          style_tags?: string[]
          occasion_tags?: string[]
          image_url?: string
          store_url?: string | null
          affiliate_url?: string | null
          price?: number | null
          retailer?: string | null
          last_worn_at?: string | null
        }
      }
      outfits: {
        Row: {
          id: string
          user_id: string
          name: string | null
          item_ids: string[]
          occasion: 'work' | 'casual' | 'dinner' | 'event' | null
          ai_generated: boolean
          palette_match_pct: number | null
          try_on_image_url: string | null
          worn_count: number
          last_worn_at: string | null
          last_recommended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name?: string | null
          item_ids?: string[]
          occasion?: 'work' | 'casual' | 'dinner' | 'event' | null
          ai_generated?: boolean
          palette_match_pct?: number | null
          try_on_image_url?: string | null
          worn_count?: number
          last_worn_at?: string | null
          last_recommended_at?: string | null
          created_at?: string
        }
        Update: {
          name?: string | null
          item_ids?: string[]
          occasion?: 'work' | 'casual' | 'dinner' | 'event' | null
          ai_generated?: boolean
          palette_match_pct?: number | null
          try_on_image_url?: string | null
          worn_count?: number
          last_worn_at?: string | null
          last_recommended_at?: string | null
        }
      }
      invite_codes: {
        Row: {
          id: string
          code: string
          used_by: string | null
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          used_by?: string | null
          used_at?: string | null
          created_at?: string
        }
        Update: {
          used_by?: string | null
          used_at?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
