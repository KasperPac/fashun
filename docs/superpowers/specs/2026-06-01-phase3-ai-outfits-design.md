# Phase 3: AI Outfits + Virtual Try-On — Design Spec

**Date:** 2026-06-01  
**Status:** Approved

---

## Goal

Add AI-powered outfit suggestions and virtual try-on to the wardrobe. Users tap a wardrobe item to reveal two actions: "Style it" (Claude generates 3 outfit combinations built around that piece) and "Try on" (Fashn.ai renders the user wearing the garment). Results appear in a modal overlay. Generated outfits can be saved to a persistent collection accessible from within the modal.

---

## Scope decisions

- Both features ship in one phase
- Entry point: tap a wardrobe card → action bar; no new nav tab
- Results: modal overlay over the wardrobe grid (grid dims behind it)
- Saved outfits: persisted in Supabase; accessible via a link inside the modal
- Build order: "Style it" first, "Try on" second

---

## Architecture

Three pieces bolt onto the existing wardrobe page:

1. **Action bar** — tapping a `WardrobeCard` overlays two buttons at the bottom of the card ("✨ Style it", "👤 Try on"). Tapping outside collapses it.

2. **Outfit modal** — a full-screen overlay shared by both features. Three internal states: `loading`, `results`, `error`. The grid dims behind it.

3. **API routes** — API keys stay server-side. Two new Next.js route handlers handle Claude and Fashn.ai calls respectively.

Saved outfits live in a new `outfits` Supabase table. A `SavedOutfitsSheet` slides up from within the modal.

---

## Data model

New table:

```sql
create table outfits (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references users(id) on delete cascade not null,
  item_id          uuid references wardrobe_items(id) on delete cascade not null,
  name             text not null,
  occasion         text,
  pieces           jsonb not null,
  description      text,
  try_on_image_url text,
  created_at       timestamptz default now()
);

alter table outfits enable row level security;

create policy "Users manage own outfits"
  on outfits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

`pieces` schema (JSONB array):
```json
[{
  "label": "Rust linen shirt",
  "colour_hex": "#B7410E",
  "item_id": "uuid | null",
  "in_wardrobe": true
}]
```

`item_id` in a piece is `null` when Claude suggests something the user doesn't own yet. `try_on_image_url` is populated only when the user runs try-on and saves the result.

---

## "Style it" — Claude integration

**Route:** `POST /api/outfits/generate`  
**Auth:** reads session from Supabase cookie; returns 401 if unauthenticated.

### Server-side assembly

Fetch in parallel:
- Anchor item: `name`, `category`, `colours` from `wardrobe_items` where `id = item_id`
- User profile: `colour_season` from `users`
- Wardrobe summary: all other items (`name`, `category`, `colours`) owned by the user

Group wardrobe items by category for the prompt (Tops / Bottoms / Shoes / Accessories / Other).

Convert each hex to a human-readable label using a small lookup table (e.g. `#8B7355 → tan`). Unknown hexes render as their hex string.

### Season prompt context

Add `SEASON_PROMPT_CONTEXT` to `packages/shared/src/seasons.ts`:

```typescript
export const SEASON_PROMPT_CONTEXT: Record<ColourSeason, { suits: string; avoid: string }> = {
  'Spring':        { suits: 'warm peach, coral, warm ivory, light camel, golden yellow, warm turquoise, apple green', avoid: 'cool greys, icy tones, jet black, stark white' },
  'Summer':        { suits: 'soft rose, dusty blue, lavender, cool mauve, powder pink, soft white, cool grey', avoid: 'warm oranges, earthy browns, bright yellows, jet black' },
  'Autumn':        { suits: 'earthy tones, warm oranges, rusts, burnt sienna, olive greens, camel, chocolate brown, warm beige, terracotta', avoid: 'cool tones, icy blues, bright whites, jet black, cool pinks' },
  'Winter':        { suits: 'pure white, jet black, royal blue, emerald green, true red, icy pastels, sharp contrast', avoid: 'warm earthy tones, muted pastels, oranges, camel' },
}
```

### Prompt

**System message:**
```
You are a personal colour and style consultant. Your outfit suggestions always respect the user's seasonal colour palette. Return only valid JSON — no explanation, no markdown, just the JSON array.
```

**User message (example for Warm Autumn user):**
```
The user's colour season is Autumn. Autumn suits: earthy tones, warm oranges, rusts,
burnt sienna, olive greens, camel, chocolate brown, warm beige, terracotta.
Avoid: cool tones, icy blues, bright whites, jet black, cool pinks.

Suggest 3 complete outfit combinations built around this anchor item:
**Slim Fit Chinos** | Bottoms | Colours: #8B7355 (tan), #6B5B45 (dark tan)

Their wardrobe:
Tops:
  - White Oxford Shirt [id:abc-123] | #F5F5F0 (off-white)
  - Rust Crew Neck [id:def-456] | #B7410E (rust)
Shoes:
  - Brown Leather Boots [id:ghi-789] | #4a3728 (dark brown)
Accessories:
  - (none)

Rules:
1. Prefer wardrobe pieces — reference them by their id
2. For any suggested item not in their wardrobe, keep colours strictly within
   the Autumn palette above
3. Each outfit must include a top + bottom + shoes minimum
4. Vary occasions across the 3 suggestions

Return exactly this JSON schema (array of 3):
[{
  "name": "2-3 word name",
  "occasion": "e.g. Weekend brunch",
  "pieces": [{
    "label": "e.g. Rust linen shirt",
    "colour_hex": "#rrggbb",
    "item_id": "uuid or null",
    "in_wardrobe": true
  }],
  "description": "One sentence."
}]
```

