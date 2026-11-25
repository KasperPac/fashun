-- KAS-693 (KAS-651 T2): one-request try-on. Only widens and adds; nothing is removed or rewritten.
-- Apply by hand in the Supabase SQL editor before QA's real-use run, and before the merge reaches production.

-- 1. A Gemini try-on is one ledger row with step 'outfit'. This ALTERS A CHECK CONSTRAINT: it
--    drops try_on_ledger_step_check (the name Postgres gave the inline CHECK in 008) and adds it
--    back with one more allowed value. Existing rows already satisfy it; no row changes.
ALTER TABLE public.try_on_ledger DROP CONSTRAINT IF EXISTS try_on_ledger_step_check;
ALTER TABLE public.try_on_ledger
  ADD CONSTRAINT try_on_ledger_step_check CHECK (step IN ('top', 'bottom', 'one-piece', 'outfit'));

-- 2. Each row keeps the price it was made at (1/10,000 US$), so spend stays true when the price
--    setting or the provider changes. NULL on the rows already there: those are FASHN images and
--    are counted at 750 (US$0.075) below and in the app.
ALTER TABLE public.try_on_ledger ADD COLUMN IF NOT EXISTS price_units INTEGER;

-- 3. Which privacy note a person agreed to. NULL on every existing agreement (the FASHN note), and
--    the app only counts an agreement to the current note, so people agree again before their next
--    photo or picture. Nothing is removed: try_on_consent_at keeps its date.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS try_on_consent_note TEXT;

-- 4. try_on_reserve now adds up each row at its own price, and stores the new price on the rows
--    it reserves. Same name, arguments and permissions as in 008.
CREATE OR REPLACE FUNCTION public.try_on_reserve(
  p_user UUID,
  p_outfit UUID,
  p_month TEXT,
  p_steps TEXT[],
  p_price_units INTEGER, -- price of one row (one Gemini picture or one FASHN image), in 1/10,000 US$
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

  SELECT COALESCE(SUM(COALESCE(price_units, 750)), 0) INTO spent
  FROM public.try_on_ledger
  WHERE month = p_month
    AND (status = 'charged' OR created_at > NOW() - INTERVAL '5 minutes');

  IF spent + COALESCE(array_length(p_steps, 1), 0) * p_price_units > p_cap_units THEN
    RETURN NULL;
  END IF;

  FOREACH step IN ARRAY p_steps LOOP
    INSERT INTO public.try_on_ledger (batch_id, user_id, outfit_id, month, step, price_units)
    VALUES (batch, p_user, p_outfit, p_month, step, p_price_units)
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
