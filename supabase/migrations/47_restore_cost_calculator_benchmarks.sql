-- Restore active calculator benchmarks after the reset-and-seed migration.
-- The calculator falls back to NCR when a province-specific region is unavailable.

insert into public.construction_benchmarks (
  project_type, house_type, finish_level, region,
  rate_low, rate_base, rate_high, contingency_pct,
  contractor_overhead_profit_pct, vat_pct, source, source_notes, version, is_active
)
values
  ('new_build', 'one_storey', 'basic', 'NCR', 21000, 24000, 27500, 8, 15, 12, 'Demo benchmark catalog', 'Basic one-storey construction benchmark.', '2026.1', true),
  ('new_build', 'one_storey', 'standard', 'NCR', 26000, 31000, 36000, 10, 15, 12, 'Demo benchmark catalog', 'Standard one-storey construction benchmark.', '2026.1', true),
  ('new_build', 'one_storey', 'premium', 'NCR', 36000, 44000, 52000, 12, 18, 12, 'Demo benchmark catalog', 'Premium one-storey construction benchmark.', '2026.1', true),
  ('new_build', 'two_storey', 'basic', 'NCR', 23000, 26500, 30500, 8, 15, 12, 'Demo benchmark catalog', 'Basic two-storey construction benchmark.', '2026.1', true),
  ('new_build', 'two_storey', 'standard', 'NCR', 28500, 34500, 40000, 10, 15, 12, 'Demo benchmark catalog', 'Standard two-storey construction benchmark.', '2026.1', true),
  ('new_build', 'two_storey', 'premium', 'NCR', 40000, 49000, 58000, 12, 18, 12, 'Demo benchmark catalog', 'Premium two-storey construction benchmark.', '2026.1', true),
  ('new_build', 'townhouse', 'basic', 'NCR', 20500, 23500, 27000, 8, 15, 12, 'Demo benchmark catalog', 'Basic townhouse construction benchmark.', '2026.1', true),
  ('new_build', 'townhouse', 'standard', 'NCR', 25500, 30000, 35000, 10, 15, 12, 'Demo benchmark catalog', 'Standard townhouse construction benchmark.', '2026.1', true),
  ('new_build', 'townhouse', 'premium', 'NCR', 35000, 43000, 51000, 12, 18, 12, 'Demo benchmark catalog', 'Premium townhouse construction benchmark.', '2026.1', true),
  ('renovation', 'one_storey', 'basic', 'NCR', 11000, 14000, 17500, 12, 15, 12, 'Demo benchmark catalog', 'Basic one-storey renovation benchmark.', '2026.1', true),
  ('renovation', 'one_storey', 'standard', 'NCR', 14000, 18000, 22000, 12, 15, 12, 'Demo benchmark catalog', 'Standard one-storey renovation benchmark.', '2026.1', true),
  ('renovation', 'one_storey', 'premium', 'NCR', 20000, 26000, 32000, 15, 18, 12, 'Demo benchmark catalog', 'Premium one-storey renovation benchmark.', '2026.1', true),
  ('renovation', 'two_storey', 'basic', 'NCR', 14000, 18000, 22000, 12, 15, 12, 'Demo benchmark catalog', 'Basic two-storey renovation benchmark.', '2026.1', true),
  ('renovation', 'two_storey', 'standard', 'NCR', 17000, 21500, 26000, 15, 15, 12, 'Demo benchmark catalog', 'Standard two-storey renovation benchmark.', '2026.1', true),
  ('renovation', 'two_storey', 'premium', 'NCR', 25000, 32000, 39000, 15, 18, 12, 'Demo benchmark catalog', 'Premium two-storey renovation benchmark.', '2026.1', true),
  ('extension', 'one_storey', 'basic', 'NCR', 18000, 22000, 27000, 10, 15, 12, 'Demo benchmark catalog', 'Basic one-storey extension benchmark.', '2026.1', true),
  ('extension', 'one_storey', 'standard', 'NCR', 22000, 27000, 32000, 10, 15, 12, 'Demo benchmark catalog', 'Standard one-storey extension benchmark.', '2026.1', true),
  ('extension', 'one_storey', 'premium', 'NCR', 30000, 37000, 45000, 12, 18, 12, 'Demo benchmark catalog', 'Premium one-storey extension benchmark.', '2026.1', true),
  ('extension', 'two_storey', 'basic', 'NCR', 22000, 27000, 32000, 12, 15, 12, 'Demo benchmark catalog', 'Basic two-storey extension benchmark.', '2026.1', true),
  ('extension', 'two_storey', 'standard', 'NCR', 26000, 31500, 37000, 12, 15, 12, 'Demo benchmark catalog', 'Standard two-storey extension benchmark.', '2026.1', true),
  ('extension', 'two_storey', 'premium', 'NCR', 35000, 43000, 51000, 15, 18, 12, 'Demo benchmark catalog', 'Premium two-storey extension benchmark.', '2026.1', true)
on conflict (project_type, house_type, finish_level, region, version) do update
set
  rate_low = excluded.rate_low,
  rate_base = excluded.rate_base,
  rate_high = excluded.rate_high,
  contingency_pct = excluded.contingency_pct,
  contractor_overhead_profit_pct = excluded.contractor_overhead_profit_pct,
  vat_pct = excluded.vat_pct,
  source = excluded.source,
  source_notes = excluded.source_notes,
  is_active = true,
  updated_at = now();
