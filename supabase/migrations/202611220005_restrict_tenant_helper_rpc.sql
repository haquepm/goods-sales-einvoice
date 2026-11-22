-- Harden newly introduced SECURITY DEFINER helpers against direct RPC calls.
revoke execute on function public.is_business_member(uuid) from anon, public;
revoke execute on function public.has_business_role(uuid, public.business_member_role[]) from anon, public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, public.business_member_role[]) to authenticated;

-- This function is trigger-only; neither browser role may invoke it as an RPC.
revoke execute on function public.bootstrap_business_owner() from anon, authenticated, public;
