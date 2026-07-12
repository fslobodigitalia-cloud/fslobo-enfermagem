
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS placements text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS products_placements_idx ON public.products USING GIN (placements);
