-- Migration 55: Restore the milestone uniqueness required by plan submissions.
--
-- The milestone submission uses ON CONFLICT (quote_id, seq). Older databases
-- may not contain the original constraint because the table was created before
-- migration 02 was applied.

do $$
begin
  if exists (
    select 1
    from public.milestones
    group by quote_id, seq
    having count(*) > 1
  ) then
    raise exception
      'Cannot add milestones(quote_id, seq) uniqueness: duplicate milestones exist';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.milestones'::regclass
      and contype in ('u', 'p')
      and conname = 'milestones_quote_id_seq_key'
  ) then
    alter table public.milestones
      add constraint milestones_quote_id_seq_key unique (quote_id, seq);
  end if;
end
$$;

notify pgrst, 'reload schema';
