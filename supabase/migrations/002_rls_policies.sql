ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "wardrobe_all_own" ON public.wardrobe_items FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "outfits_all_own" ON public.outfits FOR ALL USING (auth.uid() = user_id);

-- Anyone can read invite codes (to validate), only service role can insert
CREATE POLICY "invite_codes_select" ON public.invite_codes FOR SELECT USING (true);
