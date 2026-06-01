-- Phase 3: add per-item anchor, structured pieces JSON, and description to outfits

-- Remove old occasion check constraint (was limited to work/casual/dinner/event)
-- New occasion is free-form text e.g. "Weekend brunch"
ALTER TABLE public.outfits
  DROP CONSTRAINT IF EXISTS outfits_occasion_check;

-- Anchor item (the card that was "Style it"-ed)
ALTER TABLE public.outfits
  ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.wardrobe_items(id) ON DELETE SET NULL;

-- Claude's structured outfit output
-- Array of {label, colour_hex, item_id, in_wardrobe}
ALTER TABLE public.outfits
  ADD COLUMN IF NOT EXISTS pieces JSONB NOT NULL DEFAULT '[]'::jsonb;

-- One-sentence description from Claude
ALTER TABLE public.outfits
  ADD COLUMN IF NOT EXISTS description TEXT;
