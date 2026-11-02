-- Updates portfolio photos for the 15 seeded contractor projects without
-- resetting or deleting any users, projects, or other application data.
-- Run only against the local development Supabase project.

begin;

drop table if exists pg_temp.seeded_portfolio_photos;

create temporary table seeded_portfolio_photos as
select
  u.id as contractor_id,
  item.id as portfolio_item_id,
  seed.file_path
from (
  values
    ('northstar@gmail.com', 'Two-Storey Family Residence', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'),
    ('northstar@gmail.com', 'Compact City Bungalow', 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80'),
    ('northstar@gmail.com', 'Expanded Family Home', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80'),
    ('harborline@gmail.com', 'Coastal Family Home', 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80'),
    ('harborline@gmail.com', 'Cebu Garden Bungalow', 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80'),
    ('harborline@gmail.com', 'Townhouse Interior Renewal', 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80'),
    ('stonebridge@gmail.com', 'Davao Two-Storey Home', 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=80'),
    ('stonebridge@gmail.com', 'Modern Townhouse Build', 'https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1200&q=80'),
    ('stonebridge@gmail.com', 'Residential Structural Upgrade', 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1200&q=80'),
    ('cedarcrest@gmail.com', 'Iloilo Starter Home', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80'),
    ('cedarcrest@gmail.com', 'Two-Storey Courtyard House', 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80'),
    ('cedarcrest@gmail.com', 'Home Extension and Renewal', 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80'),
    ('summitcraft@gmail.com', 'Rizal Hillside Residence', 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80'),
    ('summitcraft@gmail.com', 'Townhouse Family Build', 'https://images.unsplash.com/photo-1600585153490-76fb20a32601?auto=format&fit=crop&w=1200&q=80'),
    ('summitcraft@gmail.com', 'Kitchen and Living Renovation', 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1200&q=80')
) as seed(email, title, file_path)
join auth.users u on lower(u.email) = seed.email
join public.portfolio_items item
  on item.contractor_id = u.id
 and item.title = seed.title;

do $$
begin
  if (select count(*) from seeded_portfolio_photos) <> 15 then
    raise exception 'Expected all 15 seeded portfolio projects; no changes were applied.';
  end if;
end
$$;

update public.portfolio_images image
set file_path = seed.file_path,
    sort_order = 0
from seeded_portfolio_photos seed
where image.portfolio_item_id = seed.portfolio_item_id;

insert into public.portfolio_images (portfolio_item_id, file_path, sort_order)
select seed.portfolio_item_id, seed.file_path, 0
from seeded_portfolio_photos seed
where not exists (
  select 1
  from public.portfolio_images image
  where image.portfolio_item_id = seed.portfolio_item_id
);

do $$
begin
  if exists (
    select 1
    from seeded_portfolio_photos seed
    where not exists (
      select 1
      from public.portfolio_images image
      where image.portfolio_item_id = seed.portfolio_item_id
        and image.file_path = seed.file_path
        and image.sort_order = 0
    )
  ) then
    raise exception 'Some seeded portfolio photos could not be linked.';
  end if;
end
$$;

drop table seeded_portfolio_photos;

commit;

select count(*) as seeded_portfolio_projects_with_photos
from public.portfolio_images image
where image.sort_order = 0
  and image.file_path like 'https://images.unsplash.com/%';
