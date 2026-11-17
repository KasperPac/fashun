-- KAS-342 FASHUN-3 "Fill the gaps within budget": a shopping budget tier and "I shop" department.
-- Only adds two columns to public.users. Nothing is removed or reshaped.
-- Row level security is unchanged: users_select_own / users_update_own
-- (002_rls_policies.sql) already limit each user to their own row, and
-- they apply to the new columns.
-- Apply through the ops lane before QA's real-use run.

-- NULL until the person picks a tier. Existing users stay NULL.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS budget_tier TEXT
    CHECK (budget_tier IN ('budget', 'high-street', 'mid', 'premium'));

-- "I shop: men's / women's / both". Everyone, existing users included, starts on both.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'both'
    CHECK (department IN ('mens', 'womens', 'both'));
-- KAS-350 FASHUN-3 "Fill the gaps within budget": a day's stored suggestions per gap, and a
-- studio-wide count of product searches per month (for the monthly search limit).
-- Only adds two tables, one function and policies. Nothing is removed or reshaped.
-- Apply through the ops lane before QA's real-use run.

-- One row per user, gap, tier, department, price range and day. Changing the tier, department
-- or price range is a new row, so a changed budget never shows another budget's items.
-- items holds the filtered candidates (an empty list is a normal answer and is stored too).
CREATE TABLE IF NOT EXISTS public.gap_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  occasion TEXT NOT NULL CHECK (occasion IN ('casual', 'smart-casual', 'work', 'formal')),
  category TEXT NOT NULL CHECK (category IN ('tops', 'bottoms', 'shoes')),
  tier TEXT NOT NULL CHECK (tier IN ('budget', 'high-street', 'mid', 'premium')),
  department TEXT NOT NULL CHECK (department IN ('mens', 'womens', 'both')),
  price_min NUMERIC NOT NULL,
  price_max NUMERIC NOT NULL,
  day DATE NOT NULL, -- Sydney calendar day, as the try-on month is
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, occasion, category, tier, department, price_min, price_max, day)
);

-- Signed-in people can read only their own rows. There are no insert, update or delete
-- policies: only the server (service role) stores suggestions.
ALTER TABLE public.gap_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY gap_suggestions_select_own ON public.gap_suggestions
  FOR SELECT USING (user_id = auth.uid());

-- One row per Sydney calendar month ("YYYY-MM"): how many product searches were made, all
-- users together. Row-level security with no policies: only the server (service role) uses it.
CREATE TABLE IF NOT EXISTS public.gap_search_usage (
  month TEXT PRIMARY KEY CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  searches INTEGER NOT NULL DEFAULT 0 CHECK (searches >= 0)
);

ALTER TABLE public.gap_search_usage ENABLE ROW LEVEL SECURITY;

-- Adds one search to the month's count if the count is still below the cap, in a single
-- statement so two requests at once can never take the count past it. Returns the new count,
-- or NULL when the cap is already reached (the search must not be made).
CREATE OR REPLACE FUNCTION public.gap_search_reserve(
  p_month TEXT,
  p_cap INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  IF p_cap IS NULL OR p_cap <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.gap_search_usage AS u (month, searches)
  VALUES (p_month, 1)
  ON CONFLICT (month) DO UPDATE SET searches = u.searches + 1
  WHERE u.searches < p_cap
  RETURNING u.searches INTO new_count;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.gap_search_reserve(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gap_search_reserve(TEXT, INTEGER) TO service_role;
