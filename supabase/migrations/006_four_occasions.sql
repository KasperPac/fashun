-- KAS-101 / KAS-109: one shared list of four occasions everywhere.
--   casual | smart-casual | work | formal
--
-- wardrobe_items.occasion_tags (TEXT[]): old values are renamed
--   dinner -> smart-casual, event -> formal; work and casual are kept.
--   Anything else is dropped; duplicates are removed.
--
-- outfits.occasion (TEXT, free-form since 004): each existing row is mapped by
-- keyword, first match wins, case-insensitive:
--   informal -> casual (checked first, because "informal" contains "formal")
--   smart casual / semi-formal / dinner / date / cocktail / drinks / evening / party -> smart-casual
--   formal / event / wedding / gala / black tie / ceremony -> formal
--   work / office / business / meeting / interview / professional -> work
--   casual / weekend / brunch / relax / everyday / errand / lounge -> casual
--   anything else (or NULL) -> NULL (the column stays nullable), so no
--   occasion is invented for an outfit we cannot classify.
-- This mirrors occasionFromText() in packages/shared/src/occasions.ts, which
-- the outfit save endpoint now uses for new outfits.

-- 1. wardrobe_items.occasion_tags
UPDATE public.wardrobe_items
SET occasion_tags = COALESCE((
  SELECT array_agg(o ORDER BY CASE o
      WHEN 'casual' THEN 1 WHEN 'smart-casual' THEN 2 WHEN 'work' THEN 3 ELSE 4 END)
  FROM (
    SELECT DISTINCT CASE t WHEN 'dinner' THEN 'smart-casual' WHEN 'event' THEN 'formal' ELSE t END AS o
    FROM unnest(occasion_tags) AS t
  ) m
  WHERE o IN ('casual', 'smart-casual', 'work', 'formal')
), '{}')
WHERE occasion_tags IS NOT NULL;

ALTER TABLE public.wardrobe_items
  DROP CONSTRAINT IF EXISTS wardrobe_items_occasion_tags_check;
ALTER TABLE public.wardrobe_items
  ADD CONSTRAINT wardrobe_items_occasion_tags_check
  CHECK (occasion_tags <@ ARRAY['casual', 'smart-casual', 'work', 'formal']::text[]);

-- 2. outfits.occasion
UPDATE public.outfits
SET occasion = CASE
  WHEN occasion IS NULL OR btrim(occasion) = '' THEN NULL
  WHEN lower(btrim(occasion)) IN ('casual', 'smart-casual', 'work', 'formal') THEN lower(btrim(occasion))
  WHEN occasion ~* 'informal' THEN 'casual'
  WHEN occasion ~* 'smart[[:space:]-]*casual|semi[[:space:]-]*formal|dinner|\ydate\y|cocktail|drinks|evening|party' THEN 'smart-casual'
  WHEN occasion ~* 'formal|event|wedding|gala|black[[:space:]-]*tie|ceremony' THEN 'formal'
  WHEN occasion ~* '\ywork\y|office|business|meeting|interview|professional' THEN 'work'
  WHEN occasion ~* 'casual|weekend|brunch|relax|everyday|errand|lounge' THEN 'casual'
  ELSE NULL
END;

ALTER TABLE public.outfits
  DROP CONSTRAINT IF EXISTS outfits_occasion_check;
ALTER TABLE public.outfits
  ADD CONSTRAINT outfits_occasion_check
  CHECK (occasion IS NULL OR occasion IN ('casual', 'smart-casual', 'work', 'formal'));
