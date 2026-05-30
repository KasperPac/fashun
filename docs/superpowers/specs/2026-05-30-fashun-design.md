# Fashun — Design Spec
**Date:** 2026-05-30  
**Status:** Approved  
**Platform:** Next.js Web (Vercel) + Expo Mobile (iOS/Android)  
**Target audience:** Private beta — small invite-only group  
**Market:** Australia  

---

## 1. Overview

Fashun is a personal digital wardrobe app that combines AI outfit recommendations, virtual try-on, and palette-aware shopping. It solves three problems existing wardrobe apps don't: seeing outfits on your actual body, getting recommendations grounded in colour science, and buying locally in Australia.

**Core value proposition:**
- AI recommends outfits from your wardrobe daily, filtered by occasion
- Try any outfit on a photo of yourself via AI (Fashn.ai)
- Your personal colour season (derived from your skin tone) guides everything
- Shop Australian retailers, filtered by your style and budget, with affiliate links

---

## 2. Architecture

### 2.1 Frontend

| Layer | Technology | Deployment |
|---|---|---|
| Web | Next.js 15 (App Router) | Vercel |
| Mobile | Expo (React Native) | iOS App Store + Google Play |
| Shared types | `packages/shared` (TypeScript) | Turborepo monorepo |

The Expo mobile app calls the Next.js API routes directly — no separate backend to deploy or maintain.

### 2.2 Backend & Services

| Service | Purpose |
|---|---|
| **Supabase** | Auth (invite-only), Postgres database, file storage (images) |
| **Fashn.ai** | AI virtual try-on ($0.075/try-on, on-demand) |
| **Photoroom API** | Background removal from clothing photos (~1s) |
| **Claude API** (Vision) | Auto-tagging clothing items (category, colour, style) |
| **Claude API** (text) | Outfit recommendations v1.1 (layered on rule-based engine) |
| **Commission Factory** | Australian affiliate network for shopping links |

### 2.3 Monorepo Structure

```
fashun/
├── apps/
│   ├── web/          # Next.js app
│   └── mobile/       # Expo app
├── packages/
│   └── shared/       # TypeScript types, utils, constants
└── turbo.json
```

---

## 3. Onboarding Flow

Five steps, completed once. All settings editable later from Profile.

1. **Sign up** — email + invite code (private beta gating)
2. **Skin tone selfie** — photo analysed for undertone (warm/cool/neutral) and depth (light/medium/deep) → colour season assigned (Spring / Summer / Autumn / Winter). Face image is not stored — only extracted colour data is saved.
3. **Style preferences** — multi-select from 8 archetypes: Casual, Smart Casual, Business, Streetwear, Minimalist, Athleisure, Bohemian, Glam
4. **Per-category budgets** — min/max range slider for: Tops, Bottoms, Shoes, Outerwear, Bags, Accessories
5. **Add first items** — prompted to add at least 3 items before seeing the full app

---

## 4. Features

### 4.1 Wardrobe

The core data store. Split into two sections toggled at the top of the screen:

- **Owned** — clothes the user physically has
- **Wishlist** — items saved from stores (have a Buy link)

**Wardrobe screen:**
- Horizontal category carousel: All · Tops · Bottoms · Shoes · Outerwear · Bags · Accessories
- 3-column grid of item cards (cropped garment image, transparent background)
- Filter by colour, occasion tag, or season compatibility
- Item detail: image, category, colours, style tags, outfit history, Buy link (wishlist only)

**Adding items — three methods:**

| Method | Platform | Flow |
|---|---|---|
| Camera | Mobile | Point at garment → capture → auto BG removal (Photoroom) → Claude Vision tags it → user confirms → save |
| File upload | Web | Drag & drop or browse → same processing pipeline → bulk queue supported |
| Save from store | Both | In-app Shop tab "Save" button; iOS/Android Share Sheet on any retailer page; desktop bookmarklet |

**AI processing pipeline (camera + upload):**
1. Photoroom API strips background (~1s)
2. Claude Vision detects: category, dominant colours, style tags (casual/formal/smart-casual etc.)
3. User reviews and can edit any field before saving
4. Colour data feeds into palette analysis

