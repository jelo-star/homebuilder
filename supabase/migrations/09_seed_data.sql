-- SMART CONTRACTOR MATCHING | 09
-- Placeholder rates and sample configuration. Replace estimates with locally validated rates before launch.
insert into public.estimate_rates(finish_level,work_type,rate_per_sqm,extra_floor_factor,range_pct,is_active,effective_from)
values
 ('basic','new_build',22000,0.04,0.06,true,timestamptz '2026-10-27 00:00:00+00'),
 ('standard','new_build',27000,0.04,0.06,true,timestamptz '2026-10-27 00:00:00+00'),
 ('premium','new_build',35000,0.04,0.06,true,timestamptz '2026-10-27 00:00:00+00'),
 ('basic','renovation',12000,0.04,0.06,true,timestamptz '2026-10-27 00:00:00+00'),
 ('standard','renovation',18000,0.04,0.06,true,timestamptz '2026-10-27 00:00:00+00'),
 ('premium','renovation',26000,0.04,0.06,true,timestamptz '2026-10-27 00:00:00+00'),
 ('basic','extension',16000,0.04,0.06,true,timestamptz '2026-10-27 00:00:00+00'),
 ('standard','extension',22000,0.04,0.06,true,timestamptz '2026-10-27 00:00:00+00'),
 ('premium','extension',30000,0.04,0.06,true,timestamptz '2026-10-27 00:00:00+00')
on conflict(finish_level,work_type,effective_from) do nothing;

insert into public.milestone_templates(seq,name,percent,is_active)
values (1,'Foundation',13,true),(2,'Structure and walls',32,true),(3,'Roofing',15,true),(4,'Finishing',40,true)
on conflict(seq,name) do update set percent=excluded.percent,is_active=excluded.is_active;

insert into public.app_settings(key,value)
values
 ('platform_fee_percent','0'::jsonb),
 ('auto_approve_days','5'::jsonb),
 ('quote_valid_days','14'::jsonb),
 ('match_weights','{"specialty":35,"rating":25,"experience":20,"city":20}'::jsonb),
 ('min_reviews_for_full_rating','3'::jsonb)
on conflict(key) do nothing;

-- Optional sample contractor/profile/project rows require real auth.users IDs.
-- Create real test accounts through Supabase Auth, then add profiles and contractor_profiles using their IDs.
-- Never seed fake auth users or real identity documents in production.
