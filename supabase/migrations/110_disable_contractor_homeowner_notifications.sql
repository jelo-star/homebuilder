drop trigger if exists quotes_notify_status on public.quotes;
drop trigger if exists milestones_notify_status on public.milestones;

notify pgrst, 'reload schema';