### 4.2 AI Outfit Recommendations

The primary flow — users open the Outfits tab and AI has already prepared looks.

**Recommendation feed:**
- 3–5 AI-generated outfits, generated on first app open each day (triggered client-side on mount if last_generated_at < today). Cached in Supabase until next day's open.
- Each card shows: outfit item strip, colour dots, occasion tag, palette match %
- Occasion filter tabs: All · Work · Casual · Dinner · Event
- Primary CTA on each card: **"Try This On"**
- Secondary: **"Build manually"** link at bottom of screen

**How the AI picks outfits (v1 — rule-based engine):**
1. **Colour harmony** — pairs items whose colours match the user's season palette; flags clashes before suggesting
2. **Style compatibility** — matches formality levels (no blazer + boardshorts)
3. **Occasion awareness** — respects the active occasion filter
4. **Wardrobe rotation** — tracks worn dates, surfaces underused items

**v1.1 upgrade:** Layer Claude API on top for personalised style tips, edge case handling, and natural language outfit descriptions. ~$0.001 per recommendation set.

### 4.3 AI Virtual Try-On

Triggered from an outfit card ("Try This On") or from the manual builder.

**Flow:**
1. Outfit selected (3–4 items)
2. Palette compatibility check shown before proceeding (warn if clash, don't block)
3. Fashn.ai API call — garment images + user's reference photo → composite result in ~8s
4. Progress indicator: Segmenting → Loading photo → Compositing → Done
5. Result screen:
   - Full-body try-on image
   - **Save Look** — stores to Saved Outfits
   - **Swap Item** — swap one garment and re-run
   - **Shop Similar** — Australian retailer links for each item, filtered by budget

**User photo:** stored once in Supabase Storage per user, reused for all try-ons. User can update it from Profile.

**Cost:** $0.075/try-on on-demand. Move to Fashn.ai Tier I ($19/month) once usage warrants.

### 4.4 Colour Palette

Synthesises skin tone + wardrobe data into actionable guidance.

**Palette tab shows:**
- Season badge (e.g. Warm Autumn 🍂) with description
- Best colours swatch row (6–8 named swatches)
- Colours to avoid swatch row
- Wardrobe match % — how many owned items fall within the palette
- "X items clash" — tap to see them highlighted in the wardrobe

**Data sources:**
- Skin tone selfie (onboarding) → undertone + depth → season
- Wardrobe item colours (extracted during add-item pipeline) → match %
- Season → best/avoid colour sets (hard-coded colour theory rules per season)

**Palette feeds into:**
- Outfit recommendations (colour harmony check)
- Shop tab (filters suggestions to palette-compatible colours)
- Add item flow (flags if a new item clashes with palette)

### 4.5 Shop

Australian-first product discovery, personalised and monetised.

**Filters applied automatically:**
- Colour: within user's season palette
- Style: matches user's style preferences
- Budget: within per-category range

**Layout:**
- Category tabs matching wardrobe categories
- Product cards: image, name, retailer, price, colour swatches
- **Save** → adds to Wardrobe Wishlist
- **Buy AU →** → affiliate link via Commission Factory

**Product catalog source:**
- Commission Factory provides a product data feed (CSV/API) from registered AU retailers — this is the primary product source
- Feed is imported and stored in Supabase, refreshed nightly via a Vercel cron job (`/api/shop/sync`)
- Products are tagged with category, colour, style, and price on import so filters are fast queries against local data (not live retailer calls)

**Affiliate integration:**
- Commission Factory for AU retailers (THE ICONIC, Country Road, ASOS AU, etc.)
- Where no affiliate link exists, plain retailer URL shown
- Links tracked server-side via Next.js API route to avoid exposing affiliate credentials client-side

**Wardrobe gap suggestions:**
- AI detects missing versatile pieces (e.g. "You have no neutral trousers — here are 3 within your budget")
- Surfaced as a "Wardrobe gaps" card at the top of the Shop tab

---

## 5. Data Model

```sql
-- Core user profile
users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  invite_code text,
  skin_undertone text,        -- warm | cool | neutral
  skin_depth text,            -- light | medium | deep
  colour_season text,         -- spring | summer | autumn | winter
  style_prefs text[],         -- ['casual', 'minimalist', ...]
  budgets jsonb,              -- { tops: [20,150], bottoms: [30,200], ... }
  try_on_photo_url text,
  created_at timestamptz
)

-- Wardrobe items (owned + wishlist)
wardrobe_items (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users,
  ownership text,             -- owned | wishlist
  category text,              -- tops | bottoms | shoes | outerwear | bags | accessories
  name text,
  colours text[],             -- extracted hex or named colours
  style_tags text[],          -- casual | smart-casual | formal | ...
  occasion_tags text[],       -- work | casual | dinner | event
  image_url text,             -- transparent background PNG in Supabase Storage
  store_url text,             -- original product URL (wishlist)
  affiliate_url text,         -- Commission Factory link (wishlist)
  price numeric,              -- listed price (wishlist)
  retailer text,              -- THE ICONIC | Country Road | ...
  last_worn_at timestamptz,
  created_at timestamptz
)

-- Saved outfits
outfits (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users,
  name text,
  item_ids uuid[],            -- references wardrobe_items
  occasion text,
  ai_generated boolean,
  palette_match_pct integer,
  try_on_image_url text,      -- result from Fashn.ai
  worn_count integer DEFAULT 0,
  last_worn_at timestamptz,
  created_at timestamptz
)
```

---

## 6. API Routes

All served from Next.js (`apps/web/app/api/`). Called by both web and mobile.

| Route | Method | Purpose |
|---|---|---|
| `/api/wardrobe` | GET/POST/DELETE | CRUD wardrobe items |
| `/api/wardrobe/process` | POST | Run BG removal + AI tagging pipeline |
| `/api/outfits` | GET/POST | CRUD outfits |
| `/api/outfits/recommend` | POST | Generate AI outfit recommendations |
| `/api/try-on` | POST | Trigger Fashn.ai try-on, return result URL |
| `/api/palette` | GET | Return computed palette for user |
| `/api/shop` | GET | Fetch products filtered by palette/style/budget |
| `/api/shop/affiliate` | GET | Redirect via Commission Factory (server-side) |
| `/api/shop/sync` | POST | Nightly cron — import Commission Factory product feed into Supabase |
| `/api/auth/invite` | POST | Validate invite code on signup |

---

## 7. Error Handling

| Scenario | Handling |
|---|---|
| Fashn.ai try-on fails | Show error state with retry button; don't charge credit until success confirmed |
| Photoroom BG removal fails | Fall back to manual crop UI; user can proceed without BG removal |
| Claude Vision tagging fails | Show empty tag fields; user enters manually |
| Affiliate link unavailable | Show plain retailer URL with "Visit store" label |
| User photo missing for try-on | Prompt to upload reference photo before try-on |
| Bulk upload queue item fails | Mark item as failed in queue UI; allow individual retry |

---

## 8. Key Constraints & Decisions

- **Invite-only beta:** Supabase Auth with invite code validation. No self-signup.
- **Australian market first:** All shopping recommendations from AU retailers. International can be added later.
- **Face photo privacy:** Skin tone selfie analysed and discarded — only colour data stored. Try-on reference photo stored in private Supabase Storage bucket, user-deletable.
- **No weather integration in v1:** Occasion filter is manual. Weather-aware suggestions are a future feature.
- **Sale alerts not in v1:** Noted as future — notify when wishlisted item drops into budget range.
- **Fashn.ai on-demand for beta:** Move to Tier I ($19/month) once usage exceeds ~250 try-ons/month.

---

## 9. Out of Scope (v1)

- Social / sharing outfits publicly
- Weather-aware outfit suggestions
- Sale price alerts
- Male/female/non-binary specific model options for try-on
- Multi-language support
- Android-only features (parity with iOS assumed)
