DROP VIEW IF EXISTS public.community_leaderboard;
CREATE VIEW public.community_leaderboard
WITH (security_invoker = true) AS
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
ORDER BY COALESCE(s.xp,0) DESC;

GRANT SELECT ON public.community_leaderboard TO authenticated, anon;