-- Generate a unique 64-character invoice reference for every invoice.
-- Two independently generated UUIDs provide 32 random bytes represented as 64 hex characters.
alter table public.goods_invoices
  add column generated_irn text not null
  default upper(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

alter table public.goods_invoices
  add constraint goods_invoices_business_generated_irn_key
  unique (business_id, generated_irn);

comment on column public.goods_invoices.generated_irn is
  'Automatically generated 64-character per-business invoice reference.';
