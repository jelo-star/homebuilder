-- SMART CONTRACTOR MATCHING | 07
-- Private buckets protect IDs, plans and milestone proofs; owner id must be the first folder segment.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('contractor-docs','contractor-docs',false,10485760,array['image/jpeg','image/png','application/pdf']),
 ('portfolio','portfolio',true,15728640,array['image/jpeg','image/png','image/webp']),
 ('project-plans','project-plans',false,20971520,array['application/pdf','image/jpeg','image/png']),
 ('milestone-proofs','milestone-proofs',false,15728640,array['image/jpeg','image/png','image/webp','application/pdf']),
 ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists contractor_docs_select_owner_admin on storage.objects;
create policy contractor_docs_select_owner_admin on storage.objects for select to authenticated
using (bucket_id='contractor-docs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
drop policy if exists contractor_docs_insert_owner on storage.objects;
create policy contractor_docs_insert_owner on storage.objects for insert to authenticated
with check (bucket_id='contractor-docs' and (storage.foldername(name))[1]=auth.uid()::text and public.current_role()='contractor');
drop policy if exists contractor_docs_update_owner on storage.objects;
create policy contractor_docs_update_owner on storage.objects for update to authenticated
using (bucket_id='contractor-docs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()))
with check (bucket_id='contractor-docs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
drop policy if exists contractor_docs_delete_owner_admin on storage.objects;
create policy contractor_docs_delete_owner_admin on storage.objects for delete to authenticated
using (bucket_id='contractor-docs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

drop policy if exists portfolio_public_read on storage.objects;
create policy portfolio_public_read on storage.objects for select to public using (bucket_id='portfolio');
drop policy if exists portfolio_owner_write on storage.objects;
create policy portfolio_owner_write on storage.objects for all to authenticated
using (bucket_id='portfolio' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()))
with check (bucket_id='portfolio' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

drop policy if exists project_plans_select_owner_admin on storage.objects;
create policy project_plans_select_owner_admin on storage.objects for select to authenticated
using (bucket_id='project-plans' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
drop policy if exists project_plans_insert_owner on storage.objects;
create policy project_plans_insert_owner on storage.objects for insert to authenticated
with check (bucket_id='project-plans' and (storage.foldername(name))[1]=auth.uid()::text and public.current_role()='homeowner');
drop policy if exists project_plans_update_owner_admin on storage.objects;
create policy project_plans_update_owner_admin on storage.objects for update to authenticated
using (bucket_id='project-plans' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()))
with check (bucket_id='project-plans' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

drop policy if exists milestone_proofs_select_participants on storage.objects;
create policy milestone_proofs_select_participants on storage.objects for select to authenticated
using (bucket_id='milestone-proofs' and (
  (storage.foldername(name))[1]=auth.uid()::text or public.is_admin()
  or exists(select 1 from public.milestone_proofs mp join public.milestones m on m.id=mp.milestone_id
    join public.projects p on p.id=m.project_id where mp.file_path=name and p.homeowner_id=auth.uid())
));
drop policy if exists milestone_proofs_insert_contractor on storage.objects;
create policy milestone_proofs_insert_contractor on storage.objects for insert to authenticated
with check (bucket_id='milestone-proofs' and (storage.foldername(name))[1]=auth.uid()::text and public.current_role()='contractor');

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select to public using (bucket_id='avatars');
drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects for all to authenticated
using (bucket_id='avatars' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()))
with check (bucket_id='avatars' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
