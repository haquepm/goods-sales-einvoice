-- Ensure the creator becomes the initial owner atomically.
-- The trigger runs inside the business INSERT transaction and bypasses RLS
-- only for this narrowly scoped membership bootstrap operation.
create or replace function public.bootstrap_business_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_users (business_id, user_id, role, is_active)
  values (new.id, new.created_by, 'owner', true);
  return new;
end;
$$;

revoke all on function public.bootstrap_business_owner() from public;

create trigger businesses_bootstrap_owner
after insert on public.businesses
for each row execute function public.bootstrap_business_owner();

-- Prevent duplicate default bank accounts within one business.
create unique index business_one_default_bank_account_idx
on public.business_bank_accounts(business_id)
where is_default = true;
