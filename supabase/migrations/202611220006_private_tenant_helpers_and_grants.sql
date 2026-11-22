-- Keep tenant authorization helpers outside the exposed Data API schema.
create schema if not exists goods_sales_private;
revoke all on schema goods_sales_private from public, anon;
grant usage on schema goods_sales_private to authenticated;

alter function public.is_business_member(uuid) set schema goods_sales_private;
alter function public.has_business_role(uuid, public.business_member_role[]) set schema goods_sales_private;

revoke all on function goods_sales_private.is_business_member(uuid) from public, anon;
revoke all on function goods_sales_private.has_business_role(uuid, public.business_member_role[]) from public, anon;
grant execute on function goods_sales_private.is_business_member(uuid) to authenticated;
grant execute on function goods_sales_private.has_business_role(uuid, public.business_member_role[]) to authenticated;

-- The app tables are authenticated-only. Remove inherited/default anon grants.
revoke all on
  public.businesses, public.business_users, public.business_gst_settings, public.business_bank_accounts,
  public.customers, public.products, public.invoice_sequences, public.goods_invoices,
  public.goods_invoice_items, public.einvoice_submissions, public.bulk_import_batches,
  public.bulk_import_rows, public.business_audit_logs
from anon, public;
grant select, insert, update, delete on
  public.businesses, public.business_users, public.business_gst_settings, public.business_bank_accounts,
  public.customers, public.products, public.invoice_sequences, public.goods_invoices,
  public.goods_invoice_items, public.einvoice_submissions, public.bulk_import_batches,
  public.bulk_import_rows, public.business_audit_logs
to authenticated;
