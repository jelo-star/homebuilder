-- Ensure homeowners can create signed URLs for proof objects attached to
-- milestones in their own projects, regardless of the object's folder layout.
grant select on public.milestone_proofs to authenticated;

drop policy if exists milestone_proofs_select_policy on public.milestone_proofs;
create policy milestone_proofs_select_policy
  on public.milestone_proofs
  for select
  to authenticated
  using (
    public.is_admin()
    or uploaded_by = (select auth.uid())
    or exists (
      select 1
      from public.milestones m
      join public.projects p on p.id = m.project_id
      where m.id = milestone_proofs.milestone_id
        and p.homeowner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.milestones m
      join public.quotes q on q.id = m.quote_id
      where m.id = milestone_proofs.milestone_id
        and q.contractor_id = (select auth.uid())
    )
  );

drop policy if exists milestone_proofs_homeowner_object_read on storage.objects;
create policy milestone_proofs_homeowner_object_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'milestone-proofs'
    and exists (
      select 1
      from public.milestone_proofs mp
      join public.milestones m on m.id = mp.milestone_id
      join public.projects p on p.id = m.project_id
      where mp.file_path = storage.objects.name
        and p.homeowner_id = (select auth.uid())
    )
  );

grant execute on function public.is_admin() to authenticated;

notify pgrst, 'reload schema';
