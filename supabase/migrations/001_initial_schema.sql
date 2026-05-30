-- gen_random_uuid() is built into Postgres 13+ — no extension needed

-- User profiles (extends auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  skin_undertone TEXT CHECK (skin_undertone IN ('warm', 'cool', 'neutral')),
  skin_depth TEXT CHECK (skin_depth IN ('light', 'medium', 'deep')),
  colour_season TEXT CHECK (colour_season IN ('spring', 'summer', 'autumn', 'winter')),
  style_prefs TEXT[] DEFAULT '{}',
  budgets JSONB DEFAULT '{"tops":[20,150],"bottoms":[30,200],"shoes":[50,350],"outerwear":[80,500],"bags":[40,300],"accessories":[10,100]}',
  try_on_photo_url TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.wardrobe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ownership TEXT NOT NULL CHECK (ownership IN ('owned', 'wishlist')),
  category TEXT NOT NULL CHECK (category IN ('tops','bottoms','shoes','outerwear','bags','accessories')),
  name TEXT NOT NULL,
  colours TEXT[] DEFAULT '{}',
  style_tags TEXT[] DEFAULT '{}',
  occasion_tags TEXT[] DEFAULT '{}',
  image_url TEXT NOT NULL,
  store_url TEXT,
  affiliate_url TEXT,
  price NUMERIC,
  retailer TEXT,
  last_worn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT,
  item_ids UUID[] DEFAULT '{}',
  occasion TEXT CHECK (occasion IN ('work','casual','dinner','event')),
  ai_generated BOOLEAN DEFAULT FALSE,
  palette_match_pct INTEGER,
  try_on_image_url TEXT,
  worn_count INTEGER DEFAULT 0,
  last_worn_at TIMESTAMPTZ,
  last_recommended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  used_by UUID REFERENCES public.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
