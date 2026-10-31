-- Store the contractor's task, amount, and date proposal with each quote.
alter table public.quotes
  add column if not exists work_plan jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
