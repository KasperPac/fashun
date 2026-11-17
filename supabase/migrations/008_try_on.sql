-- KAS-229 FASHUN-2 "See it on me": keep try-on pictures with the outfit, record the
-- person's consent, and keep a ledger of successful FASHN pictures for the monthly cap.
-- Only adds columns, a table, a function and policies. Nothing is removed or reshaped.
-- Apply by hand in the Supabase SQL editor before QA's real-use run.

-- Where the finished try-on picture lives (object path in the private try-on-photos
-- bucket: {user_id}/...), and when it was made.
ALTER TABLE public.outfits
  ADD COLUMN IF NOT EXISTS try_on_image_path TEXT,
  ADD COLUMN IF NOT EXISTS try_on_made_at TIMESTAMPTZ;

-- When the person agreed to send their try-on photo to FASHN.
-- users.try_on_photo_url now holds the object path in try-on-photos (not a link).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS try_on_consent_at TIMESTAMPTZ;

-- One row per FASHN image (one paid FASHN call). Spend is stored exactly, as this count;
-- dollars are only worked out when shown (images x price, in whole 1/10,000 US$) and the
-- cap is checked on that exact amount. 'reserved' while the call is running (counts toward
-- the cap so two requests can't both slip under it), 'charged' once FASHN returned an
-- image. A failed call deletes its reservation, so an image FASHN did not charge for adds
-- nothing, while a first step FASHN did charge for stays counted when a later step fails.
-- batch_id groups the images of one try-on request; picture_made marks the requests that ended in a saved picture. Rows outlive the person and outfit
-- (ids set to NULL) so past spend stays true.
CREATE TABLE IF NOT EXISTS public.try_on_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  outfit_id UUID REFERENCES public.outfits(id) ON DELETE SET NULL,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'), -- Sydney calendar month
  step TEXT NOT NULL CHECK (step IN ('top', 'bottom', 'one-piece')),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'charged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  charged_at TIMESTAMPTZ,
  -- TRUE once the whole picture was made and saved. A charged image whose request later
  -- failed stays counted as an image but never as a picture the person used.
  picture_made BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS try_on_ledger_month_status_idx
  ON public.try_on_ledger (month, status);

-- Row-level security with no policies: signed-in people can't read or write the
-- ledger at all. Only the server (service role) uses it.
ALTER TABLE public.try_on_ledger ENABLE ROW LEVEL SECURITY;

-- Checks the whole outfit fits under the cap and reserves its pictures in one step.
-- Returns the reserved row ids, or NULL when it would go over the cap (nothing is
-- reserved). Reservations older than 5 minutes (a crashed request) stop counting.
CREATE OR REPLACE FUNCTION public.try_on_reserve(
  p_user UUID,
  p_outfit UUID,
  p_month TEXT,
  p_steps TEXT[],
  p_price_units INTEGER, -- price of one FASHN image, in 1/10,000 US$ (US$0.075 = 750)
  p_cap_units INTEGER    -- monthly cap, in 1/10,000 US$ (US$7.50 = 75000)
) RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  spent INTEGER;
  batch UUID := gen_random_uuid();
  ids UUID[] := '{}';
  step TEXT;
  new_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('try_on_ledger'));

  SELECT COUNT(*) INTO spent
  FROM public.try_on_ledger
  WHERE month = p_month
    AND (status = 'charged' OR created_at > NOW() - INTERVAL '5 minutes');

  IF (spent + COALESCE(array_length(p_steps, 1), 0)) * p_price_units > p_cap_units THEN
    RETURN NULL;
  END IF;

  FOREACH step IN ARRAY p_steps LOOP
    INSERT INTO public.try_on_ledger (batch_id, user_id, outfit_id, month, step)
    VALUES (batch, p_user, p_outfit, p_month, step)
    RETURNING id INTO new_id;
    ids := ids || new_id;
  END LOOP;

  RETURN ids;
END;
$$;

REVOKE ALL ON FUNCTION public.try_on_reserve(UUID, UUID, TEXT, TEXT[], INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_on_reserve(UUID, UUID, TEXT, TEXT[], INTEGER, INTEGER)
  TO service_role;

-- Existing policies already cover the rest:
--   users_select_own / users_update_own  (the photo path and consent are the person's own row)
--   outfits_all_own                       (the picture path is on the person's own outfit)
--   try_on_photos_user_access (003)       (only files under the person's own folder in try-on-photos)
