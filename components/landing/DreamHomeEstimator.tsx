'use client';

import React from 'react';
import { ArrowRight, Calculator, LoaderCircle } from 'lucide-react';
import {
  calculatePreliminaryEstimateFromSupabase,
  type ComprehensiveEstimateResult,
} from '@/lib/utils/estimator';
import { formatCurrency } from '@/lib/utils/formatters';
import { getRegionCodeForProvince } from '@/lib/utils/philippines';
import type { FinishLevel, HouseType, WorkType } from '@/types/database';

type EstimateInput = {
  workType: WorkType;
  houseType: HouseType;
  finishLevel: FinishLevel;
  floorArea: number;
  floors: number;
  province: string;
};

type EstimateTotals = {
  direct: number;
  overhead: number;
  contingency: number;
  vat: number;
  total: number;
};

const locations = [
  { value: 'Metro Manila', label: 'Metro Manila (NCR)' },
  { value: 'Cavite', label: 'Cavite' },
  { value: 'Laguna', label: 'Laguna' },
  { value: 'Rizal', label: 'Rizal' },
  { value: 'Bulacan', label: 'Bulacan' },
  { value: 'Cebu', label: 'Cebu' },
  { value: 'Davao del Sur', label: 'Davao del Sur' },
  { value: 'Other Province', label: 'Other province' },
];

function getTotals(direct: number, estimate: ComprehensiveEstimateResult): EstimateTotals {
  const overhead = Math.round(direct * estimate.overheadProfitPct / 100);
  const contingency = Math.round(direct * estimate.contingencyPct / 100);
  const vat = Math.round((direct + overhead) * estimate.vatPct / 100);

  return {
    direct,
    overhead,
    contingency,
    vat,
    total: direct + overhead + contingency + vat,
  };
}

function getFinishOptions(workType: WorkType, houseType: HouseType): { value: FinishLevel; label: string }[] {
  if (workType === 'extension') return [{ value: 'standard', label: 'Standard' }];
  if (workType === 'renovation') {
    return houseType === 'one_storey'
      ? [{ value: 'basic', label: 'Basic' }]
      : [
          { value: 'standard', label: 'Standard' },
          { value: 'premium', label: 'Premium' },
        ];
  }
  return [
    { value: 'basic', label: 'Basic' },
    { value: 'standard', label: 'Standard' },
    { value: 'premium', label: 'Premium' },
  ];
}

