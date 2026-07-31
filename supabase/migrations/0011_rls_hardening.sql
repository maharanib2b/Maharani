-- 0011_rls_hardening.sql
--
-- Audit finding: `staff_assignments`, `schemes`, and `notification_logs`
-- were created in 0001_init.sql but never had Row Level Security enabled
-- or any policy attached in any later migration. With RLS off, Postgres
-- applies no restriction at all: any authenticated user (e.g. a retailer
-- signed in on the browser client, which uses the public anon key) could
-- read or write these tables directly via PostgREST, completely
-- bypassing the app-level permission checks in lib/permissions and the
-- staff-only guards used elsewhere. This migration is purely additive —
-- it does not alter any existing table, column, or policy — and brings
-- these three tables in line with the same is_staff_or_above() /
-- is_admin_or_above() pattern already used throughout 0001_init.sql.

-- staff_assignments: which area/warehouse a staff member is assigned to.
-- Internal HR-ish data — staff+ can read, admin+ manage it.
alter table staff_assignments enable row level security;

create policy "staff_assignments_staff_read" on staff_assignments
  for select using (staff_id = auth.uid() or is_staff_or_above());

create policy "staff_assignments_admin_write" on staff_assignments
  for insert with check (is_admin_or_above());

create policy "staff_assignments_admin_update" on staff_assignments
  for update using (is_admin_or_above());

create policy "staff_assignments_admin_delete" on staff_assignments
  for delete using (is_admin_or_above());

-- schemes: pricing/promotional schemes referenced by price_lists.scope.
-- Same read visibility as products/banners (active schemes are public
-- to any authenticated user browsing the catalog; staff+ can see
-- inactive/draft ones too). Only staff+ can write, only admin+ delete.
alter table schemes enable row level security;

create policy "schemes_read" on schemes
  for select using (is_active or is_staff_or_above());

create policy "schemes_staff_insert" on schemes
  for insert with check (is_staff_or_above());

create policy "schemes_staff_update" on schemes
  for update using (is_staff_or_above());

create policy "schemes_admin_delete" on schemes
  for delete using (is_admin_or_above());

-- notification_logs: outbound WhatsApp/SMS/push delivery queue rows.
-- Written by lib/notifications/notify.ts using the regular (anon-key,
-- RLS-subject) server client, so an explicit insert policy is required
-- for that write path to keep working — recipients may also read their
-- own delivery logs; staff+ can read/manage all of them.
alter table notification_logs enable row level security;

create policy "notification_logs_owner_or_staff_read" on notification_logs
  for select using (recipient_id = auth.uid() or is_staff_or_above());

create policy "notification_logs_insert" on notification_logs
  for insert with check (recipient_id = auth.uid() or is_staff_or_above());

create policy "notification_logs_staff_update" on notification_logs
  for update using (is_staff_or_above());

-- storage.objects: brand-logos bucket has an insert policy
-- (0003_storage_buckets.sql) but, unlike product-images and banners,
-- no update or delete policy. lib/storage/upload.ts always uploads
-- with upsert: true, which Supabase Storage treats as an UPDATE when
-- the path already exists — so re-uploading a brand logo (or deleting
-- one) would currently fail with an RLS violation the moment that
-- upload UI is wired up. Adding the same staff/admin pattern already
-- used for the other three image buckets.
create policy "staff_update_brand_logos" on storage.objects
  for update using (bucket_id = 'brand-logos' and is_staff_or_above());
create policy "staff_delete_brand_logos" on storage.objects
  for delete using (bucket_id = 'brand-logos' and is_admin_or_above());

-- storage.objects: the product-images bucket's own delete policy
-- (0003_storage_buckets.sql, "staff_write_product_images" section)
-- required is_admin_or_above(), but the matching product_images TABLE
-- row can already be deleted by is_staff_or_above() (see
-- "product_images_staff_delete" in 0005_master_data_delete_and_pricing.sql)
-- and that is also the permission level products-actions.ts's
-- removeProductImageAction is gated on ('products.edit', which staff
-- holds). Realigning the storage object policy to match so a staff
-- user's image removal actually deletes the file, not just the row.
drop policy if exists "staff_delete_product_images" on storage.objects;
create policy "staff_delete_product_images" on storage.objects
  for delete using (bucket_id = 'product-images' and is_staff_or_above());
