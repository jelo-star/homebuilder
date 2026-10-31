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

  throw new Error(
    `No active construction benchmark is configured for ${input.projectType}, ${input.houseType}, ${input.finishLevel} in ${input.region}.`
  );
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
    `Estimate based on the ${benchmark.region} benchmark rate configured in Supabase.`,
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
