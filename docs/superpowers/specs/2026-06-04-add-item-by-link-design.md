# Feature A — Add Item by Store Link — Design Spec

**Date:** 2026-06-04
**Status:** Approved
**Phase:** 4 (parallel to Shop)
**Depends on:** Existing wardrobe add pipeline (`/api/wardrobe/process`, `/api/wardrobe`)

---

## 1. Overview

A second way to add wardrobe items: instead of photographing a garment, the user
provides a **store link** (or a description + store name) and the AI pulls the
product in from online — name, category, colour, price, retailer, and the official
product photo. The user optionally attaches a quick snap of the actual item so the
AI can match the correct colour variant.

This complements, and does not replace, the existing photo-upload flow. It is the
primary way the user gets clothes they bought online into the app quickly.

---

## 2. Where It Lives

The existing **Add Item** page (`/wardrobe/add`) gains a method toggle at the top:

- `📸 Photo` — today's flow, unchanged (`AddItemForm`)
- `🔗 Link` — new flow (`AddByLinkForm`)

No new route/page. The toggle is local UI state on the add page.

---

## 3. Inputs (Link tab)

| Input | Required | Purpose |
|---|---|---|
| Store URL | Primary path | Exact product page to extract from |
| Description + store name | Fallback path | Used when the user has no link → web search |
| Photo of the actual item | Optional | Drives colour-variant matching |
| Ownership toggle | Yes (default **Owned**) | Owned · Wishlist |

The URL field and the "No link? Describe it" path are mutually exclusive entry
modes within the tab. The store link is saved on the item regardless of ownership
(useful as a re-order / buy-again link).

---

## 4. Flow

1. User submits the Link tab form.
2. New server route **`POST /api/wardrobe/from-link`** handles extraction.
3. **URL path:** server fetches the page HTML. Extraction order of preference:
   - **Open Graph** tags (`og:image`, `og:title`, `og:price:amount`)
   - **schema.org Product JSON-LD** (name, image, offers, colour variants)
   - **Claude** fills any remaining gaps (category, colour variants, retailer) from
     the page text/meta.
4. **Search fallback path:** description + store → **Claude API server-side web
   search tool** locates the product page → same extraction. Returns 1–3 candidate
   matches for the user to confirm before proceeding.
5. **Colour resolution:**
   - Variants available **+ user attached a photo** → Claude Vision compares the
     user's photo against the variant options and selects the closest.
   - Variants available **+ no photo** → present variant chips; user picks the one
     they bought.
   - **No variants on the page** → extract colour(s) from the product image using
     the existing colour-extraction step.
6. **Image:** the chosen product photo becomes the wardrobe image. It is run through
   the same **Photoroom background-removal** step used by the photo flow, so the
   wardrobe grid stays visually consistent (transparent-background PNGs).
7. **Confirm screen:** same pattern as the photo flow — product image, name,
   category, colours, ownership, store link. User edits any field and saves via the
   existing **`POST /api/wardrobe`**.

---

## 5. Data Model

**No schema change.** `wardrobe_items` already has the needed columns:
`store_url`, `affiliate_url`, `price`, `retailer`, `colours`, `category`,
`style_tags`, `ownership`, `image_url`.

The from-link route returns the same shape the confirm screen already consumes,
plus `storeUrl`, `price`, `retailer`, and (when present) `colourVariants`.

---

## 6. API

### `POST /api/wardrobe/from-link`

**Request (URL mode):**
```json
{ "url": "https://www.theiconic.com.au/...", "itemPhotoBase64": "<optional>" }
```

**Request (search mode):**
```json
{ "description": "black Nike running shoes", "store": "THE ICONIC" }
```

**Response (extracted, ready to confirm):**
```json
{
  "suggestedName": "...",
  "category": "shoes",
  "colours": ["#1a1a1a"],
  "colourVariants": [{ "label": "Black", "hex": "#1a1a1a", "selected": true }],
  "styleTags": ["casual"],
  "processedImageUrl": "<transparent PNG in Supabase Storage>",
  "storeUrl": "https://...",
  "price": 180,
  "retailer": "THE ICONIC"
}
```

**Response (search mode, needs confirmation):**
```json
{ "candidates": [{ "url": "...", "title": "...", "imageUrl": "...", "retailer": "..." }] }
```

Save uses the existing `POST /api/wardrobe` (no new save route).

---

## 7. Error Handling

| Scenario | Handling |
|---|---|
| Page fetch blocked / 403 / unparseable | Fall to manual entry, pre-filled with whatever was extracted (e.g. og:image only) |
| Web search returns nothing | Show "couldn't find it — add the link or enter manually" → manual entry |
| Multiple search candidates | Show candidate cards; user picks the right one |
| Background removal fails | Use the product image as-is (skip transparency); user can proceed |
| Colour variant match low-confidence | Pre-select best guess; user can change on the variant chips / confirm screen |
| No product image found | Manual entry; user can still attach their own photo as the image |

Because the user confirms every field before saving, low-confidence extraction is
never silently persisted.

---

## 8. Components

- `AddItemMethodToggle` — `📸 Photo` / `🔗 Link` switch on the add page.
- `AddByLinkForm` — URL field, describe-it fallback, optional item-photo attach,
  ownership toggle, submit → calls `/api/wardrobe/from-link`.
- `LinkConfirmCard` — confirm/edit screen (can largely reuse the photo flow's confirm
  UI; share a component if the overlap is clean).
- `ColourVariantPicker` — variant chips when the page exposes named colours.

---

## 9. Key Decisions

- **Web search = Claude API server-side web search tool**, not a new vendor — the app
  already uses the Claude API. Avoids adding Brave/SerpAPI for the beta.
- **Product image is background-removed** to match the existing wardrobe look, rather
  than stored raw.
- **No DB migration** — the wardrobe schema already supports store-sourced items.
- **Confirm-before-save** is mandatory — extraction is assistive, never authoritative.

---

## 10. Out of Scope

- Bulk import of many links at once (single item per add for v1).
- Price-drop / restock tracking on the saved link.
- Automatic affiliate-link rewriting (Commission Factory) — that belongs to the Shop
  phase, not here.
