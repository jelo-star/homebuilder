-- A milestone cannot be submitted for homeowner review without contractor photo proof.
create or replace function public.require_milestone_photo_proof()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'proof_submitted'
     and not exists (
       select 1
       from public.milestone_proofs
       where milestone_id = new.id
     )
  then
    raise exception 'At least one contractor photo proof is required before milestone review';
  end if;

  return new;
end;
$$;

drop trigger if exists milestones_require_photo_proof on public.milestones;
create constraint trigger milestones_require_photo_proof
after insert or update of status on public.milestones
deferrable initially deferred
for each row
execute function public.require_milestone_photo_proof();
