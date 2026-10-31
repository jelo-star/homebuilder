-- Ensure homeowners can read proof records for milestones in their own projects.
drop policy if exists milestone_proofs_select_policy on public.milestone_proofs;
create policy milestone_proofs_select_policy on public.milestone_proofs
for select to authenticated
using (
  public.is_admin()
  or uploaded_by = auth.uid()
  or exists (
    select 1
    from public.milestones m
    join public.projects p on p.id = m.project_id
    where m.id = milestone_id
      and p.homeowner_id = auth.uid()
  )
  or exists (
    select 1
    from public.milestones m
    join public.quotes q on q.id = m.quote_id
    where m.id = milestone_id
      and q.contractor_id = auth.uid()
  )
);
