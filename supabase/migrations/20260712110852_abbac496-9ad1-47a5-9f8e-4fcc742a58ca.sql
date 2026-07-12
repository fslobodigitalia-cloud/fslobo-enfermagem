UPDATE public.settings
SET value = jsonb_set(value, '{cta_href}', '"/produto/d6fa6ab3-352b-4181-8d7b-98375d77c017"'::jsonb)
WHERE key = 'site.home.hero';