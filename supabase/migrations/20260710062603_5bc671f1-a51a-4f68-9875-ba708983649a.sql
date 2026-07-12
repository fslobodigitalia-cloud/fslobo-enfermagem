
-- Leitura pública de imagens
CREATE POLICY "Public read covers" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'covers');
CREATE POLICY "Public read products" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'products');
CREATE POLICY "Public read blog" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'blog');
CREATE POLICY "Public read banners" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'banners');
CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');

-- Admin gerencia buckets de conteúdo
CREATE POLICY "Admin manage covers" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'covers' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'covers' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage products" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage blog" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'blog' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'blog' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage banners" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage previews" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'previews' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'previews' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage ebooks" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'ebooks' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'ebooks' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage documents" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'));

-- Usuário gerencia próprio avatar (path começa com <uid>/)
CREATE POLICY "User manages own avatar" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
