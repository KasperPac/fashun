# Phase 2: Colour Palette — Design Spec

**Date:** 2026-06-01  
**Status:** Approved

---

## Overview

Add colour season awareness throughout the app. Users already have `colour_season` stored from onboarding. Phase 2 surfaces that data as: a dedicated Palette tab showing their season and wardrobe analysis, per-item palette match badges in the wardrobe, and an "In palette only" filter toggle.

---

## Architecture

No new API routes. No DB migrations. All palette matching runs client-side using HSL colour math in `packages/shared`. Season and wardrobe data already fetched by existing routes.

---

## Section 1 — Shared Package: Season Palettes + Matching Logic

**File:** `packages/shared/src/seasons.ts`

### Functions

**`hexToHsl(hex: string): [number, number, number]`**  
Converts a hex colour string (e.g. `#8B4513`) to `[hue, saturation, lightness]` where H is 0–360, S and L are 0–100.

**`isColourInSeason(hex: string, season: ColourSeason): boolean`**  
Core matching function. Converts hex to HSL then checks against the season's profile:

| Season | Hue range | Saturation | Lightness | Notes |
|---|---|---|---|---|
| Spring | 0–80°, 300–360° | > 20% | 40–85% | Warm, clear, light–medium |
| Autumn | 0–60°, 300–360° | 15–75% | 20–65% | Warm, muted, deep–medium |
| Summer | 100–300° | 5–60% | 35–80% | Cool, soft, light–medium |
| Winter | 100–280° OR (S < 10%) OR (L < 15%) | any | any | Cool/clear OR near-black/white |

**`getSeasonSwatches(season: ColourSeason): { swatches: string[], avoid: string[] }`**  
Returns curated hex arrays for the palette UI. 8–12 swatches per season, 3–4 avoid colours.

### Season Swatches Reference

| Season | Example swatches | Avoid |
|---|---|---|
| Spring | Peach, coral, warm yellow, ivory, camel, salmon, warm green | Icy blue, slate grey, cool fuchsia |
| Summer | Dusty rose, lavender, sage, soft blue, mauve, powder blue | Bright orange, olive, warm brown |
| Autumn | Burnt orange, terracotta, olive, mustard, chocolate, rust | Icy pink, bright cobalt, cool grey |
| Winter | Navy, burgundy, pure white, icy blue, charcoal, emerald | Camel, warm beige, muted mustard |

**`SEASON_DESCRIPTIONS: Record<ColourSeason, string>`**  
One-line descriptions for the palette page hero (e.g. "Rich, earthy tones with warm undertones").

**Tests:** `packages/shared/src/seasons.test.ts` — covers `hexToHsl` with known values, `isColourInSeason` with 2–3 in/out examples per season.

---

## Section 2 — Palette Page

**Route:** `/palette`  
**File:** `apps/web/src/app/(app)/palette/page.tsx`  
**Type:** Server component

### Data fetching

```typescript
const supabase = await createServerClient()
const { data: { user } } = await supabase.auth.getUser()
const { data: profile } = await supabase.from('users').select('colour_season').eq('id', user.id).single()
const { data: items } = await supabase.from('wardrobe_items').select('colours').eq('user_id', user.id).eq('ownership', 'owned')
```

### Match stats computation (server-side)

```typescript
const season = profile.colour_season
const inPalette = items.filter(item =>
  item.colours?.some(hex => isColourInSeason(hex, season))
).length
const outPalette = items.length - inPalette
const matchPct = items.length ? Math.round((inPalette / items.length) * 100) : 0
```

### Layout

1. **Season hero card** — full-width card with per-season gradient background, emoji, season name (from `SEASON_LABELS`), one-line description. Gradient map: Spring = pink→peach, Summer = blue→lavender, Autumn = burnt orange→brown, Winter = dark navy→charcoal.
2. **Wardrobe analysis row** — three equal stat chips: `{inPalette} in palette` (green), `{outPalette} off palette` (amber), `{matchPct}% match` (white). Hidden if wardrobe is empty.
3. **Your Colours** — `getSeasonSwatches(season).swatches` rendered as a flex-wrap grid of 36×36px rounded colour dots.
4. **Avoid** — `getSeasonSwatches(season).avoid` rendered as the same sized dots with 50% opacity and a × overlay.

### Empty state

If `colour_season` is null: render a prompt card — "Complete your skin tone analysis to see your colour palette" with a button linking to `/onboarding`.

### Nav

Add **Palette** tab to `apps/web/src/app/(app)/layout.tsx` between Wardrobe and Shop. Icon: 🎨 or a colour wheel SVG.

---

## Section 3 — Item Card Palette Badge

**File:** `apps/web/src/components/wardrobe/ItemCard.tsx`

### Props change

```typescript
interface ItemCardProps {
  item: WardrobeItem
  onDelete: (id: string) => void
  userSeason?: ColourSeason  // new optional prop
}
```

### Badge logic

```typescript
const paletteMatch = userSeason && item.colours?.length
  ? item.colours.some(hex => isColourInSeason(hex, userSeason))
  : null  // null = can't determine, no badge
```

### Badge rendering

Absolute-positioned pill, top-right corner of the image:
- `paletteMatch === true` → green pill, "✓ In palette"  
- `paletteMatch === false` → amber pill, "Off palette"  
- `paletteMatch === null` → nothing rendered

### Data threading

`WardrobeGrid.tsx` receives `userSeason?: ColourSeason` and passes to each `ItemCard`.

`wardrobe/page.tsx` adds one query:
```typescript
const { data: profile } = await supabase.from('users').select('colour_season').eq('id', user.id).single()
```
Passes `profile?.colour_season ?? undefined` to `WardrobeGrid`.

---

## Section 4 — Palette Filter Toggle

**File:** `apps/web/src/components/wardrobe/PaletteFilterToggle.tsx`

```typescript
interface PaletteFilterToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}
```

Renders a two-pill toggle: "All items" (left) and "🎨 In palette" (right). Active pill is filled purple, inactive is ghost. Hidden entirely if `userSeason` is undefined.

**In wardrobe page:**

```typescript
const [paletteOnly, setPaletteOnly] = useState(false)

const filteredItems = paletteOnly
  ? items.filter(item => item.colours?.some(hex => isColourInSeason(hex, userSeason!)))
  : items
```

`PaletteFilterToggle` sits between `CategoryCarousel` and `WardrobeGrid`.

---

## Task Order

1. **#11** — Shared package: `seasons.ts` + tests (unblocks everything)
2. **#12** — Palette page (blocked by #11)
3. **#13** — Item card badge (blocked by #11)
4. **#14** — Wardrobe filter toggle (blocked by #11 + #13)

---

## Out of Scope (Phase 2)

- Palette-based shop filtering (Phase 4)
- Re-analysing existing items already tagged with colours
- Editing/overriding your colour season manually
- Mobile (Expo) palette screen