### JSON parsing

Parse Claude's response with `JSON.parse` in a try/catch. On failure, retry once. If the second attempt also fails, return HTTP 500. The modal surfaces this as an inline error with a retry button.

### Saving

`POST /api/outfits` — saves a single suggestion to the `outfits` table. Returns the created row.  
`GET /api/outfits` — returns all saved outfits for the authenticated user, ordered by `created_at desc`. The save button in `OutfitSuggestionCard` calls this; on success it shows a ✓ confirmation and the footer "View saved outfits →" link becomes active.

---

## "Try on" — Fashn.ai integration

**Route:** `POST /api/outfits/try-on`  
**Auth:** same cookie-based auth as above.

### Flow

1. Fetch item's `image_url` and user's `try_on_photo_url`
2. If either is missing → HTTP 400 with a descriptive `error` field. The modal renders the appropriate inline message:
   - No item photo: "Add a photo to this item to enable try-on"
   - No try-on photo: "Add a try-on photo in your profile settings"
3. Map category to Fashn.ai garment type: `tops → "tops"`, `bottoms → "bottoms"`, dresses/jumpsuits → `"one-pieces"`, all others → `"tops"` (safe fallback)
4. POST to Fashn.ai `/run` with `{ model_image, garment_image, category }` → receive `prediction_id`
5. Poll `GET /status/{prediction_id}` every 2 seconds server-side until `completed` or `failed`. Fashn.ai renders in ~10 seconds; blocking is fine within Next.js's 300s timeout.
6. On `completed`: return `{ image_url }` to client
7. On `failed`: return HTTP 500; modal shows error + retry button

### Disabled state

"👤 Try on" renders disabled (muted colour, `pointer-events: none`, tooltip on hover) when the item has no `image_url`. No API call is made.

### Saving

When the user saves a try-on result, the `image_url` is stored in `outfits.try_on_image_url`. This is only written when the user explicitly saves — ephemeral renders are not persisted.

---

## UI components

### Modified

**`WardrobeCard.tsx`**  
Accept `isActive: boolean` and `onActivate: () => void` props (no local state). When `isActive`, render an action bar overlay at the bottom of the card:
- "✨ Style it" — purple filled button
- "👤 Try on" — ghost button; disabled + tooltip if `item.image_url` is null

**`WardrobeGrid.tsx`**  
Track `activeCardId: string | null` state. Pass `isActive={item.id === activeCardId}` and `onActivate={() => setActiveCardId(item.id)}` to each card. A `useEffect` adds a document click listener; clicking outside any card sets `activeCardId = null`.

### New

**`OutfitModal.tsx`**  
Full-screen fixed overlay, `z-50`. Semi-transparent dark backdrop (`bg-black/70`). White scroll container centred. Three render states driven by a `mode` prop:
- `loading` — spinner + contextual label ("Generating outfit ideas…" / "Rendering try-on…")
- `results` — for Style it: list of `OutfitSuggestionCard`; for Try on: the rendered `<img>`
- `error` — error message + "Try again" button

Footer (results state only): "💾 View saved outfits →" — shown only when the user has at least one saved outfit. The modal fetches the count from `GET /api/outfits` on open; the link appears once the count is > 0 (or immediately if a save happens during this session).

**`OutfitSuggestionCard.tsx`**  
Displays one outfit suggestion:
- Name + occasion badge
- Colour swatch row — each swatch is a small circle; swatches for `in_wardrobe: true` items get a ✓ tick overlay
- One-sentence description
- "Save outfit" button → calls `POST /api/outfits`; transitions to ✓ "Saved"

**`SavedOutfitsSheet.tsx`**  
Slides up from within the modal (not a separate page). Lists all saved outfits for the current user, grouped by anchor item name. Each entry shows: outfit name, occasion, swatch row. Fetched from `GET /api/outfits` on mount.

---

## Error handling summary

| Scenario | Behaviour |
|---|---|
| Claude returns malformed JSON | Retry once server-side; on second failure return 500 → modal inline error + retry |
| Claude API unreachable | HTTP 502 → modal inline error + retry |
| Item has no photo (try-on) | Button disabled with tooltip; no API call |
| User has no try-on photo | HTTP 400 → modal message with link to settings |
| Fashn.ai render fails | HTTP 500 → modal inline error + retry |
| Supabase save fails | Toast error; outfit not marked as saved |

---

## Out of scope for Phase 3

- Editing or deleting saved outfits (Phase 4)
- Sharing outfits externally
- AI outfit suggestions on mobile (Expo app)
- Outfit calendar / "what to wear today"
