-- Goods Sales e-Invoice: operational schema.
-- All records are tenant-scoped through business_id. Invoice data is immutable
-- after successful IRP registration except via explicit cancellation/credit-note workflows.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_code text,
  legal_name text not null,
  trade_name text,
  gstin text,
  email text,
  phone text,
  billing_address jsonb not null default '{}'::jsonb,
  shipping_address jsonb not null default '{}'::jsonb,
  state_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, customer_code),
  constraint customers_gstin_format check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);
create index customers_business_name_idx on public.customers(business_id, legal_name);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sku text,
  description text not null,
  hsn_code text not null,
  unit_code text not null,
  gst_rate numeric(5,2) not null default 0 check (gst_rate between 0 and 100),
  default_rate numeric(14,2) not null default 0 check (default_rate >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sku)
);
create index products_business_description_idx on public.products(business_id, description);

create table public.invoice_sequences (
  business_id uuid not null references public.businesses(id) on delete cascade,
  financial_year text not null,
  prefix text not null default '',
  next_number bigint not null default 1 check (next_number > 0),
  updated_at timestamptz not null default now(),
  primary key (business_id, financial_year)
);

create type public.goods_invoice_status as enum (
  'draft', 'ready_for_irp', 'irp_pending', 'irp_registered', 'irp_failed',
  'cancel_pending', 'cancelled'
);

create table public.goods_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_number text not null,
  financial_year text not null,
  invoice_date date not null,
  supply_type text not null default 'B2B' check (supply_type in ('B2B','B2C','EXP','SEZ','DEXP')),
  place_of_supply_state_code text,
  reverse_charge boolean not null default false,
  delivery_details jsonb not null default '{}'::jsonb,
  transport_details jsonb not null default '{}'::jsonb,
  seller_snapshot jsonb not null default '{}'::jsonb,
  buyer_snapshot jsonb not null default '{}'::jsonb,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  cgst_total numeric(14,2) not null default 0 check (cgst_total >= 0),
  sgst_total numeric(14,2) not null default 0 check (sgst_total >= 0),
  igst_total numeric(14,2) not null default 0 check (igst_total >= 0),
  cess_total numeric(14,2) not null default 0 check (cess_total >= 0),
  round_off numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  amount_in_words text,
  status public.goods_invoice_status not null default 'draft',
  irp_provider text,
  irn text,
  acknowledgement_number text,
  acknowledgement_date timestamptz,
  signed_invoice jsonb,
  signed_qr_code text,
  irp_response jsonb,
  irp_registered_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, financial_year, invoice_number),
  unique (irp_provider, irn)
);
create index goods_invoices_business_date_idx on public.goods_invoices(business_id, invoice_date desc);
create index goods_invoices_business_status_idx on public.goods_invoices(business_id, status);

create table public.goods_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.goods_invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  line_number integer not null check (line_number > 0),
  description text not null,
  hsn_code text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_code text not null,
  unit_rate numeric(14,2) not null check (unit_rate >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  taxable_value numeric(14,2) not null check (taxable_value >= 0),
  gst_rate numeric(5,2) not null check (gst_rate between 0 and 100),
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  cess_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null check (line_total >= 0),
  source_supplier text,
  source_vehicle_number text,
  source_excel_row integer,
  unique (invoice_id, line_number)
);
create index goods_invoice_items_invoice_idx on public.goods_invoice_items(invoice_id);

create table public.einvoice_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.goods_invoices(id) on delete cascade,
  provider text not null,
  request_id text,
  status text not null check (status in ('queued','submitted','registered','failed','cancelled')),
  request_payload jsonb,
  response_payload jsonb,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);
create index einvoice_submissions_business_invoice_idx on public.einvoice_submissions(business_id, invoice_id, attempted_at desc);

create table public.bulk_import_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  file_name text not null,
  status text not null default 'preview' check (status in ('preview','validated','generating','completed','failed')),
  total_rows integer not null default 0,
  eligible_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.bulk_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.bulk_import_batches(id) on delete cascade,
  source_row_number integer not null,
  source_date date,
  material_supplier text,
  vehicle_number text,
  unit_code text,
  materials jsonb not null default '{}'::jsonb,
  validation_status text not null check (validation_status in ('eligible','skipped','error','generated')),
  validation_message text,
  invoice_id uuid references public.goods_invoices(id) on delete set null,
  unique (batch_id, source_row_number)
);

create table public.business_audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index business_audit_logs_business_time_idx on public.business_audit_logs(business_id, created_at desc);

-- Tenant membership predicates on every business-scoped resource.
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.goods_invoices enable row level security;
alter table public.goods_invoice_items enable row level security;
alter table public.einvoice_submissions enable row level security;
alter table public.bulk_import_batches enable row level security;
alter table public.bulk_import_rows enable row level security;
alter table public.business_audit_logs enable row level security;

create policy customers_member_access on public.customers for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy products_member_access on public.products for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy invoice_sequences_admin_access on public.invoice_sequences for all to authenticated
using (public.has_business_role(business_id, array['owner','admin','accountant']::public.business_member_role[]))
with check (public.has_business_role(business_id, array['owner','admin','accountant']::public.business_member_role[]));

create policy goods_invoices_member_access on public.goods_invoices for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy goods_invoice_items_member_access on public.goods_invoice_items for all to authenticated
using (exists (
  select 1 from public.goods_invoices i
  where i.id = invoice_id and public.is_business_member(i.business_id)
))
with check (exists (
  select 1 from public.goods_invoices i
  where i.id = invoice_id and public.is_business_member(i.business_id)
));

create policy einvoice_submissions_member_access on public.einvoice_submissions for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy bulk_import_batches_member_access on public.bulk_import_batches for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy bulk_import_rows_member_access on public.bulk_import_rows for all to authenticated
using (exists (
  select 1 from public.bulk_import_batches b
  where b.id = batch_id and public.is_business_member(b.business_id)
))
with check (exists (
  select 1 from public.bulk_import_batches b
  where b.id = batch_id and public.is_business_member(b.business_id)
));

create policy business_audit_logs_member_read on public.business_audit_logs for select to authenticated
using (public.is_business_member(business_id));
create policy business_audit_logs_member_insert on public.business_audit_logs for insert to authenticated
with check (public.is_business_member(business_id) and actor_id = (select auth.uid()));

-- Explicit Data API grants are required on projects where new public tables are not auto-exposed.
grant select, insert, update, delete on
  public.businesses, public.business_users, public.business_gst_settings, public.business_bank_accounts,
  public.customers, public.products, public.invoice_sequences, public.goods_invoices,
  public.goods_invoice_items, public.einvoice_submissions, public.bulk_import_batches,
  public.bulk_import_rows, public.business_audit_logs
to authenticated;
grant usage on schema public to authenticated;
