-- ============ VAGAS (Job board) ============
CREATE TABLE public.community_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  modality TEXT NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial','remoto','hibrido')),
  employment_type TEXT NOT NULL DEFAULT 'clt' CHECK (employment_type IN ('clt','pj','plantao','estagio','temporario','freelancer')),
  specialty TEXT,
  salary_min NUMERIC(10,2),
  salary_max NUMERIC(10,2),
  description TEXT NOT NULL,
  requirements TEXT,
  benefits TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  external_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  views_count INTEGER NOT NULL DEFAULT 0,
  applications_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_active ON public.community_jobs(is_active, created_at DESC);
CREATE INDEX idx_jobs_posted_by ON public.community_jobs(posted_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_jobs TO authenticated;
GRANT ALL ON public.community_jobs TO service_role;

ALTER TABLE public.community_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Jobs are viewable by authenticated" ON public.community_jobs
  FOR SELECT TO authenticated USING (is_active OR posted_by = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated can create jobs" ON public.community_jobs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = posted_by);
CREATE POLICY "Owner or admin can update" ON public.community_jobs
  FOR UPDATE TO authenticated USING (auth.uid() = posted_by OR has_role(auth.uid(),'admin'));
CREATE POLICY "Owner or admin can delete" ON public.community_jobs
  FOR DELETE TO authenticated USING (auth.uid() = posted_by OR has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON public.community_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CANDIDATURAS ============
CREATE TABLE public.community_job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.community_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','viewed','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, user_id)
);
CREATE INDEX idx_job_apps_job ON public.community_job_applications(job_id);
CREATE INDEX idx_job_apps_user ON public.community_job_applications(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_job_applications TO authenticated;
GRANT ALL ON public.community_job_applications TO service_role;

ALTER TABLE public.community_job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User sees own apps or job owner sees apps" ON public.community_job_applications
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_jobs j WHERE j.id = job_id AND j.posted_by = auth.uid())
    OR has_role(auth.uid(),'admin')
  );
CREATE POLICY "User creates own app" ON public.community_job_applications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Job owner updates status" ON public.community_job_applications
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.community_jobs j WHERE j.id = job_id AND j.posted_by = auth.uid())
    OR has_role(auth.uid(),'admin')
  );
CREATE POLICY "User deletes own app" ON public.community_job_applications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Bump applications_count
CREATE OR REPLACE FUNCTION public.bump_job_applications()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_jobs SET applications_count = applications_count + 1 WHERE id = NEW.job_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_jobs SET applications_count = GREATEST(0, applications_count - 1) WHERE id = OLD.job_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_bump_job_apps AFTER INSERT OR DELETE ON public.community_job_applications
  FOR EACH ROW EXECUTE FUNCTION public.bump_job_applications();

-- ============ BADGES / ACHIEVEMENTS DA COMUNIDADE ============
CREATE TABLE public.community_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'award',
  xp_reward INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','prata','ouro','platina')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_badges TO authenticated, anon;
GRANT ALL ON public.community_badges TO service_role;
ALTER TABLE public.community_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges are public" ON public.community_badges FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.community_user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.community_badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);
CREATE INDEX idx_user_badges_user ON public.community_user_badges(user_id);
GRANT SELECT, INSERT, DELETE ON public.community_user_badges TO authenticated;
GRANT ALL ON public.community_user_badges TO service_role;
ALTER TABLE public.community_user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User badges are viewable by all authenticated" ON public.community_user_badges
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin awards badges" ON public.community_user_badges
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admin revokes badges" ON public.community_user_badges
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- Seed algumas badges iniciais
INSERT INTO public.community_badges (slug, name, description, icon, xp_reward, tier) VALUES
  ('pioneiro', 'Pioneiro', 'Um dos primeiros membros da comunidade', 'flag', 100, 'ouro'),
  ('primeira_postagem', 'Primeira Postagem', 'Publicou seu primeiro post na comunidade', 'edit-3', 20, 'bronze'),
  ('conector', 'Conector', 'Conquistou 10 seguidores', 'users', 50, 'prata'),
  ('mentor', 'Mentor', 'Ajudou colegas com respostas úteis', 'graduation-cap', 80, 'ouro'),
  ('especialista_uti', 'Especialista UTI', 'Referência em terapia intensiva', 'activity', 100, 'platina');

-- ============ LEADERBOARD (view) ============
CREATE OR REPLACE VIEW public.community_leaderboard AS
SELECT
  p.id AS user_id,
  p.full_name,
  p.avatar_url,
  COALESCE(s.xp, 0) AS xp,
  COALESCE(s.level, 1) AS level,
  COALESCE(s.current_streak, 0) AS current_streak,
  (SELECT COUNT(*) FROM public.community_user_badges ub WHERE ub.user_id = p.id) AS badges_count,
  (SELECT COUNT(*) FROM public.community_follows f WHERE f.following_id = p.id) AS followers_count
FROM public.profiles p
LEFT JOIN public.user_stats s ON s.user_id = p.id
ORDER BY xp DESC;

GRANT SELECT ON public.community_leaderboard TO authenticated, anon;
