
-- Reports
CREATE TABLE public.community_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','comment','user','group','event','job','message')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam','harassment','hate','misinformation','inappropriate','impersonation','other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  resolution_note TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_status ON public.community_reports(status, created_at DESC);
CREATE INDEX idx_reports_target ON public.community_reports(target_type, target_id);
CREATE INDEX idx_reports_reporter ON public.community_reports(reporter_id);

GRANT SELECT, INSERT, UPDATE ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_insert_own" ON public.community_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_select_own_or_admin" ON public.community_reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "reports_update_admin" ON public.community_reports
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Blocks
CREATE TABLE public.community_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX idx_blocks_blocker ON public.community_blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON public.community_blocks(blocked_id);

GRANT SELECT, INSERT, DELETE ON public.community_blocks TO authenticated;
GRANT ALL ON public.community_blocks TO service_role;
ALTER TABLE public.community_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks_select_own" ON public.community_blocks
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "blocks_insert_own" ON public.community_blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks_delete_own" ON public.community_blocks
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- Moderation actions log
CREATE TABLE public.community_moderation_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('hide_post','delete_post','delete_comment','warn_user','ban_user','unban_user','delete_group','delete_event','delete_job','dismiss_report','resolve_report')),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  report_id UUID REFERENCES public.community_reports(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mod_actions_admin ON public.community_moderation_actions(admin_id, created_at DESC);
CREATE INDEX idx_mod_actions_target ON public.community_moderation_actions(target_type, target_id);

GRANT SELECT, INSERT ON public.community_moderation_actions TO authenticated;
GRANT ALL ON public.community_moderation_actions TO service_role;
ALTER TABLE public.community_moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mod_actions_select_admin" ON public.community_moderation_actions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "mod_actions_insert_admin" ON public.community_moderation_actions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = admin_id);

-- Add hidden flag on posts for soft-moderation
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_posts_hidden ON public.community_posts(is_hidden) WHERE is_hidden = false;
