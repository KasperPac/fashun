-- KAS-723 (KAS-651 F3, F4): where the item is in its worn photo, and whether it is tucked.
-- Only adds one nullable column. Nothing is removed or reshaped.
-- Holds {"box": {"left","top","right","bottom"} as fractions of the photo, "tucked": "tucked" | "untucked" | "unclear"}.
-- Cleared whenever the worn photo is deleted or replaced. Existing policy wardrobe_all_own covers the row.
ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS worn_fit JSONB;
