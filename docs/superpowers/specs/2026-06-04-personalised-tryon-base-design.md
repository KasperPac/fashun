# Feature B — Personalised Try-On Base — Design Spec

**Date:** 2026-06-04
**Status:** Approved
**Phase:** 5 (try-on upgrade)
**Depends on:** Existing Fashn.ai try-on (`/api/outfits/try-on`), `users.try_on_photo_url`

---

## 1. Overview

Today the virtual try-on uses a **single** stored reference photo
(`users.try_on_photo_url`). This feature lets the user upload **several** photos of
themselves; the AI scores them for try-on suitability and picks the best one as the
base. The user can override the pick. The chosen photo feeds the existing Fashn.ai
path unchanged — this is a quality-and-control upgrade to the input, not a new
try-on engine.

Scope chosen: **"better single try-on"** — no AI avatar generation, no multi-pose
lookbook. Fashn.ai takes one model image, so the goal is to reliably feed it the
*best* one.

---

## 2. Where It Lives

A **"Your model"** section:

- In **Profile** (manage/replace your try-on base any time)
- Also reachable from the **try-on flow** when no base photo is set yet (the spec's
  "prompt to upload reference photo before try-on" path)

---

## 3. Flow

1. User uploads several photos of themselves (**cap 6**).
2. Each is uploaded to a **private, user-deletable** Supabase Storage bucket
   (per the master spec's face-photo privacy rule).
3. New route **`POST /api/profile/try-on-photos`** scores each photo via
   **Claude Vision** for try-on suitability:
   - full-body visible
   - front-facing
   - single person in frame
   - clear / in focus
   - even lighting, neutral pose
   Returns a ranked list with scores and the top pick.
4. UI shows the **AI-picked best** highlighted, the others as switchable alternates.
   User can override the selection.
5. The selected photo's URL is written to the existing **`users.try_on_photo_url`**.
   **The entire existing Fashn.ai try-on path is unchanged** — it just receives a
   better base image.

---

## 4. Data Model

**Small migration on `users`:**

```sql
ALTER TABLE users
  ADD COLUMN try_on_photo_candidates jsonb;  -- [{ "url": "...", "score": 0.0-1.0 }]
```

- `try_on_photo_url` (existing) — the **chosen** base, consumed by try-on.
- `try_on_photo_candidates` (new) — all uploads + AI scores, so the user can re-pick
  later without re-uploading, and the AI ranking persists.

---

## 5. API

### `POST /api/profile/try-on-photos`
Upload + score. Accepts the uploaded images (base64 or signed-upload URLs), stores
them in the private bucket, runs Claude Vision scoring.

**Response:**
```json
{
  "candidates": [
    { "url": "https://.../a.jpg", "score": 0.92, "reason": "full-body, front-facing, even light" },
    { "url": "https://.../b.jpg", "score": 0.61, "reason": "cropped at knees" }
  ],
  "recommended": "https://.../a.jpg"
}
```

### `PATCH /api/profile/try-on-photos`
Set the chosen base.
```json
{ "selectedUrl": "https://.../a.jpg" }
```
Writes `try_on_photo_url` and persists `try_on_photo_candidates`.

### `DELETE /api/profile/try-on-photos`
Remove a candidate (and its storage object). If the deleted one was the chosen base,
clear `try_on_photo_url` and prompt re-selection.

---

## 6. Error Handling

| Scenario | Handling |
|---|---|
| No usable photo (all low-score) | Show scores + reasons; let user pick anyway or upload more |
| Claude Vision scoring fails | Fall back to manual pick (show all uploads, user selects) |
| Storage upload fails | Per-file failure shown; other uploads proceed |
| User deletes the active base | Clear `try_on_photo_url`, prompt to choose a new base before next try-on |
| Try-on attempted with no base set | Existing prompt → route user into this upload flow |

---

## 7. Components

- `TryOnModelManager` — the "Your model" section: upload, ranked grid, select, delete.
- `ModelPhotoCard` — single candidate with score badge + "use this" / delete actions.
- Reuse existing upload/base64 helpers from the add-item flow where clean.

---

## 8. Privacy

- Photos stored in a **private** Supabase Storage bucket, not public.
- User-deletable from the "Your model" section.
- Consistent with the master spec: try-on reference photos are private and
  user-controlled (distinct from the skin-tone selfie, which is analysed and
  discarded).

---

## 9. Key Decisions

- **No avatar / no generated model** — Fashn.ai consumes one real photo; we feed it
  the best real photo. Avoids identity-fidelity risk and per-user generation cost.
- **Reuse `try_on_photo_url`** so the existing try-on route needs no change.
- **Single small migration** (`try_on_photo_candidates jsonb`) to persist uploads +
  ranking for later re-selection.
- **AI picks, user overrides** — effortless default, full control retained.

---

## 10. Out of Scope

- Generating a synthetic avatar / digital double.
- Multiple base poses / lookbook rendering.
- Editing or retouching the base photo in-app.
- Switching the try-on engine away from Fashn.ai.
