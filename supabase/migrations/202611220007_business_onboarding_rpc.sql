-- Create a business and its GST profile in one transaction.
-- SECURITY INVOKER preserves RLS checks on both inserts.
create or replace function public.create_business_with_gst_profile(
  p_legal_name text,
  p_trade_name text,
  p_gstin text,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_district text,
  p_state_name text,
  p_state_code text,
  p_postal_code text,
  p_email text,
  p_phone text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_business_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(p_legal_name), '') is null then
    raise exception 'Legal business name is required';
  end if;

  insert into public.businesses (legal_name, trade_name, created_by)
  values (trim(p_legal_name), nullif(trim(p_trade_name), ''), (select auth.uid()))
  returning id into new_business_id;

  insert into public.business_gst_settings (
    business_id, gstin, legal_name, address_line_1, address_line_2,
    city, district, state_name, state_code, postal_code, email, phone
  ) values (
    new_business_id, nullif(upper(trim(p_gstin)), ''), trim(p_legal_name),
    nullif(trim(p_address_line_1), ''), nullif(trim(p_address_line_2), ''),
    nullif(trim(p_city), ''), nullif(trim(p_district), ''),
    nullif(trim(p_state_name), ''), nullif(trim(p_state_code), ''),
    nullif(trim(p_postal_code), ''), nullif(trim(p_email), ''),
    nullif(trim(p_phone), '')
  );

  return new_business_id;
end;
$$;

revoke all on function public.create_business_with_gst_profile(text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_business_with_gst_profile(text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
