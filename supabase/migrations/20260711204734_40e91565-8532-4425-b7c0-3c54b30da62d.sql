
CREATE POLICY "community read auth"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'community');

CREATE POLICY "community insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "community update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'community' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "community delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'community' AND (storage.foldername(name))[1] = auth.uid()::text);
