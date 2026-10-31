-- Migration 56: Allow contractors to remove unsent milestone drafts.
--
-- A removed spreadsheet row must also be removed from milestones. Otherwise
-- the next row reuses its sequence and violates milestones_project_seq_unique.

drop policy if exists milestones_contractor_delete on public.milestones;
create policy milestones_contractor_delete on public.milestones
for delete to authenticated
using (
  exists (
    select 1
    from public.quotes q
    join public.projects p on p.id = q.project_id
    where q.id = milestones.quote_id
      and q.project_id = milestones.project_id
      and q.contractor_id = auth.uid()
      and q.status = 'accepted'
      and p.awarded_quote_id = q.id
      and p.status = 'project_planning'
  )
  and status in ('locked', 'in_progress')
);

notify pgrst, 'reload schema';
