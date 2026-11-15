# Outcome 1 ("Dress me from what I own"): manual steps

Nothing here has been applied by the build team. The operator or Kasper does these.

## 1. Database migrations

Apply in order, on any database that does not have them yet (all are in `supabase/migrations/`):

- `004_outfits_phase3.sql`
- `005_colour_profile.sql`
- `006_four_occasions.sql`
- `007_outfit_reason_season.sql`

Outcome 1 adds no new tables. The new columns sit on `users` and `outfits`, which are already covered by the row-level security policies in `002_rls_policies.sql`. Wardrobe photos stay in the private `wardrobe-images` bucket (policy in `003_storage_buckets.sql`).

## 2. Settings (names only; set the values in the host's environment, never in code)

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

Paid extras, all behind one switch:

- `ENABLE_PAID_EXTRAS`: leave unset (or anything other than `true`) to keep them off. Off is the default.

With the switch off, nothing in outcome 1 calls Fashn.ai (try-on, returns "not available"), SerpAPI Google Lens (photo-to-shop search, returns no matches) or Photoroom (background removal, original photo kept). Adding a piece by link and by photo still works.

Only if the switch is turned on are these also needed: `FASHN_API_KEY`, `SERPAPI_API_KEY`, `PHOTOROOM_API_KEY`.

## 3. Checks before release

- Run `lint`, `test` and `build` for `apps/web` and `packages/shared`.
- After applying the migrations, sign in as two different test users and confirm each sees only their own wardrobe, photos, profile and outfits.
