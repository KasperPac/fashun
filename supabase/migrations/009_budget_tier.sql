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
