-- SMART CONTRACTOR MATCHING | 08
-- Schedule maintenance jobs only when pg_cron is available and the jobs are not already registered.
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if not exists(select 1 from cron.job where jobname='scm-auto-approve-milestones') then
      perform cron.schedule('scm-auto-approve-milestones','0 * * * *',
        $job$select public.auto_approve_milestones();$job$);
    end if;
    if not exists(select 1 from cron.job where jobname='scm-expire-quotes') then
      perform cron.schedule('scm-expire-quotes','15 2 * * *',
        $job$select public.expire_quotes();$job$);
    end if;
  end if;
exception when undefined_table or insufficient_privilege then
  raise notice 'pg_cron is unavailable or not permitted; schedule auto_approve_milestones and expire_quotes in Supabase Dashboard instead.';
end $$;
