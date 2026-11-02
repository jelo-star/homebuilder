import { createClient } from '@/lib/supabase/client';
import {
  ConstructionBenchmark,
  FinishLevel,
  HouseType,
  EstimateLevel,
  EstimateWorkCategory,
  WorkType,
} from '@/types/database';
import { getRegionCodeForProvince } from './philippines';

const FALLBACK_BENCHMARKS: Pick<
  ConstructionBenchmark,
  | 'project_type'
  | 'house_type'
  | 'finish_level'
  | 'rate_low'
  | 'rate_base'
  | 'rate_high'
  | 'contingency_pct'
  | 'contractor_overhead_profit_pct'
  | 'vat_pct'
  | 'source_notes'
>[] = [
  { project_type: 'new_build', house_type: 'one_storey', finish_level: 'basic', rate_low: 21000, rate_base: 24000, rate_high: 27500, contingency_pct: 8, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Basic one-storey construction baseline.' },
  { project_type: 'new_build', house_type: 'one_storey', finish_level: 'standard', rate_low: 26000, rate_base: 31000, rate_high: 36000, contingency_pct: 10, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Standard one-storey construction baseline.' },
  { project_type: 'new_build', house_type: 'one_storey', finish_level: 'premium', rate_low: 36000, rate_base: 44000, rate_high: 52000, contingency_pct: 12, contractor_overhead_profit_pct: 18, vat_pct: 12, source_notes: 'Premium one-storey construction baseline.' },
  { project_type: 'new_build', house_type: 'two_storey', finish_level: 'basic', rate_low: 23000, rate_base: 26500, rate_high: 30500, contingency_pct: 8, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Basic two-storey construction baseline.' },
  { project_type: 'new_build', house_type: 'two_storey', finish_level: 'standard', rate_low: 28500, rate_base: 34500, rate_high: 40000, contingency_pct: 10, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Standard two-storey construction baseline.' },
  { project_type: 'new_build', house_type: 'two_storey', finish_level: 'premium', rate_low: 40000, rate_base: 49000, rate_high: 58000, contingency_pct: 12, contractor_overhead_profit_pct: 18, vat_pct: 12, source_notes: 'Premium two-storey construction baseline.' },
  { project_type: 'new_build', house_type: 'townhouse', finish_level: 'basic', rate_low: 20500, rate_base: 23500, rate_high: 27000, contingency_pct: 8, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Basic townhouse construction baseline.' },
  { project_type: 'new_build', house_type: 'townhouse', finish_level: 'standard', rate_low: 25500, rate_base: 30000, rate_high: 35000, contingency_pct: 10, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Standard townhouse construction baseline.' },
  { project_type: 'new_build', house_type: 'townhouse', finish_level: 'premium', rate_low: 35000, rate_base: 43000, rate_high: 51000, contingency_pct: 12, contractor_overhead_profit_pct: 18, vat_pct: 12, source_notes: 'Premium townhouse construction baseline.' },
  { project_type: 'renovation', house_type: 'one_storey', finish_level: 'basic', rate_low: 11000, rate_base: 14000, rate_high: 17500, contingency_pct: 12, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Basic one-storey renovation baseline.' },
  { project_type: 'renovation', house_type: 'one_storey', finish_level: 'standard', rate_low: 14000, rate_base: 18000, rate_high: 22000, contingency_pct: 12, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Standard one-storey renovation baseline.' },
  { project_type: 'renovation', house_type: 'one_storey', finish_level: 'premium', rate_low: 20000, rate_base: 26000, rate_high: 32000, contingency_pct: 15, contractor_overhead_profit_pct: 18, vat_pct: 12, source_notes: 'Premium one-storey renovation baseline.' },
  { project_type: 'renovation', house_type: 'two_storey', finish_level: 'basic', rate_low: 14000, rate_base: 18000, rate_high: 22000, contingency_pct: 12, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Basic two-storey renovation baseline.' },
  { project_type: 'renovation', house_type: 'two_storey', finish_level: 'standard', rate_low: 17000, rate_base: 21500, rate_high: 26000, contingency_pct: 15, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Standard two-storey renovation baseline.' },
  { project_type: 'renovation', house_type: 'two_storey', finish_level: 'premium', rate_low: 25000, rate_base: 32000, rate_high: 39000, contingency_pct: 15, contractor_overhead_profit_pct: 18, vat_pct: 12, source_notes: 'Premium two-storey renovation baseline.' },
  { project_type: 'extension', house_type: 'one_storey', finish_level: 'basic', rate_low: 18000, rate_base: 22000, rate_high: 27000, contingency_pct: 10, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Basic one-storey extension baseline.' },
  { project_type: 'extension', house_type: 'one_storey', finish_level: 'standard', rate_low: 22000, rate_base: 27000, rate_high: 32000, contingency_pct: 10, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Standard one-storey extension baseline.' },
  { project_type: 'extension', house_type: 'one_storey', finish_level: 'premium', rate_low: 30000, rate_base: 37000, rate_high: 45000, contingency_pct: 12, contractor_overhead_profit_pct: 18, vat_pct: 12, source_notes: 'Premium one-storey extension baseline.' },
  { project_type: 'extension', house_type: 'two_storey', finish_level: 'basic', rate_low: 22000, rate_base: 27000, rate_high: 32000, contingency_pct: 12, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Basic two-storey extension baseline.' },
  { project_type: 'extension', house_type: 'two_storey', finish_level: 'standard', rate_low: 26000, rate_base: 31500, rate_high: 37000, contingency_pct: 12, contractor_overhead_profit_pct: 15, vat_pct: 12, source_notes: 'Standard two-storey extension baseline.' },
  { project_type: 'extension', house_type: 'two_storey', finish_level: 'premium', rate_low: 35000, rate_base: 43000, rate_high: 51000, contingency_pct: 15, contractor_overhead_profit_pct: 18, vat_pct: 12, source_notes: 'Premium two-storey extension baseline.' },
];

export interface PreliminaryEstimateInput {
  projectType: WorkType;
  houseType: HouseType;
  finishLevel: FinishLevel;
  floorArea: number;
  floors: number;
  region: string;
  city: string;
  existingFloorArea?: number;
  additionalFloorArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  structuralSystem?: string;
  siteCondition?: string;
  roofingType?: string;
  scopeItems?: Array<{ name: string; status: 'included' | 'excluded' | 'undecided' }>;
  renovationScope?: {
    rooms?: string[];
    affectedArea?: number;
    requiresDemolition?: boolean;
    retainStructural?: boolean;
    retainElectrical?: boolean;
    retainPlumbing?: boolean;
    knownDefects?: string;
  };
  extensionScope?: {
    existingArea?: number;
    proposedArea?: number;
    reuseFoundations?: boolean;
    reuseUtilities?: boolean;
    structuralAssessmentAvailable?: boolean;
  };
}

export interface DetailedEstimateLineItem {
  category: EstimateWorkCategory;
  categoryLabel: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  unitRate: number;
  amount: number;
  spec?: string;
  source?: string;
}

export interface CategoryBreakdownItem {
  id: string;
  name: string;
  description: string;
  amount: number;
  percent: number;
  type: 'calculated' | 'benchmark' | 'provisional';
}

export interface ComprehensiveEstimateResult {
  confidenceLevel: EstimateLevel;
  directCost: number;
  contractorOverheadProfit: number;
  overheadProfitPct: number;
  vat: number;
  vatPct: number;
  contingency: number;
  contingencyPct: number;
  costLow: number;
  costBase: number;
  costHigh: number;
  ratePerSqmBase: number;
  ratePerSqmLow: number;
  ratePerSqmHigh: number;
  includedScope: string[];
  excludedScope: string[];
  assumptions: string[];
  benchmarkSource: string;
  benchmarkVersion: string;
  tradeBreakdown: {
    name: string;
    amount: number;
    percent: number;
  }[];
  categoryBreakdown: CategoryBreakdownItem[];
  detailedItems?: DetailedEstimateLineItem[];
}

async function loadBenchmark(input: PreliminaryEstimateInput): Promise<ConstructionBenchmark> {
  const supabase = createClient();
  const regions = input.region === 'NCR' ? ['NCR'] : [input.region, 'NCR'];

  for (const region of regions) {
    const { data, error } = await supabase
      .from('construction_benchmarks')
      .select('*')
      .eq('project_type', input.projectType)
      .eq('house_type', input.houseType)
      .eq('finish_level', input.finishLevel)
      .eq('region', region)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load construction benchmark: ${error.message}`);
    }

    if (data) return data as ConstructionBenchmark;
  }

  const fallback = FALLBACK_BENCHMARKS.find((benchmark) =>
    benchmark.project_type === input.projectType
    && benchmark.house_type === input.houseType
    && benchmark.finish_level === input.finishLevel
  );

  if (fallback) {
    const now = new Date().toISOString();
    return {
      ...fallback,
      id: `baseline-${fallback.project_type}-${fallback.house_type}-${fallback.finish_level}`,
      region: 'NCR',
      source: 'Built-in baseline catalog',
      version: '2026.1',
      effective_from: now,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
  }

  throw new Error(`No benchmark is available for ${input.projectType}, ${input.houseType}, ${input.finishLevel}.`);
}

export async function calculatePreliminaryEstimateFromSupabase(
  input: PreliminaryEstimateInput
): Promise<ComprehensiveEstimateResult> {
  const benchmark = await loadBenchmark(input);
  return calculatePreliminaryEstimate(input, benchmark);
}

export function calculatePreliminaryEstimate(
  input: PreliminaryEstimateInput,
  benchmark: ConstructionBenchmark
): ComprehensiveEstimateResult {
  const {
    projectType,
    floorArea,
    floors,
    siteCondition,
    roofingType,
    extensionScope,
    scopeItems,
  } = input;

  const floorMultiplier = floors > 2 ? 1 + 0.05 * (floors - 2) : 1;
  const siteMultiplier =
    siteCondition === 'sloping_lot' || siteCondition === 'retaining_walls_required'
      ? 1.08
      : siteCondition === 'filling_excavation_required'
        ? 1.04
        : 1;
  const roofMultiplier =
    roofingType === 'concrete_deck' ? 1.06 : roofingType === 'roof_tiles' ? 1.04 : 1;
  const multiplier = floorMultiplier * siteMultiplier * roofMultiplier;
  const ratePerSqmBase = Math.round(Number(benchmark.rate_base) * multiplier);
  const ratePerSqmLow = Math.round(Number(benchmark.rate_low) * multiplier);
  const ratePerSqmHigh = Math.round(Number(benchmark.rate_high) * multiplier);

  const directCost = Math.round(floorArea * ratePerSqmBase);
  const costLow = Math.round(floorArea * ratePerSqmLow);
  let costHigh = Math.round(floorArea * ratePerSqmHigh);

  if (projectType === 'extension' && extensionScope?.structuralAssessmentAvailable === false) {
    costHigh = Math.round(costHigh * 1.08);
  }

  const confidenceLevel: EstimateLevel =
    siteCondition && roofingType && (scopeItems?.length ?? 0) > 0 ? 'refined' : 'preliminary';
  const overheadProfitPct = Number(benchmark.contractor_overhead_profit_pct);
  const contingencyPct =
    Number(benchmark.contingency_pct) + (siteCondition === 'sloping_lot' ? 3 : 0);
  const vatPct = Number(benchmark.vat_pct);
  const contractorOverheadProfit = Math.round((directCost * overheadProfitPct) / 100);
  const contingency = Math.round((directCost * contingencyPct) / 100);
  const vat = Math.round(((directCost + contractorOverheadProfit) * vatPct) / 100);

  const includedScope = (input.scopeItems ?? [])
    .filter((item) => item.status === 'included')
    .map((item) => item.name);
  const excludedScope = (input.scopeItems ?? [])
    .filter((item) => item.status === 'excluded')
    .map((item) => item.name);
  const assumptions = [
    benchmark.source === 'Built-in baseline catalog'
      ? 'No matching active database rate was available. This estimate uses the built-in NCR baseline as a fallback.'
      : `Estimate based on the ${benchmark.region} benchmark rate configured in Supabase.`,
    benchmark.source_notes,
  ].filter((assumption): assumption is string => Boolean(assumption));

  const categoryBreakdown: CategoryBreakdownItem[] = [
    {
      id: 'direct_cost',
      name: 'Direct construction cost',
      description: 'Calculated from the selected active construction benchmark.',
      amount: directCost,
      percent: 100,
      type: 'benchmark',
    },
  ];

  return {
    confidenceLevel,
    directCost,
    contractorOverheadProfit,
    overheadProfitPct,
    vat,
    vatPct,
    contingency,
    contingencyPct,
    costLow,
    costBase: directCost,
    costHigh,
    ratePerSqmBase,
    ratePerSqmLow,
    ratePerSqmHigh,
    includedScope,
    excludedScope,
    assumptions,
    benchmarkSource: benchmark.source,
    benchmarkVersion: benchmark.version,
    tradeBreakdown: [],
    categoryBreakdown,
  };
}

export async function calculateEstimate(
  floorArea: number,
  floors: number,
  finishLevel: FinishLevel,
  workType: WorkType,
  _ratePerSqm?: number,
  regionOrProvince?: string
) {
  const region = regionOrProvince ? getRegionCodeForProvince(regionOrProvince) : 'NCR';
  const result = await calculatePreliminaryEstimateFromSupabase({
    projectType: workType,
    houseType: floors > 1 ? 'two_storey' : 'one_storey',
    finishLevel,
    floorArea,
    floors,
    region,
    city: '',
  });

  return {
    low: result.costLow,
    mid: result.costBase,
    high: result.costHigh,
    ratePerSqm: result.ratePerSqmBase,
    breakdown: result.tradeBreakdown,
  };
}

export function checkBudgetStatus(
  budget: number | null | undefined,
  low: number,
  high: number
): 'fits' | 'close' | 'above_budget' | 'not_set' {
  if (!budget || budget <= 0) return 'not_set';
  if (budget >= high) return 'fits';
  if (budget >= low) return 'close';
  return 'above_budget';
}
