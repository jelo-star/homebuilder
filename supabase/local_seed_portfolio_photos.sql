-- Seeds Popular Home Services for the local development Supabase project.
-- Apply migration 103_popular_services_management.sql before running this script.
-- Existing services are preserved.

begin;

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
where not exists (
  select 1
  from public.popular_services existing
  where lower(trim(existing.title)) = lower(seed.title)
);

commit;

select title, is_active, sort_order
from public.popular_services
order by sort_order, created_at;
