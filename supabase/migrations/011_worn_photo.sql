-- KAS-694 (KAS-651 T3): an optional "photo of me wearing it" on each wardrobe item.
-- Only adds one nullable column. Nothing is removed or reshaped.
-- The value is an object path in the private try-on-photos bucket:
--   {user_id}/worn-{item_id}-{uuid}.jpg   (not a link)
-- Existing policies already cover it: wardrobe_all_own (the person's own row) and
-- try_on_photos_user_access (003: only files under the person's own folder).
ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS worn_photo_path TEXT;
