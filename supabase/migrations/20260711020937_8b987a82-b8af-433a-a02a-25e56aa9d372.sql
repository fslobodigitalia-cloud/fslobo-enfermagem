
-- USER STATS
CREATE TABLE public.user_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_stats TO authenticated;
GRANT ALL ON public.user_stats TO service_role;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own stats" ON public.user_stats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_user_stats_updated_at BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ACHIEVEMENTS CATALOG
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  type TEXT NOT NULL DEFAULT 'generic',
  target INTEGER NOT NULL DEFAULT 1,
  xp_reward INTEGER NOT NULL DEFAULT 10,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT ON public.achievements TO anon, authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view achievements" ON public.achievements
  FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Admins manage achievements" ON public.achievements
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_achievements_updated_at BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- USER ACHIEVEMENTS
CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
CREATE INDEX idx_user_achievements_user ON public.user_achievements(user_id);
GRANT SELECT, INSERT, DELETE ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own unlocks" ON public.user_achievements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own unlocks" ON public.user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- XP FUNCTION
CREATE OR REPLACE FUNCTION public.add_user_xp(_user_id UUID, _amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today DATE := (now() AT TIME ZONE 'UTC')::date;
  _prev DATE;
  _cs INT;
  _ls INT;
BEGIN
  INSERT INTO public.user_stats(user_id, xp, level, current_streak, longest_streak, last_activity_date)
  VALUES (_user_id, GREATEST(_amount, 0), 1, 1, 1, _today)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_activity_date, current_streak, longest_streak
    INTO _prev, _cs, _ls
    FROM public.user_stats WHERE user_id = _user_id;

  IF _prev IS NULL OR _prev = _today THEN
    _cs := COALESCE(_cs, 1);
  ELSIF _prev = _today - INTERVAL '1 day' THEN
    _cs := COALESCE(_cs, 0) + 1;
  ELSE
    _cs := 1;
  END IF;
  _ls := GREATEST(COALESCE(_ls, 0), _cs);

  UPDATE public.user_stats
     SET xp = xp + _amount,
         level = GREATEST(1, ((xp + _amount) / 100) + 1),
         current_streak = _cs,
         longest_streak = _ls,
         last_activity_date = _today
   WHERE user_id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_user_xp(UUID, INTEGER) TO authenticated;

-- SEED achievements
INSERT INTO public.achievements(code, name, description, icon, type, target, xp_reward, display_order) VALUES
  ('first_steps', 'Primeiros passos', 'Acesse seu primeiro produto', '🎯', 'progress_started', 1, 20, 1),
  ('streak_3',    'Foco de 3 dias',   'Estude 3 dias seguidos',      '🔥', 'streak',            3, 30, 2),
  ('streak_7',    'Semana perfeita',  'Estude 7 dias seguidos',      '⚡', 'streak',            7, 60, 3),
  ('collector_3', 'Colecionador',     'Tenha 3 produtos ativos',     '📚', 'products_owned',    3, 40, 4),
  ('complete_1',  'Missão cumprida',  'Complete um produto (100%)',  '🏆', 'progress_completed',1, 100, 5)
ON CONFLICT (code) DO NOTHING;
