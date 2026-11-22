-- Keep the public onboarding RPC SECURITY INVOKER while moving the narrowly
-- scoped tenant bootstrap writes into a private SECURITY DEFINER helper.
-- The helper is not exposed through the Data API and requires auth.uid().

create or replace function goods_sales_private.create_business_with_gst_profile(
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
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_business_id uuid;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if nullif(trim(p_legal_name), '') is null then
    raise exception 'Legal business name is required' using errcode = '22023';
  end if;

  insert into public.businesses (legal_name, trade_name, created_by)
  values (trim(p_legal_name), nullif(trim(p_trade_name), ''), v_user_id)
  returning id into v_business_id;

  insert into public.business_gst_settings (
    business_id, gstin, legal_name, address_line_1, address_line_2,
    city, district, state_name, state_code, postal_code, email, phone
  ) values (
    v_business_id, nullif(upper(trim(p_gstin)), ''), trim(p_legal_name),
    nullif(trim(p_address_line_1), ''), nullif(trim(p_address_line_2), ''),
    nullif(trim(p_city), ''), nullif(trim(p_district), ''),
    nullif(trim(p_state_name), ''), nullif(trim(p_state_code), ''),
    nullif(trim(p_postal_code), ''), nullif(trim(p_email), ''),
    nullif(trim(p_phone), '')
  );

  return v_business_id;
end;
$$;

revoke all on function goods_sales_private.create_business_with_gst_profile(text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function goods_sales_private.create_business_with_gst_profile(text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

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
begin
  return goods_sales_private.create_business_with_gst_profile(
    p_legal_name, p_trade_name, p_gstin, p_address_line_1, p_address_line_2,
    p_city, p_district, p_state_name, p_state_code, p_postal_code, p_email, p_phone
  );
end;
$$;

revoke all on function public.create_business_with_gst_profile(text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_business_with_gst_profile(text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
