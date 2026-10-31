-- Store the contractor's progress update alongside milestone photo proofs.
alter table public.milestones
  add column if not exists contractor_update text;
