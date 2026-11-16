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

-- One row per FASHN picture. 'reserved' while the call is running (counts toward the
-- cap so two requests can't both slip under it), 'charged' once FASHN returned a
-- picture. A failed call deletes its reservation, so failures never add spend.
-- Rows outlive the person and outfit (ids set to NULL) so past spend stays true.
CREATE TABLE IF NOT EXISTS public.try_on_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  outfit_id UUID REFERENCES public.outfits(id) ON DELETE SET NULL,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'), -- Sydney calendar month
  step TEXT NOT NULL CHECK (step IN ('top', 'bottom', 'one-piece')),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'charged')),
  cost_usd NUMERIC(10, 4) NOT NULL CHECK (cost_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  charged_at TIMESTAMPTZ
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
  p_unit_cost NUMERIC,
  p_cap NUMERIC
) RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  spent NUMERIC;
  ids UUID[] := '{}';
  step TEXT;
  new_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('try_on_ledger'));

  SELECT COALESCE(SUM(cost_usd), 0) INTO spent
  FROM public.try_on_ledger
  WHERE month = p_month
    AND (status = 'charged' OR created_at > NOW() - INTERVAL '5 minutes');

  IF spent + p_unit_cost * COALESCE(array_length(p_steps, 1), 0) > p_cap THEN
    RETURN NULL;
  END IF;

  FOREACH step IN ARRAY p_steps LOOP
    INSERT INTO public.try_on_ledger (user_id, outfit_id, month, step, cost_usd)
    VALUES (p_user, p_outfit, p_month, step, p_unit_cost)
    RETURNING id INTO new_id;
    ids := ids || new_id;
  END LOOP;

  RETURN ids;
END;
$$;

REVOKE ALL ON FUNCTION public.try_on_reserve(UUID, UUID, TEXT, TEXT[], NUMERIC, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_on_reserve(UUID, UUID, TEXT, TEXT[], NUMERIC, NUMERIC)
  TO service_role;

-- Existing policies already cover the rest:
--   users_select_own / users_update_own  (the photo path and consent are the person's own row)
--   outfits_all_own                       (the picture path is on the person's own outfit)
--   try_on_photos_user_access (003)       (only files under the person's own folder in try-on-photos)
