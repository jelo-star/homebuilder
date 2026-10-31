-- Ensure profile address exists in hosted databases before profile edits use it.
alter table public.profiles
  add column if not exists address text;

notify pgrst, 'reload schema';
