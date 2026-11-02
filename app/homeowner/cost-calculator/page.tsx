'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Building2, 
  CheckCircle2, 
  Info, 
  FileText,
  Bookmark,
  Sparkles,
  Sliders,
  ChevronDown,
  ChevronUp,
  Home,
} from 'lucide-react';
import { 
  checkBudgetStatus,
  ComprehensiveEstimateResult
} from '@/lib/utils/estimator';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils/formatters';
import { FinishLevel, WorkType, HouseType } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import { calculatePreliminaryEstimateFromSupabase } from '@/lib/utils/estimator';
import { getRegionCodeForProvince } from '@/lib/utils/philippines';
import { useRouter } from 'next/navigation';

export default function CostCalculatorPage() {
  const router = useRouter();

  // Input parameters matching the visual reference design
  const [workType, setWorkType] = React.useState<WorkType>('new_build');
  const [houseType, setHouseType] = React.useState<HouseType>('one_storey');
  const [finishLevel, setFinishLevel] = React.useState<FinishLevel>('standard');
  const [floorArea, setFloorArea] = React.useState(0);
  const [floors, setFloors] = React.useState(1);
  const [useMultiStoreyHelper, setUseMultiStoreyHelper] = React.useState(false);
  const [groundFloorArea, setGroundFloorArea] = React.useState(0);
  const [secondFloorArea, setSecondFloorArea] = React.useState(0);

  const [province, setProvince] = React.useState('Metro Manila');
  const [city, setCity] = React.useState('');
  const [userBudget, setUserBudget] = React.useState('');
  const [paymentTranches] = React.useState<number>(3);

  // Expandable Category Breakdown Accordion
  const [expandedCategories, setExpandedCategories] = React.useState<Record<string, boolean>>({
    'cat_structural': true,
  });

  const [savingEstimate, setSavingEstimate] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState('');
  const [platformCommissionPercent, setPlatformCommissionPercent] = React.useState<number | null>(null);
  const [commissionLoadError, setCommissionLoadError] = React.useState('');

  React.useEffect(() => {
    if (!publishError) return;
    const t = setTimeout(() => setPublishError(''), 4000);
    return () => clearTimeout(t);
  }, [publishError]);

  React.useEffect(() => {
    let active = true;
    createClient()
      .rpc('get_current_platform_commission_percent')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setCommissionLoadError(`Platform commission is unavailable. Apply Supabase migration 75, then reload. ${error.message}`);
          return;
        }
        const commissionPercent = Number(data);
        if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
          setCommissionLoadError('The configured platform commission is invalid. Contact an administrator.');
          return;
        }
        setPlatformCommissionPercent(commissionPercent);
      });

    return () => { active = false; };
  }, []);

  const estimateInput = React.useMemo(() => ({
    projectType: workType,
    houseType,
    finishLevel,
    floorArea,
    floors,
    region: getRegionCodeForProvince(province),
    city: '',
  }), [workType, houseType, finishLevel, floorArea, floors, province]);
  const estimateKey = JSON.stringify(estimateInput);
  const hasValidFloorArea = Number.isFinite(floorArea) && floorArea >= 20 && floorArea <= 1500;
  const [estimateOutcome, setEstimateOutcome] = React.useState<{
    key: string;
    result: ComprehensiveEstimateResult | null;
    error: string;
  } | null>(null);
  const estimateResult = estimateOutcome?.key === estimateKey ? estimateOutcome.result : null;
  const estimateError = !hasValidFloorArea && floorArea !== 0
    ? 'Enter a total floor area between 20 and 1,500 sq.m.'
    : estimateOutcome?.key === estimateKey
      ? estimateOutcome.error
      : '';
  const estimateLoading = Boolean(
    hasValidFloorArea && floors && province && estimateOutcome?.key !== estimateKey,
  );

  React.useEffect(() => {
    if (!hasValidFloorArea || !estimateInput.floors || !province) return;

    let active = true;
    calculatePreliminaryEstimateFromSupabase(estimateInput)
      .then(result => {
        if (active) setEstimateOutcome({ key: estimateKey, result, error: '' });
      })
      .catch(error => {
        if (active) {
          setEstimateOutcome({
            key: estimateKey,
            result: null,
            error: error instanceof Error ? error.message : 'No active database benchmark is available.',
          });
        }
      });

    return () => { active = false; };
  }, [estimateInput, estimateKey, hasValidFloorArea, province]);

  const budgetAnalysis = React.useMemo(() => {
    if (!estimateResult) return null;
    return checkBudgetStatus(parseNumberInput(userBudget) || null, estimateResult.costLow, estimateResult.costHigh);
  }, [userBudget, estimateResult]);

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveEstimate = async () => {
    setSavingEstimate(true);
    try {
      if (!estimateResult) throw new Error(estimateError || 'An active database benchmark is required to save this estimate.');
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to save estimates.');

      const { error } = await supabase.from('saved_estimates').insert({
          homeowner_id: user.id,
          estimate_level: estimateResult.confidenceLevel,
          title: `${finishLevel === 'basic' ? 'Low-Cost / Basic' : finishLevel === 'standard' ? 'Mid-Range' : 'High-End'} ${houseType === 'two_storey' ? '2-Storey' : 'Single Storey'} (${floorArea} sqm)`,
          work_type: workType,
          house_type: houseType,
          finish_level: finishLevel,
          region: province,
          city,
          floor_area_sqm: floorArea,
          floors,
          cost_low: estimateResult.costLow,
          cost_base: estimateResult.costBase,
          cost_high: estimateResult.costHigh,
          direct_cost: estimateResult.directCost,
          overhead_profit_amt: estimateResult.contractorOverheadProfit,
          vat_amt: estimateResult.vat,
          contingency_amt: estimateResult.contingency,
          rate_per_sqm_base: estimateResult.ratePerSqmBase,
          line_items: estimateResult.categoryBreakdown,
          assumptions: estimateResult.assumptions,
          exclusions: estimateResult.excludedScope,
          rate_version: estimateResult.benchmarkVersion,
          rate_source: estimateResult.benchmarkSource,
        });
      if (error) throw error;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Failed to save estimate.');
    } finally {
      setSavingEstimate(false);
    }
  };

  const handleDirectPublish = async () => {
    setPublishing(true);
    setPublishError('');

    try {
      if (!estimateResult) throw new Error(estimateError || 'An active database benchmark is required to publish this project.');
      if (platformCommissionPercent == null) {
        throw new Error(commissionLoadError || 'The platform commission could not be verified. Reload the page before creating this project.');
      }
      if (!floorArea || !floors || !province || !city.trim()) {
        throw new Error('Enter a floor area, number of floors, province, and city before publishing.');
      }
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to publish a project.');

      const projectTitle = `${finishLevel === 'basic' ? 'Basic' : finishLevel === 'standard' ? 'Standard' : 'Premium'} ${houseType === 'two_storey' ? '2-Storey' : 'Single Storey'} ${workType.replace('_', ' ')} (${floorArea} sqm)`;

      const projectPayload = {
        homeowner_id: user.id,
        title: projectTitle,
        house_type: houseType,
        work_type: workType,
        finish_level: finishLevel,
        floor_area_sqm: Number(floorArea),
        floors: Number(floors),
        province,
        city: city.trim(),
        budget: parseNumberInput(userBudget) || null,
        desired_start: 'in_2_months' as const,
        payment_tranches: paymentTranches,
        est_low: estimateResult.costLow,
        est_mid: estimateResult.costBase,
        est_high: estimateResult.costHigh,
        estimate_confidence: estimateResult.confidenceLevel,
        estimate_breakdown: {
          direct_cost: estimateResult.directCost,
          overhead_profit: estimateResult.contractorOverheadProfit,
          vat: estimateResult.vat,
          contingency: estimateResult.contingency,
          trades: estimateResult.categoryBreakdown,
        },
        status: 'open' as const,
      };

      const { data: newProj, error: insertError } = await supabase
        .from('projects')
        .insert(projectPayload)
        .select()
        .single();
      if (insertError) throw insertError;
      if (!newProj) throw new Error('Project was not returned after saving.');

      // Auto-match approved active contractors
      if (newProj) {
        const { data: contractors } = await supabase
          .from('contractor_profiles')
          .select('*, profiles(*)')
          .eq('verification_status', 'approved')
          .eq('is_active', true);

        if (contractors && contractors.length > 0) {
          const { calculateMatchScore } = await import('@/lib/utils/matching');
          for (const c of contractors) {
            const match = calculateMatchScore(newProj, c);
            if (match.score > 0) {
              await supabase.from('project_matches').insert({
                project_id: newProj.id,
                contractor_id: c.profile_id,
                match_score: match.score,
                reasons: match.reasons,
              });
            }
          }
        }
      }

      router.push(`/homeowner/projects/${newProj.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish project';
      setPublishError(msg);
      setPublishing(false);
    }
  };

  return (
    <AppLayout
      userRole="homeowner"
      userName="Homeowner"
      title="Philippine Construction Cost Calculator"
      subtitle="Simple, transparent preliminary construction budget estimates for homeowners"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        
        {/* --- INTRODUCTION SECTION --- */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs">
          <div className="max-w-3xl space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-blue-600" />
              Planning to build a house?
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Before contacting contractors, get an initial construction cost estimate. Enter your floor area, select your house type and finish level, and see an estimated budget with a breakdown of the major construction categories.
            </p>
            <p className="text-xs text-slate-400">
              Use this estimate as a starting point for planning. The actual cost will depend on your architectural plans, detailed material specifications, site conditions, and official contractor quotations.
            </p>
          </div>
        </div>

        {(saveSuccess || publishError) && (
          <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200 space-y-2">
            {saveSuccess && (
              <div className="p-4 rounded-xl bg-white border border-emerald-200 shadow-xl text-emerald-800 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="font-semibold leading-relaxed">
                    Your construction cost estimate has been saved to your account! You can reference it when publishing your project.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSaveSuccess(false)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
                >
                  ?
                </button>
              </div>
            )}
            {publishError && (
              <div className="p-4 rounded-xl bg-white border border-red-200 shadow-xl text-red-700 flex items-start justify-between gap-3 text-xs">
                <div className="font-semibold leading-relaxed">{publishError}</div>
                <button
                  type="button"
                  onClick={() => setPublishError('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
                >
                  ?
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- MAIN INTERFACE: INPUTS & ESTIMATED TOTAL CARD --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Inputs Section (7 Columns) */}
          <div className="lg:col-span-7 bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" />
              Step 1: Your Project Details
            </h2>

            {/* A. Floor Area Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-900">
                  Total Floor Area (sq.m) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setUseMultiStoreyHelper(!useMultiStoreyHelper)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  {useMultiStoreyHelper ? 'Enter single total area' : '+ Enter per-floor area for multi-storey'}
                </button>
              </div>

              {useMultiStoreyHelper && floors >= 2 ? (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Ground Floor (sq.m)</span>
                    <input
                      type="number"
                      min="10"
                      value={groundFloorArea}
                      onChange={(e) => {
                        const area = Number(e.target.value) || 0;
                        setGroundFloorArea(area);
                        setFloorArea(area + (Number(secondFloorArea) || 0));
                      }}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Second Floor (sq.m)</span>
                    <input
                      type="number"
                      min="10"
                      value={secondFloorArea}
                      onChange={(e) => {
                        const area = Number(e.target.value) || 0;
                        setSecondFloorArea(area);
                        setFloorArea((Number(groundFloorArea) || 0) + area);
                      }}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div className="col-span-2 text-xs font-semibold text-slate-700 text-right">
                    Total Combined Area: <strong className="text-blue-600">{floorArea} sq.m</strong>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="number"
                    min="20"
                    max="1500"
                    required
                    value={floorArea}
                    onChange={(e) => setFloorArea(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 120"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    For multi-storey houses, the total floor area is the combined sum of all floor levels.
                  </span>
                </div>
              )}
            </div>

            {/* B. House Type (Illustrated Reference Specification Cards) */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold text-slate-900">
                House Type & Specification Tier <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    key: 'basic',
                    title: 'Low-Cost / Basic',
                    range: 'Priced from active benchmarks',
                    icon: Home,
                    desc: 'Reinforced concrete foundation, 4" CHB walls, long-span metal roofing, ceramic tiles, plain paint, standard fixtures.',
                  },
                  {
                    key: 'standard',
                    title: 'Mid-Range / Standard',
                    range: 'Priced from active benchmarks',
                    icon: Building2,
                    desc: 'Ready-mix 3000 PSI concrete, 60x60 porcelain tiles, custom modular kitchen with synthetic granite, aluminum windows.',
                  },
                  {
                    key: 'premium',
                    title: 'High-End / Premium',
                    range: 'Priced from active benchmarks',
                    icon: Sparkles,
                    desc: 'Quartz countertops, solid hardwood doors, multi-point lock UPVC windows, multi-split AC provisions, smart lighting.',
                  },
                ].map((tier) => {
                  const Icon = tier.icon;
                  const isSelected = finishLevel === tier.key;

                  return (
                    <button
                      key={tier.key}
                      type="button"
                      onClick={() => setFinishLevel(tier.key as FinishLevel)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/20 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-slate-900">{tier.title}</div>
                      <div className="text-[11px] font-bold text-blue-600 mt-0.5">{tier.range}</div>
                      <div className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">{tier.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* C. Work Type */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-900">Work Scope Type</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'new_build', label: 'New Build', sub: 'Ground up construction' },
                  { id: 'renovation', label: 'Renovation', sub: 'Fixing or remodeling' },
                  { id: 'extension', label: 'House Extension', sub: 'Adding new floor or room' },
                ].map((wt) => (
                  <button
                    key={wt.id}
                    type="button"
                    onClick={() => setWorkType(wt.id as WorkType)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      workType === wt.id
                        ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-bold shadow-xs'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-semibold">{wt.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{wt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* D. Location & Storeys */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Province / Region</label>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Metro Manila">Metro Manila (NCR)</option>
                  <option value="Cavite">Cavite</option>
                  <option value="Laguna">Laguna</option>
                  <option value="Rizal">Rizal</option>
                  <option value="Bulacan">Bulacan</option>
                  <option value="Pampanga">Pampanga</option>
                  <option value="Cebu">Cebu</option>
                  <option value="Davao del Sur">Davao del Sur</option>
                  <option value="Other Province">Other Province</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">City / Municipality</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Quezon City"
                  className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Number of Floors</label>
                <select
                  value={floors}
                  onChange={(e) => {
                    const fl = Number(e.target.value);
                    setFloors(fl);
                    setHouseType(fl === 1 ? 'one_storey' : 'two_storey');
                  }}
                  className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>1 Floor (Bungalow)</option>
                  <option value={2}>2 Floors (Two-Storey)</option>
                  <option value={3}>3 Floors</option>
                </select>
              </div>
            </div>

            {/* Planned Budget (Optional) */}
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Your Planned Budget in PHP (Optional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={userBudget}
                onChange={(e) => setUserBudget(formatNumberInput(e.target.value))}
                placeholder="e.g. 3500000"
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

          </div>

          {/* --- 5. ESTIMATED TOTAL CARD (Right Column - 5 Columns) --- */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              {estimateResult ? (
                <>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Estimated Total Cost
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                      {estimateResult.confidenceLevel}
                    </span>
                  </div>

                  {/* Big Prominent Total */}
                  <div>
                <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                  {formatCurrency(estimateResult.costBase)}
                </div>
                <div className="text-xs font-semibold text-blue-600 mt-1">
                  Range: {formatCurrency(estimateResult.costLow)} – {formatCurrency(estimateResult.costHigh)}
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  Based on {floorArea} sq.m floor area, selected {finishLevel} tier, {city}, and applicable Philippine construction benchmarks.
                </p>
              </div>

              {/* Budget Feasibility Note */}
              {userBudget !== '' && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                  budgetAnalysis === 'fits'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : budgetAnalysis === 'close'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <div>
                    {budgetAnalysis === 'fits' && 'Your target budget fits comfortably within this estimate.'}
                    {budgetAnalysis === 'close' && 'Your target budget is close to baseline estimates.'}
                    {budgetAnalysis === 'above_budget' && 'Your budget is below standard rates for this floor area.'}
                  </div>
                </div>
              )}

              {/* Summary Stats Table */}
              <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Selected House Tier:</span>
                  <span className="font-semibold text-slate-900 capitalize">{finishLevel} ({houseType.replace('_', ' ')})</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Applied Rate:</span>
                  <span className="font-semibold text-slate-900">₱{estimateResult.ratePerSqmBase.toLocaleString()}/sq.m</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Applicable Pricing Range:</span>
                  <span className="text-slate-700">₱{estimateResult.ratePerSqmLow.toLocaleString()} – ₱{estimateResult.ratePerSqmHigh.toLocaleString()}/sq.m</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Benchmark Source:</span>
                  <span className="text-slate-600 truncate max-w-[200px]" title={estimateResult.benchmarkSource}>
                    {estimateResult.benchmarkSource} ({estimateResult.benchmarkVersion})
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs">
                <p className="font-bold text-emerald-900">HomeBuilder platform commission</p>
                {commissionLoadError ? (
                  <p role="alert" className="mt-1 text-rose-700">{commissionLoadError}</p>
                ) : platformCommissionPercent == null ? (
                  <p className="mt-1 text-slate-600">Loading the current commission rate…</p>
                ) : (
                  <p className="mt-1 leading-relaxed text-emerald-900">
                    Current rate: <strong>{platformCommissionPercent}%</strong>. It will be locked when you publish and added to the accepted contractor quote. The final peso amount is calculated after you select a proposal.
                  </p>
                )}
              </div>

                  {/* Primary Call to Action */}
                  <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleDirectPublish}
                  disabled={publishing || !estimateResult || platformCommissionPercent == null}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all hover:shadow disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{publishing ? 'Publishing & Matching Contractors...' : 'Publish Project & Match Contractors'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveEstimate}
                  disabled={savingEstimate || !estimateResult}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all disabled:opacity-50"
                >
                  <Bookmark className="w-4 h-4 text-blue-600" />
                  {savingEstimate ? 'Saving estimate...' : 'Save Estimate to Account'}
                </button>
              </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  {estimateLoading
                    ? 'Calculating your estimate…'
                    : estimateError
                      ? <p role="alert" className="text-rose-700">{estimateError}</p>
                      : 'Enter the floor area to calculate an estimate. Add your city later when you publish your project.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- 6. DETAILED COST BREAKDOWN (Expandable Reference-Style Categories) --- */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Detailed Cost Breakdown (Major Construction Categories)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Database-backed estimate breakdown
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Direct Total: <strong className="text-blue-600 font-bold">{estimateResult ? formatCurrency(estimateResult.directCost) : '—'}</strong>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {(estimateResult?.categoryBreakdown || []).map((cat, idx) => {
              const isExpanded = Boolean(expandedCategories[cat.id]);

              return (
                <div key={cat.id} className="hover:bg-slate-50/60 transition-colors">
                  <div 
                    onClick={() => toggleCategory(cat.id)}
                    className="p-4 sm:p-5 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{cat.name}</div>
                        <div className="text-[11px] text-slate-500 hidden sm:block">{cat.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right shrink-0">
                      <div>
                        <div className="text-xs font-bold text-slate-900">{formatCurrency(cat.amount)}</div>
                        <div className="text-[10px] text-slate-400">{cat.percent}% of budget</div>
                      </div>
                      <div className="text-slate-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 text-xs text-slate-600 bg-slate-50/50 border-t border-slate-100/80">
                      <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                        <div className="font-semibold text-slate-800">Scope description:</div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{cat.description}</p>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-100 mt-2">
                          <span>Calculation: Benchmark category distribution</span>
                          <span>Share: {cat.percent}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!estimateResult && (
              <div className="p-8 text-center text-xs text-slate-500">
                {estimateError || 'No database-backed estimate is available for the selected project details.'}
              </div>
            )}
          </div>
        </div>

        {/* --- 7. DISCLAIMER AND EXPLANATION --- */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3.5 text-xs text-slate-600 leading-relaxed">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-slate-900">Planning Disclaimer:</div>
            <p>
              This estimate is for preliminary budgeting only. Actual construction costs depend on architectural and engineering plans, site conditions, material specifications, local labor and supplier prices, included work, and contractor quotations. Obtain a formal quotation based on a defined scope before committing to a budget.
            </p>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