export default function DreamHomeEstimator() {
  const [workType, setWorkType] = React.useState<WorkType>('new_build');
  const [houseType, setHouseType] = React.useState<HouseType>('two_storey');
  const [finishLevel, setFinishLevel] = React.useState<FinishLevel>('standard');
  const [floorArea, setFloorArea] = React.useState('');
  const [province, setProvince] = React.useState('Metro Manila');
  const [estimate, setEstimate] = React.useState<ComprehensiveEstimateResult | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const finishOptions = getFinishOptions(workType, houseType);
  const floors = houseType === 'one_storey' ? 1 : 2;

  const handleWorkTypeChange = (nextWorkType: WorkType) => {
    setWorkType(nextWorkType);
    if (nextWorkType !== 'new_build' && houseType === 'townhouse') {
      setHouseType('one_storey');
    }
    if (nextWorkType === 'extension') {
      setFinishLevel('standard');
    } else if (nextWorkType === 'renovation') {
      setFinishLevel(houseType === 'one_storey' || houseType === 'townhouse' ? 'basic' : 'standard');
    }
    setEstimate(null);
    setError('');
  };

  const handleHouseTypeChange = (nextHouseType: HouseType) => {
    setHouseType(nextHouseType);
    if (workType === 'extension') {
      setFinishLevel('standard');
    } else if (workType === 'renovation') {
      setFinishLevel(nextHouseType === 'one_storey' ? 'basic' : 'standard');
    }
    setEstimate(null);
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const area = Number(floorArea);
    if (!Number.isFinite(area) || area < 20 || area > 1500) {
      setEstimate(null);
      setError('Enter a floor area between 20 and 1,500 sq.m.');
      return;
    }

    setLoading(true);
    setError('');
    setEstimate(null);

    const input: EstimateInput = {
      workType,
      houseType,
      finishLevel,
      floorArea: area,
      floors,
      province,
    };

    try {
      const result = await calculatePreliminaryEstimateFromSupabase({
        projectType: input.workType,
        houseType: input.houseType,
        finishLevel: input.finishLevel,
        floorArea: input.floorArea,
        floors: input.floors,
        region: getRegionCodeForProvince(input.province),
        city: '',
      });
      setEstimate(result);
    } catch (estimateError) {
      setError(estimateError instanceof Error ? estimateError.message : 'The estimate could not be calculated. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const lowTotals = estimate ? getTotals(estimate.costLow, estimate) : null;
  const baseTotals = estimate ? getTotals(estimate.directCost, estimate) : null;
  const highTotals = estimate ? getTotals(estimate.costHigh, estimate) : null;
  const breakdown = baseTotals
    ? [
        { label: 'Direct construction cost', value: baseTotals.direct, detail: 'Benchmark cost for the selected home and floor area' },
        { label: 'Contractor overhead & profit', value: baseTotals.overhead, detail: `${estimate?.overheadProfitPct}% of direct construction cost` },
        { label: 'Contingency', value: baseTotals.contingency, detail: `${estimate?.contingencyPct}% provision for unforeseen costs` },
        { label: 'VAT', value: baseTotals.vat, detail: `${estimate?.vatPct}% applied to construction cost and overhead` },
      ]
    : [];

  return (
    <section id="estimate" className="bg-[#edf2ee] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px] rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_40px_rgba(15,23,42,0.05)] md:p-8 lg:p-10">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#136F48]">Dream home estimator</p>
          <h2 className="mt-2 text-[2.3rem] font-extrabold leading-tight tracking-[-0.06em] text-slate-900">
            Plan your home and see the estimated cost
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Choose the kind of project you have in mind, enter your floor area, and calculate an estimate with its cost breakdown. No account is needed.
          </p>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-[#f8faf8] p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                Project type
                <select
                  value={workType}
                  onChange={(event) => handleWorkTypeChange(event.target.value as WorkType)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-800"
                >
                  {workTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                House type
                <select
                  value={houseType}
                  onChange={(event) => handleHouseTypeChange(event.target.value as HouseType)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-800"
                >
                  <option value="one_storey">Single-storey</option>
                  <option value="two_storey">Two-storey</option>
                  {workType === 'new_build' && <option value="townhouse">Townhouse</option>}
                </select>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Finish level
                <select
                  value={finishLevel}
                  onChange={(event) => {
                    setFinishLevel(event.target.value as FinishLevel);
                    setEstimate(null);
                    setError('');
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-800"
                >
                  {finishOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Province / region
                <select
                  value={province}
                  onChange={(event) => {
                    setProvince(event.target.value);
                    setEstimate(null);
                    setError('');
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-800"
                >
                  {locations.map((location) => (
                    <option key={location.value} value={location.value}>{location.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm font-semibold text-slate-700">
              Total floor area (sq.m)
              <input
                type="number"
                min={20}
                max={1500}
                step={1}
                required
                value={floorArea}
                onChange={(event) => {
                  setFloorArea(event.target.value);
                  setEstimate(null);
                  setError('');
                }}
                placeholder="For example, 120"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-800"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                {floors === 2 ? 'Enter the combined floor area across both levels.' : 'Enter the total area you plan to build or renovate.'}
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#136F48] px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#0f5a3b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              {loading ? 'Calculating estimate…' : 'Calculate my estimate'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div aria-live="polite" className="min-h-[300px] rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            {estimate && lowTotals && baseTotals && highTotals ? (
              <>
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Estimated total</p>
                    <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#136F48] sm:text-4xl">{formatCurrency(baseTotals.total)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Estimated range: {formatCurrency(lowTotals.total)} – {formatCurrency(highTotals.total)}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-emerald-800">
                    {estimate.confidenceLevel} estimate
                  </span>
                </div>

                <h3 className="mt-5 text-sm font-bold text-slate-900">Estimated cost breakdown</h3>
                <div className="mt-3 divide-y divide-slate-100">
                  {breakdown.map((item) => (
                    <div key={item.label} className="flex items-start justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-slate-900">{formatCurrency(item.value)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  Benchmark: {estimate.benchmarkSource} ({estimate.benchmarkVersion}). This is a preliminary estimate; final pricing depends on plans, materials, site conditions, and contractor quotes.
                </p>
              </>
            ) : error ? (
              <div role="alert" className="flex min-h-[250px] items-center justify-center text-center text-sm font-medium leading-relaxed text-rose-700">
                {error}
              </div>
            ) : (
              <div className="flex min-h-[250px] flex-col items-center justify-center text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-[#136F48]">
                  <Calculator className="h-6 w-6" />
                </span>
                <p className="mt-4 font-bold text-slate-800">Your estimate will appear here</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                  Add your project details and floor area to see the estimated total, range, and cost breakdown.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Note: This is only an estimate based on active construction benchmarks or, when a matching rate is unavailable, the built-in baseline catalog. It is not a contractor quote or final project cost.
        </p>
      </div>
    </section>
  );
}

const workTypeOptions: { value: WorkType; label: string }[] = [
  { value: 'new_build', label: 'New build' },
  { value: 'renovation', label: 'Renovation' },
  { value: 'extension', label: 'Extension' },
];
