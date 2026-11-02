create table if not exists public.popular_services (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 80),
  description text not null check (char_length(trim(description)) between 1 and 180),
  image_url text not null check (image_url ~* '^https?://'),
  filter_key text not null check (filter_key in ('service', 'search')),
  filter_value text not null check (char_length(trim(filter_value)) between 1 and 100),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.popular_services enable row level security;

grant select on public.popular_services to anon, authenticated;
grant insert, update, delete on public.popular_services to authenticated;

create or replace function public.set_popular_services_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop policy if exists popular_services_public_read on public.popular_services;
create policy popular_services_public_read on public.popular_services
  for select to anon, authenticated
  using (is_active);

drop policy if exists popular_services_admin_all on public.popular_services;
create policy popular_services_admin_all on public.popular_services
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists popular_services_set_updated_at on public.popular_services;
create trigger popular_services_set_updated_at
  before update on public.popular_services
  for each row execute function public.set_popular_services_updated_at();

drop trigger if exists popular_services_audit on public.popular_services;

create index if not exists popular_services_active_order_idx
  on public.popular_services (sort_order, created_at)
  where is_active;

insert into public.popular_services (
  title,
  description,
  image_url,
  filter_key,
  filter_value,
  sort_order
)
select seed.title, seed.description, seed.image_url, seed.filter_key, seed.filter_value, seed.sort_order
from (values
  (
    'Kitchen Renovation',
    'Upgrade your kitchen with expert help.',
    'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80',
    'service',
    'renovation',
    1
  ),
  (
    'House Construction',
    'Build your dream home with confidence.',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    'service',
    'new_build',
    2
  ),
  (
    'Interior Design',
    'Create beautiful spaces for your family.',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
    'search',
    'interior design',
    3
  )
) as seed(title, description, image_url, filter_key, filter_value, sort_order)
where not exists (select 1 from public.popular_services);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'popular-services',
  'popular-services',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists popular_services_images_public_read on storage.objects;
create policy popular_services_images_public_read on storage.objects
  for select to public
  using (bucket_id = 'popular-services');

drop policy if exists popular_services_images_admin_write on storage.objects;
create policy popular_services_images_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'popular-services' and public.is_admin())
  with check (bucket_id = 'popular-services' and public.is_admin());

notify pgrst, 'reload schema';
