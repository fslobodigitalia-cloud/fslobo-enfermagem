alter function public.set_updated_at() set search_path = pg_catalog;

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
grant execute on function public.rls_auto_enable() to service_role;
