insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-assets', 'invoice-assets', false, 2097152, array['image/png'])
on conflict (id) do update
set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/png'];

drop policy if exists "Business members can view invoice assets" on storage.objects;
create policy "Business members can view invoice assets"
on storage.objects for select to authenticated
using (
  bucket_id = 'invoice-assets'
  and goods_sales_private.is_business_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Business admins can upload invoice assets" on storage.objects;
create policy "Business admins can upload invoice assets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'invoice-assets'
  and goods_sales_private.has_business_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::public.business_member_role[]
  )
);

drop policy if exists "Business admins can update invoice assets" on storage.objects;
create policy "Business admins can update invoice assets"
on storage.objects for update to authenticated
using (
  bucket_id = 'invoice-assets'
  and goods_sales_private.has_business_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::public.business_member_role[]
  )
)
with check (
  bucket_id = 'invoice-assets'
  and goods_sales_private.has_business_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::public.business_member_role[]
  )
);

drop policy if exists "Business admins can delete invoice assets" on storage.objects;
create policy "Business admins can delete invoice assets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'invoice-assets'
  and goods_sales_private.has_business_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::public.business_member_role[]
  )
);
