-- Allow public profiles to show portfolio entries and images for approved,
-- active contractors without exposing other contractors' portfolio data.
grant usage on schema public to anon, authenticated;

drop policy if exists portfolio_items_public_read on public.portfolio_items;
create policy portfolio_items_public_read
  on public.portfolio_items
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.contractor_directory cd
      where cd.profile_id = portfolio_items.contractor_id
    )
  );

revoke select on public.portfolio_items from anon;
grant select (
  id,
  contractor_id,
  title,
  description,
  house_type,
  floors,
  floor_area_sqm,
  year_completed,
  created_at,
  updated_at
) on public.portfolio_items to anon, authenticated;

drop policy if exists portfolio_images_public_read on public.portfolio_images;
create policy portfolio_images_public_read
  on public.portfolio_images
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.portfolio_items pi
      join public.contractor_directory cd
        on cd.profile_id = pi.contractor_id
      where pi.id = portfolio_images.portfolio_item_id
    )
  );

revoke select on public.portfolio_images from anon;
grant select (
  id,
  portfolio_item_id,
  file_path,
  sort_order,
  created_at
) on public.portfolio_images to anon, authenticated;

notify pgrst, 'reload schema';
