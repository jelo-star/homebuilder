-- Restore the private bucket required for contractor milestone inspection uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'milestone-proofs',
  'milestone-proofs',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists milestone_proofs_select_participants on storage.objects;
create policy milestone_proofs_select_participants on storage.objects
for select to authenticated
using (
  bucket_id = 'milestone-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
    or exists (
      select 1
      from public.milestone_proofs mp
      join public.milestones m on m.id = mp.milestone_id
      join public.projects p on p.id = m.project_id
      where mp.file_path = name
        and p.homeowner_id = auth.uid()
    )
  )
);

drop policy if exists milestone_proofs_insert_contractor on storage.objects;
create policy milestone_proofs_insert_contractor on storage.objects
for insert to authenticated
with check (
  bucket_id = 'milestone-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.current_role() = 'contractor'
);
