-- Initial multi-business tenant foundation.
-- Apply with Supabase CLI after linking the intended project.
create extension if not exists pgcrypto;

create type public.business_member_role as enum ('owner', 'admin', 'accountant', 'operator', 'viewer');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_users (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.business_member_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.business_gst_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  gstin text,
  legal_name text not null,
  address_line_1 text,
  address_line_2 text,
  city text,
  district text,
  state_name text,
  state_code text,
  postal_code text,
  email text,
  phone text,
  einvoice_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_gstin_format check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);

create table public.business_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  account_holder_name text not null,
  bank_name text not null,
  account_number text not null,
  ifsc_code text not null,
  branch_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index business_users_user_active_idx on public.business_users(user_id, is_active);
create index business_bank_accounts_business_idx on public.business_bank_accounts(business_id);

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = target_business_id
      and bu.user_id = (select auth.uid())
      and bu.is_active = true
  );
$$;

create or replace function public.has_business_role(target_business_id uuid, allowed_roles public.business_member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = target_business_id
      and bu.user_id = (select auth.uid())
      and bu.is_active = true
      and bu.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_business_role(uuid, public.business_member_role[]) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, public.business_member_role[]) to authenticated;

alter table public.businesses enable row level security;
alter table public.business_users enable row level security;
alter table public.business_gst_settings enable row level security;
alter table public.business_bank_accounts enable row level security;

create policy "business members can view their businesses"
on public.businesses for select to authenticated
using (public.is_business_member(id));

create policy "authenticated users can create a business for themselves"
on public.businesses for insert to authenticated
with check (created_by = (select auth.uid()));

create policy "business admins can update business profile"
on public.businesses for update to authenticated
using (public.has_business_role(id, array['owner','admin']::public.business_member_role[]))
with check (public.has_business_role(id, array['owner','admin']::public.business_member_role[]));

create policy "members can view memberships in their businesses"
on public.business_users for select to authenticated
using (public.is_business_member(business_id));

create policy "business admins can manage memberships"
on public.business_users for all to authenticated
using (public.has_business_role(business_id, array['owner','admin']::public.business_member_role[]))
with check (public.has_business_role(business_id, array['owner','admin']::public.business_member_role[]));

create policy "members can view GST settings"
on public.business_gst_settings for select to authenticated
using (public.is_business_member(business_id));

create policy "business admins can manage GST settings"
on public.business_gst_settings for all to authenticated
using (public.has_business_role(business_id, array['owner','admin']::public.business_member_role[]))
with check (public.has_business_role(business_id, array['owner','admin']::public.business_member_role[]));

create policy "members can view bank accounts"
on public.business_bank_accounts for select to authenticated
using (public.is_business_member(business_id));

create policy "business admins can manage bank accounts"
on public.business_bank_accounts for all to authenticated
using (public.has_business_role(business_id, array['owner','admin']::public.business_member_role[]))
with check (public.has_business_role(business_id, array['owner','admin']::public.business_member_role[]));

-- Owner membership is created by a trusted server-side onboarding transaction.
-- Do not let a client self-assign owner/admin by inserting into business_users.
