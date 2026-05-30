INSERT INTO storage.buckets (id, name, public) VALUES
  ('wardrobe-images', 'wardrobe-images', false),
  ('try-on-photos', 'try-on-photos', false);

-- Users can only access their own files (path format: {user_id}/{filename})
CREATE POLICY "wardrobe_images_user_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'wardrobe-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "try_on_photos_user_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'try-on-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
