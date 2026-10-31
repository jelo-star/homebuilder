-- Seed the administrator-controlled platform share used by escrow payouts.
-- Construction per-square-meter prices are stored in construction_benchmarks.

insert into public.app_settings (key, value)
values
  ('platform_fee_percent', '5'::jsonb),
  ('platform_name', '"Smart Contractor Matching"'::jsonb),
  ('auto_verify_pcab', 'false'::jsonb),
  ('escrow_hold_days', '5'::jsonb)
on conflict (key) do nothing;

delete from public.app_settings
where key = 'platform_fee_pct'
  and exists (select 1 from public.app_settings where key = 'platform_fee_percent');
