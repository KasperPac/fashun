-- KAS-695 (KAS-651 T4): short fit notes made from an item's worn photo.
-- Only adds one nullable column. Nothing is removed or reshaped.
-- The notes are about the garment only (fit, length, sleeves or hem, tucked or not), never the person's body.
-- They are cleared whenever the worn photo is deleted or replaced. Existing policy wardrobe_all_own covers the row.
ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS fit_notes TEXT;
