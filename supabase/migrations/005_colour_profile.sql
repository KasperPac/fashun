-- Full colour profile derived from the selfie analysis.
-- Only derived results are stored; the selfie itself is never saved.
-- Row level security is unchanged: users_select_own / users_update_own
-- (002_rls_policies.sql) already limit each user to their own row, and
-- they apply to the new columns.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hair_colour TEXT
    CHECK (hair_colour IN ('black', 'dark-brown', 'brown', 'auburn', 'red', 'blonde', 'grey', 'white'));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS eye_colour TEXT
    CHECK (eye_colour IN ('brown', 'hazel', 'green', 'blue', 'grey', 'amber'));

-- Hex colours, e.g. '#FFB347'
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS best_colours TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avoid_colours TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS suggested_styles TEXT[] NOT NULL DEFAULT '{}';
