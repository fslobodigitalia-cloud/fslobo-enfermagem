
DROP VIEW IF EXISTS public.community_leaderboard CASCADE;

DROP TABLE IF EXISTS public.community_post_likes CASCADE;
DROP TABLE IF EXISTS public.community_post_comments CASCADE;
DROP TABLE IF EXISTS public.community_posts CASCADE;
DROP TABLE IF EXISTS public.community_event_attendees CASCADE;
DROP TABLE IF EXISTS public.community_events CASCADE;
DROP TABLE IF EXISTS public.community_group_members CASCADE;
DROP TABLE IF EXISTS public.community_groups CASCADE;
DROP TABLE IF EXISTS public.community_job_applications CASCADE;
DROP TABLE IF EXISTS public.community_jobs CASCADE;
DROP TABLE IF EXISTS public.community_direct_messages CASCADE;
DROP TABLE IF EXISTS public.community_follows CASCADE;
DROP TABLE IF EXISTS public.community_blocks CASCADE;
DROP TABLE IF EXISTS public.community_reports CASCADE;
DROP TABLE IF EXISTS public.community_moderation_actions CASCADE;
DROP TABLE IF EXISTS public.community_user_badges CASCADE;
DROP TABLE IF EXISTS public.community_badges CASCADE;
DROP TABLE IF EXISTS public.professional_profiles CASCADE;

DROP FUNCTION IF EXISTS public.bump_post_likes() CASCADE;
DROP FUNCTION IF EXISTS public.bump_post_comments() CASCADE;
DROP FUNCTION IF EXISTS public.bump_event_attendees() CASCADE;
DROP FUNCTION IF EXISTS public.bump_group_members() CASCADE;
DROP FUNCTION IF EXISTS public.add_group_creator() CASCADE;
DROP FUNCTION IF EXISTS public.bump_job_applications() CASCADE;
