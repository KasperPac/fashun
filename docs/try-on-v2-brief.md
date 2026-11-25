# Try-on v2: one-shot image edit + "photo of me wearing it"

## Why

The current "See it on me" picture (FASHN `tryon-v1.6`) looks far worse than putting the same photos into ChatGPT with the prompt "add these to me". Same base photo, same garment photos. What's wrong with the FASHN picture:

- Stripes are wavy and painted-on, buttons are blurry, and the whole picture is soft.
- A grey band shows under the shirt hem, and the shirt hangs boxy over the pants.
- The chinos have no detail: no button, no belt loops, no pockets.

Causes found in the code:

1. **Two passes, one on top of the other.** `apps/web/src/app/api/outfits/try-on/route.ts` draws the top onto the person, then draws the bottoms onto *that generated picture*. The second pass re-renders the waist and body, so the first pass's errors get worse.
2. **Only the minimum settings are sent.** `apps/web/src/lib/fashn.ts` sends `model_image`, `garment_image`, `category` and `return_base64` only. No quality mode is set.
3. **Garment photos are shrunk to a 1024px JPEG** when added to the wardrobe (`photoToJpegBase64` in `apps/web/src/lib/image-resize.ts`, called from `components/wardrobe/AddPiece.tsx`). Fine stripes and buttons are lost before try-on ever sees them.
4. **FASHN is a garment-swap model.** It keeps the person's body shape and the outline of what they were already wearing, then swaps the fabric. A general image-edit model redraws the outfit: it tucks the shirt, fits the chinos and adds real hardware.

Decision: move try-on to a general image-edit model that takes several pictures in one request. Then let people add an optional photo of themselves wearing a piece, so the picture shows how it really fits them.

---

## Ticket 1: Pick the image-edit model (spike)

Compare OpenAI's current image edit model and Google's current Gemini image model. Use whichever versions are current, and check both docs before writing code.

- Use the same inputs for both: one person photo, plus a top and bottoms as product photos.
- Score 5 outfits on 4 things: is the face/body still the same person, how faithful is the garment (pattern, colour, buttons), how realistic is the fit, and is the background kept.
- Record the price per picture, the time taken (p50/p95), the largest input size and number of input pictures allowed, whether a seed is available, and the data-retention/training terms. The privacy note depends on those terms.
- Output: a short write-up in `docs/` with the side-by-side pictures and a recommendation. Keep FASHN behind a switch until the new model is chosen.

**Done when:** a model is chosen, and its price and retention terms are written down.

## Ticket 2: One request per outfit with the chosen model

- New `apps/web/src/lib/image-tryon.ts` (or similar), next to `fashn.ts`, with the same `TryOnImage` in/out shape. Send the person photo and **every** garment photo in one request.
- The prompt must:
  - keep the person's face, body, pose and background exactly;
  - dress them in the garments shown;
  - keep each garment's colour, pattern, fabric and hardware;
  - dress them naturally (tuck or untuck as the garment suits), barefoot unless shoes are given.
- `apps/web/src/lib/try-on.ts` → `planTryOn`:
  - Shoes and outerwear can now be drawn. Decide per category; bags and accessories are probably still skipped.
  - Draw one top and one bottom (or one dress/jumpsuit), as today.
  - The plan becomes **one** step, so the ledger needs a new step value (e.g. `'outfit'`). Check the `try_on` ledger schema in `supabase/migrations/008_try_on.sql`, and add a migration if the step is constrained.
- `route.ts`:
  - Replace the top-then-bottom loop with the single call.
  - `maxDuration` and the per-request timeout need re-checking against the spike timings.
  - Keep the existing rules: reserve before calling, charge only for what came back, never log error text or personal data (`logFailure` reasons only).
- Settings:
  - `TRY_ON_PRICE_USD` becomes the price per picture for the new model.
  - The "images per outfit" GET query (`images=1|2`) becomes 1.
  - Add a setting that switches between FASHN and the new model, so it can be rolled back.
- New API key setting for the chosen provider. Server only.
- Garment photos: raise the limit from 1024px to about 2048px for new wardrobe photos. Existing photos stay as they are.
- Update `apps/web/src/lib/try-on-photo-client.ts:5` (the privacy note). It names FASHN and FASHN's retention terms, and must describe the new provider truthfully, using the terms from ticket 1.
- Tests: update `route.test.ts`, `try-on.test.ts` and the fake in `lib/__fixtures__/try-on-fake.ts`.

**Done when:** a top + bottoms outfit costs one picture. The result is saved, shown and charged as today, with the label "Made by AI. Fit and details may not be exact." still shown. The FASHN path still works behind the switch.

## Ticket 3: Optional "photo of me wearing it" on wardrobe items

- Migration: add a nullable `worn_photo_path` to `wardrobe_items`. It is RLS-protected like the rest of the row.
- Storage: put worn photos in the existing private `try-on-photos` bucket under `{user_id}/worn-{item_id}-{uuid}.jpg`. The DELETE in `apps/web/src/app/api/try-on/photo/route.ts` already removes everything in the user's folder. Make it also null `worn_photo_path` on their items.
- Upload: on the item page, add an optional "Add a photo of you wearing it" (full body, mirror selfie is fine). Resize on the client with `photoToJpegBlob(file, 1536)`. The person must have agreed to the try-on privacy note first, using the same consent as the try-on photo.
- Deleting the item, or replacing the photo, removes the old file.
- The privacy note mentions these photos too.

**Done when:** a user can add, see, replace and delete a worn photo for an item, and "delete my try-on photo" removes all of them.

## Ticket 4: Use worn photos and fit notes in try-on

- **Fit notes:**
  - When a worn photo is saved, call Claude with vision, in the style of `apps/web/src/lib/tagger.ts`. Ask for short fit notes: how loose or slim it is, its length, where the sleeves or hem fall, and how it's worn (tucked or untucked, cuffs rolled).
  - Store them as `fit_notes text` on the item.
  - No personal judgements about the body: the notes are about the garment only.
- **Try-on request:**
  - For each piece with a worn photo, send it as an extra reference ("this is how this garment fits this person") alongside the product photo, and add the fit notes to the prompt.
  - If only one piece is being drawn and the user has a full-body worn photo of the *other* piece, an option to test: start from that worn photo instead of the base photo. Compare in QA before keeping it.
- **Optional:** show fit notes on the item page, and give them to the outfit builder (`lib/style-me.ts`) so suggestions can say things like "tuck this one, it sits long".
- Items without a worn photo work exactly as in ticket 2.

**Done when:** an outfit whose pieces have worn photos visibly matches the real fit, checked against the same 5 outfits from the spike.

---

## Things to keep from the current code

- Nothing is charged before every photo has been read.
- The monthly cap is checked before calling the provider.
- A saved picture is free to view again.
- Logs carry a fixed reason only, never provider error text, links, names or emails.
- Photos go to the provider as base64, not as links.
- Next.js here is 16.2.6 with breaking changes. Read `node_modules/next/dist/docs/` before writing routes (see `apps/web/AGENTS.md`).
