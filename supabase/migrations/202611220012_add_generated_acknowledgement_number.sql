alter table public.goods_invoices
  add column if not exists generated_ack_no text
  not null
  default lpad(floor(random() * 1000000000000000)::bigint::text, 15, '0');

create unique index if not exists goods_invoices_generated_ack_no_uidx
  on public.goods_invoices (generated_ack_no);
