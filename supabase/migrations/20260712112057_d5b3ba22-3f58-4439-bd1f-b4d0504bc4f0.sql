
-- Revoke public execute on trigger/internal functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- add_user_xp: only authenticated users may invoke; block anon and PUBLIC default
REVOKE EXECUTE ON FUNCTION public.add_user_xp(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_user_xp(uuid, integer) TO authenticated;

-- has_role: used by RLS policies. Keep executable for authenticated (needed for policy evaluation),
-- but revoke from anon and PUBLIC default.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Hide sensitive column `ebook_file_path` from public API surface.
-- Only service_role (server-side) can read it; delivery must go through a
-- purchase-verified server function.
REVOKE SELECT (ebook_file_path) ON public.products FROM anon, authenticated, PUBLIC;
GRANT SELECT (ebook_file_path) ON public.products TO service_role;
