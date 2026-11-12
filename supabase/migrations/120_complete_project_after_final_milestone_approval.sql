  create or replace function public.complete_project_after_final_milestone_approval()
  returns trigger
  language plpgsql
  security definer
  set search_path = pg_catalog, public
  set row_security = off
  as $$
  declare
    v_awarded_quote_id uuid;
    v_contractor_id uuid;
  begin
    if new.status <> 'approved' or old.status = 'approved' then
      return new;
    end if;

    if exists (
      select 1
        from public.milestones
      where project_id = new.project_id
        and (
          status not in ('approved', 'paid', 'refunded')
          or (
            status = 'approved'
            and public.milestone_verified_funding(id) < coalesce(homeowner_total_amount, amount)
          )
        )
    ) then
      return new;
    end if;

    update public.projects
      set status = 'completed',
          updated_at = now()
    where id = new.project_id
      and status in ('awarded', 'project_planning', 'in_progress')
    returning awarded_quote_id into v_awarded_quote_id;

    if found then
      select contractor_id
        into v_contractor_id
        from public.quotes
      where id = v_awarded_quote_id;

      update public.contractor_profiles
        set projects_completed = projects_completed + 1
      where profile_id = v_contractor_id;
    end if;

    return new;
  end;
  $$;

  drop trigger if exists milestones_complete_project_after_final_approval on public.milestones;
  create trigger milestones_complete_project_after_final_approval
  after update of status on public.milestones
  for each row
  execute function public.complete_project_after_final_milestone_approval();

  do $$
  declare
    v_project record;
  begin
    for v_project in
      select p.id, q.contractor_id
        from public.projects p
        join public.quotes q on q.id = p.awarded_quote_id
      where p.status in ('awarded', 'project_planning', 'in_progress')
        and exists (
          select 1
            from public.milestones m
            where m.project_id = p.id
        )
        and not exists (
          select 1
            from public.milestones m
            where m.project_id = p.id
              and (
                m.status not in ('approved', 'paid', 'refunded')
                or (
                  m.status = 'approved'
                  and public.milestone_verified_funding(m.id) < coalesce(m.homeowner_total_amount, m.amount)
                )
              )
        )
    loop
      update public.projects
        set status = 'completed',
            updated_at = now()
      where id = v_project.id
        and status in ('awarded', 'project_planning', 'in_progress');

      if found then
        update public.contractor_profiles
          set projects_completed = projects_completed + 1
        where profile_id = v_project.contractor_id;
      end if;
    end loop;
  end;
  $$;
