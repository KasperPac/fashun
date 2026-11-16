-- KAS-101 Fashun v2: keep the reason and the colour season an outfit was made for,
-- so a saved outfit still says "Made for your Autumn palette" after the user
-- changes season. Both are nullable: outfits saved before this keep working.
-- Apply by hand in the Supabase SQL editor before deploying the Saved screens.

ALTER TABLE public.outfits
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS season TEXT;

ALTER TABLE public.outfits
  DROP CONSTRAINT IF EXISTS outfits_season_check;
ALTER TABLE public.outfits
  ADD CONSTRAINT outfits_season_check
  CHECK (season IS NULL OR season IN ('spring', 'summer', 'autumn', 'winter'));
