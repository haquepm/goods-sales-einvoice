-- Enforce same-tenant foreign-key relationships even if UUIDs are guessed.
create unique index customers_id_business_uidx on public.customers(id, business_id);
create unique index products_id_business_uidx on public.products(id, business_id);
create unique index goods_invoices_id_business_uidx on public.goods_invoices(id, business_id);

alter table public.goods_invoices
  add constraint goods_invoices_customer_same_business_fk
  foreign key (customer_id, business_id)
  references public.customers(id, business_id);

alter table public.bulk_import_batches
  add constraint bulk_import_customer_same_business_fk
  foreign key (customer_id, business_id)
  references public.customers(id, business_id);

create or replace function public.validate_goods_invoice_item_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  invoice_business_id uuid;
  product_business_id uuid;
begin
  select i.business_id into invoice_business_id
  from public.goods_invoices i where i.id = new.invoice_id;

  if invoice_business_id is null then
    raise exception 'Invoice not found or not accessible';
  end if;

  if new.product_id is not null then
    select p.business_id into product_business_id
    from public.products p where p.id = new.product_id;
    if product_business_id is distinct from invoice_business_id then
      raise exception 'Product and invoice must belong to the same business';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_goods_invoice_item_tenant() from public;
create trigger goods_invoice_item_tenant_guard
before insert or update of invoice_id, product_id on public.goods_invoice_items
for each row execute function public.validate_goods_invoice_item_tenant();

create or replace function public.validate_bulk_import_row_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  batch_business_id uuid;
  invoice_business_id uuid;
begin
  select b.business_id into batch_business_id
  from public.bulk_import_batches b where b.id = new.batch_id;

  if batch_business_id is null then
    raise exception 'Import batch not found or not accessible';
  end if;

  if new.invoice_id is not null then
    select i.business_id into invoice_business_id
    from public.goods_invoices i where i.id = new.invoice_id;
    if invoice_business_id is distinct from batch_business_id then
      raise exception 'Import batch and invoice must belong to the same business';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_bulk_import_row_tenant() from public;
create trigger bulk_import_row_tenant_guard
before insert or update of batch_id, invoice_id on public.bulk_import_rows
for each row execute function public.validate_bulk_import_row_tenant();
