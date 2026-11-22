-- Create a complete draft invoice atomically with server-calculated tax and a locked number sequence.
create or replace function public.create_goods_invoice_draft(p_business_id uuid, p_customer_id uuid, p_invoice_date date, p_items jsonb, p_supply_type text default 'B2B', p_delivery_details jsonb default '{}'::jsonb, p_transport_details jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_seller record;
  v_buyer record;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_date date := coalesce(p_invoice_date, current_date);
  v_fy text;
  v_invoice_number text;
  v_subtotal numeric(14,2) := 0;
  v_cgst numeric(14,2) := 0;
  v_sgst numeric(14,2) := 0;
  v_igst numeric(14,2) := 0;
  v_grand numeric(14,2) := 0;
  v_item jsonb;
  v_product record;
  v_qty numeric(14,3);
  v_rate numeric(14,2);
  v_discount numeric(14,2);
  v_taxable numeric(14,2);
  v_cgst_line numeric(14,2);
  v_sgst_line numeric(14,2);
  v_igst_line numeric(14,2);
  v_total numeric(14,2);
  v_line integer := 0;
  v_place_state text;
  v_seller_snapshot jsonb;
  v_buyer_snapshot jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not goods_sales_private.has_business_role(p_business_id, array['owner','admin','accountant']::public.business_member_role[]) then
    raise exception 'You do not have permission to create invoices for this business';
  end if;
  if p_supply_type not in ('B2B','B2C','EXP','SEZ','DEXP') then raise exception 'Invalid supply type'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'At least one invoice line is required'; end if;

  select g.* into v_seller from public.business_gst_settings g where g.business_id = p_business_id;
  if not found then raise exception 'Complete the seller GST profile before creating an invoice'; end if;
  if coalesce(v_seller.gstin,'') = '' or coalesce(v_seller.state_code,'') = '' then
    raise exception 'Seller GSTIN and state code are required for GST invoice calculation';
  end if;

  select c.* into v_buyer from public.customers c where c.id = p_customer_id and c.business_id = p_business_id and c.is_active = true;
  if not found then raise exception 'Select an active customer belonging to this business'; end if;

  v_place_state := coalesce(nullif(v_buyer.state_code,''), substring(v_buyer.gstin from 1 for 2));
  if v_place_state is null or length(v_place_state) <> 2 then raise exception 'Customer state code is required'; end if;
  if p_supply_type = 'B2B' and coalesce(v_buyer.gstin,'') = '' then raise exception 'A GSTIN is required for B2B supply'; end if;

  v_fy := case when extract(month from v_invoice_date) >= 4
    then to_char(v_invoice_date,'YYYY') || '-' || right((extract(year from v_invoice_date)::integer + 1)::text,2)
    else (extract(year from v_invoice_date)::integer - 1)::text || '-' || right(extract(year from v_invoice_date)::integer::text,2)
  end;

  insert into public.invoice_sequences(business_id, financial_year, prefix, next_number)
  values (p_business_id, v_fy, 'INV/' || v_fy || '/', 1)
  on conflict (business_id, financial_year) do nothing;

  update public.invoice_sequences
  set next_number = next_number + 1, updated_at = now()
  where business_id = p_business_id and financial_year = v_fy
  returning prefix || lpad((next_number - 1)::text, 4, '0') into v_invoice_number;

  v_seller_snapshot := jsonb_build_object(
    'legal_name',v_seller.legal_name,'gstin',v_seller.gstin,'address_line_1',v_seller.address_line_1,
    'address_line_2',v_seller.address_line_2,'city',v_seller.city,'district',v_seller.district,
    'state_name',v_seller.state_name,'state_code',v_seller.state_code,'postal_code',v_seller.postal_code,
    'email',v_seller.email,'phone',v_seller.phone
  );
  v_buyer_snapshot := jsonb_build_object(
    'legal_name',v_buyer.legal_name,'trade_name',v_buyer.trade_name,'gstin',v_buyer.gstin,
    'billing_address',v_buyer.billing_address,'shipping_address',v_buyer.shipping_address,
    'state_code',v_place_state,'email',v_buyer.email,'phone',v_buyer.phone
  );

  insert into public.goods_invoices(
    id,business_id,customer_id,invoice_number,financial_year,invoice_date,supply_type,
    place_of_supply_state_code,delivery_details,transport_details,seller_snapshot,buyer_snapshot,
    created_by,status
  ) values (
    v_invoice_id,p_business_id,p_customer_id,v_invoice_number,v_fy,v_invoice_date,p_supply_type,
    v_place_state,coalesce(p_delivery_details,'{}'::jsonb),coalesce(p_transport_details,'{}'::jsonb),
    v_seller_snapshot,v_buyer_snapshot,v_user_id,'draft'
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_line := v_line + 1;
    select p.* into v_product from public.products p
    where p.id = (v_item->>'product_id')::uuid and p.business_id = p_business_id and p.is_active = true;
    if not found then raise exception 'An invoice product is inactive or does not belong to this business'; end if;

    v_qty := (v_item->>'quantity')::numeric;
    v_rate := coalesce(nullif(v_item->>'unit_rate','')::numeric, v_product.default_rate);
    v_discount := coalesce(nullif(v_item->>'discount_amount','')::numeric,0);
    if v_qty <= 0 or v_rate < 0 or v_discount < 0 then raise exception 'Invalid quantity, rate or discount on line %',v_line; end if;
    v_taxable := round((v_qty * v_rate) - v_discount,2);
    if v_taxable < 0 then raise exception 'Discount exceeds line value on line %',v_line; end if;

    if v_seller.state_code = v_place_state then
      v_cgst_line := round(v_taxable * v_product.gst_rate / 200,2);
      v_sgst_line := round(v_taxable * v_product.gst_rate / 200,2);
      v_igst_line := 0;
    else
      v_cgst_line := 0; v_sgst_line := 0;
      v_igst_line := round(v_taxable * v_product.gst_rate / 100,2);
    end if;
    v_total := v_taxable + v_cgst_line + v_sgst_line + v_igst_line;
    insert into public.goods_invoice_items(
      invoice_id,product_id,line_number,description,hsn_code,quantity,unit_code,unit_rate,
      discount_amount,taxable_value,gst_rate,cgst_amount,sgst_amount,igst_amount,line_total
    ) values (
      v_invoice_id,v_product.id,v_line,v_product.description,v_product.hsn_code,v_qty,v_product.unit_code,
      v_rate,v_discount,v_taxable,v_product.gst_rate,v_cgst_line,v_sgst_line,v_igst_line,v_total
    );
    v_subtotal := v_subtotal + v_taxable;
    v_cgst := v_cgst + v_cgst_line; v_sgst := v_sgst + v_sgst_line; v_igst := v_igst + v_igst_line;
    v_grand := v_grand + v_total;
  end loop;

  update public.goods_invoices set
    subtotal = v_subtotal, cgst_total = v_cgst, sgst_total = v_sgst, igst_total = v_igst,
    grand_total = v_grand, amount_in_words = null, updated_at = now()
  where id = v_invoice_id;

  insert into public.business_audit_logs(business_id,actor_id,action,entity_type,entity_id,after_data)
  values (p_business_id,v_user_id,'invoice.draft_created','goods_invoice',v_invoice_id,
    jsonb_build_object('invoice_number',v_invoice_number,'grand_total',v_grand,'financial_year',v_fy));

  return v_invoice_id;
end;
$$;

revoke all on function public.create_goods_invoice_draft(uuid,uuid,date,jsonb,text,jsonb,jsonb) from public, anon;
grant execute on function public.create_goods_invoice_draft(uuid,uuid,date,jsonb,text,jsonb,jsonb) to authenticated;
