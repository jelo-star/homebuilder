'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { createClient } from '@/lib/supabase/client';
import { calculatePreliminaryEstimateFromSupabase } from '@/lib/utils/estimator';
import { PHILIPPINE_REGIONS } from '@/lib/utils/philippines';
import { formatCurrency } from '@/lib/utils/formatters';
import { ArrowRight, Building2, CheckCircle2, Search, ShieldCheck, Star, Wrench } from 'lucide-react';

type ContractorRecord = {
  profile_id: string;
  business_name: string;
  bio: string | null;
  service_cities: string[] | null;
  work_types: string[] | null;
  specialties: string[] | null;
  rating_avg: number | null;
  rating_count: number | null;
  min_project_budget: number | null;
  max_project_budget: number | null;
};

type EstimateResult = {
  costLow: number;
  costBase: number;
  costHigh: number;
  benchmarkSource: string;
};

const services = [
  { title: 'Renovation', subtitle: 'Refresh and improve your home', image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80', tag: 'renovation' },
  { title: 'New Build', subtitle: 'Plan a new residential build', image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80', tag: 'new_build' },
  { title: 'Extension', subtitle: 'Add space to your home', image: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=600&q=80', tag: 'extension' },
];

const workTypeOptions = [
  { value: 'new_build', label: 'New build' },
  { value: 'renovation', label: 'Renovation' },
  { value: 'extension', label: 'Extension' },
] as const;

const finishOptions = [
  { value: 'basic', label: 'Basic' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
] as const;

function formatBudget(min: number | null, max: number | null) {
  if (min == null && max == null) return 'Contact for pricing';
  const formattedMin = min == null ? 'Not specified' : formatCurrency(Number(min));
  const formattedMax = max == null ? 'Not specified' : formatCurrency(Number(max));
  return `${formattedMin} – ${formattedMax}`;
}

export default function HomePage() {
  const router = useRouter();
  const [service, setService] = React.useState('all');
  const [location, setLocation] = React.useState('');
  const [featuredContractors, setFeaturedContractors] = React.useState<ContractorRecord[]>([]);
  const [activeContractorCount, setActiveContractorCount] = React.useState<number | null>(null);
  const [contractorsLoading, setContractorsLoading] = React.useState(true);
  const [contractorsError, setContractorsError] = React.useState('');
  const [contractorCountError, setContractorCountError] = React.useState(false);

  const [area, setArea] = React.useState(120);
  const [floors, setFloors] = React.useState(2);
  const [finish, setFinish] = React.useState<'basic' | 'standard' | 'premium'>('standard');
  const [workType, setWorkType] = React.useState<'new_build' | 'renovation' | 'extension'>('new_build');
  const [estimateCity, setEstimateCity] = React.useState('');
  const [estimateRegion, setEstimateRegion] = React.useState('');
  const [estimate, setEstimate] = React.useState<EstimateResult | null>(null);
  const [estimateLoading, setEstimateLoading] = React.useState(false);
  const [estimateError, setEstimateError] = React.useState('');

  React.useEffect(() => {
    let active = true;
    const loadHomeData = async () => {
      const supabase = createClient();
      const [contractorResult, contractorCountResult] = await Promise.all([
        supabase
          .from('contractor_directory')
          .select('profile_id, business_name, bio, service_cities, work_types, specialties, rating_avg, rating_count, min_project_budget, max_project_budget')
          .order('rating_avg', { ascending: false })
          .limit(5),
        supabase
          .from('contractor_directory')
          .select('profile_id', { count: 'exact', head: true })
      ]);
      if (!active) return;
      if (contractorResult.error) {
        console.error(
          `Unable to load featured contractor profiles (${contractorResult.error.code}): ${contractorResult.error.message}`,
          contractorResult.error.details,
          contractorResult.error.hint,
        );
        setContractorsError(contractorResult.error.message);
        setFeaturedContractors([]);
      } else {
        setContractorsError('');
        setFeaturedContractors((contractorResult.data ?? []) as ContractorRecord[]);
      }
      if (contractorCountResult.error) setContractorCountError(true);
      else setActiveContractorCount(contractorCountResult.count ?? 0);
      setContractorsLoading(false);
    };

    void loadHomeData();
    return () => {
      active = false;
    };
  }, []);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = new URLSearchParams();
    if (service !== 'all') query.set('service', service);
    if (location.trim()) query.set('location', location.trim());
    router.push(`/contractors${query.size ? `?${query.toString()}` : ''}`);
  };

  const requestEstimate = async (event: React.FormEvent) => {
    event.preventDefault();
    setEstimate(null);
    setEstimateError('');
    if (!estimateCity.trim() || !estimateRegion) {
      setEstimateError('Enter a city and select a region to request an estimate.');
      return;
    }

    setEstimateLoading(true);
    try {
      const result = await calculatePreliminaryEstimateFromSupabase({
        projectType: workType,
        houseType: floors === 1 ? 'one_storey' : 'two_storey',
        finishLevel: finish,
        floorArea: area,
        floors,
        region: estimateRegion,
        city: estimateCity.trim(),
      });
      setEstimate(result);
    } catch {
      setEstimateError('An estimate is not available for these details right now. Please try again later.');
    } finally {
      setEstimateLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <Navbar />
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#136F48]">Your home. Your project. Your choice.</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Find a contractor for your next home project
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
              Browse contractor profiles, compare listed services and portfolios, and manage your project in one place.
            </p>
            <form onSubmit={handleSearch} className="mt-8 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto]">
              <label className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Service</span>
                <select value={service} onChange={(event) => setService(event.target.value)} className="w-full bg-white text-sm outline-none">
                  <option value="all">All services</option>
                  {workTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Service area</span>
                <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Enter a city or area" className="w-full text-sm outline-none" />
              </label>
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#136F48] px-5 py-3 text-sm font-bold text-white hover:bg-[#0f5738]">
                <Search className="h-4 w-4" /> Search
              </button>
            </form>

            <div className="mt-5 grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Building2 className="h-4 w-4 text-[#136F48]" />Approved contractors</div>
                <p className="mt-2 text-xl font-extrabold text-slate-900">{contractorCountError ? 'Unavailable' : activeContractorCount == null ? 'Loading…' : activeContractorCount.toLocaleString()}</p>
              </div>
            </div>
            {contractorCountError && <p className="mt-2 text-xs text-slate-500">The live contractor count is unavailable right now.</p>}
          </div>

          <div className="relative overflow-hidden rounded-3xl border-4 border-white shadow-xl">
            <div aria-hidden="true" className="h-[320px] w-full bg-cover bg-center sm:h-[420px]" style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80")' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
            <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-white/95 p-4 shadow-lg backdrop-blur">
              <p className="text-sm font-extrabold text-slate-900">Explore contractor profiles</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {contractorsError ? 'Contractor data is unavailable right now.' : contractorsLoading ? 'Loading approved contractor profiles…' : `${featuredContractors.length} featured profile${featuredContractors.length === 1 ? '' : 's'} currently shown below.`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Popular home services</h2>
              <p className="mt-1 text-sm text-slate-600">Explore work types available in the contractor directory.</p>
            </div>
            <Link href="/contractors" className="inline-flex items-center gap-1 text-sm font-bold text-[#136F48]">All contractors <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {services.map((item) => (
              <Link key={item.tag} href={`/contractors?service=${item.tag}`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 transition hover:border-emerald-300 hover:shadow-md">
                <div aria-hidden="true" className="h-36 w-full bg-cover bg-center transition group-hover:scale-[1.02]" style={{ backgroundImage: `url("${item.image}")` }} />
                <div className="p-4">
                  <h3 className="font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{item.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Featured contractors</h2>
              <p className="mt-1 text-sm text-slate-600">Profiles are loaded from active, approved contractor records.</p>
            </div>
            <Link href="/contractors" className="inline-flex items-center gap-1 text-sm font-bold text-[#136F48]">View directory <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {contractorsError ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
              <p>Featured contractor profiles are unavailable: {contractorsError}</p>
              <p className="mt-2 text-xs">Apply migration 69 to repair public contractor access and milestone proof image permissions.</p>
            </div>
          ) : contractorsLoading ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading featured contractor profiles…</p>
          ) : featuredContractors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-bold text-slate-900">No featured contractor profiles yet</p>
              <p className="mt-2 text-sm text-slate-600">Approved profiles will appear here when available.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredContractors.map((contractor) => (
                <article key={contractor.profile_id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#136F48]"><Building2 className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <h3 className="truncate font-extrabold text-slate-900">{contractor.business_name}</h3>
                      <div className="mt-1 flex items-center gap-1 text-xs text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Approved contractor</div>
                    </div>
                  </div>
                  {contractor.bio && <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-slate-600">{contractor.bio}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(contractor.work_types ?? []).map((type) => <span key={type} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-700">{type.replaceAll('_', ' ')}</span>)}
                  </div>
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                    {Number(contractor.rating_count ?? 0) > 0 ? (
                      <div className="flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{Number(contractor.rating_avg ?? 0).toFixed(1)} ({contractor.rating_count} reviews)</div>
                    ) : <p>No reviews yet</p>}
                    <p>{contractor.service_cities?.length ? contractor.service_cities.join(', ') : 'Service areas not listed'}</p>
                    <p>{formatBudget(contractor.min_project_budget, contractor.max_project_budget)}</p>
                  </div>
                  <Link href={`/contractors/${contractor.profile_id}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#136F48] hover:underline">View profile <ArrowRight className="h-4 w-4" /></Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[#136F48]">Project planning</p>
            <h2 className="mt-2 text-2xl font-extrabold text-slate-900">Request a preliminary estimate</h2>
            <p className="mt-2 text-sm text-slate-600">Estimate details are calculated from active construction benchmark records in the database.</p>
          </div>
          <form onSubmit={requestEstimate} className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-semibold text-slate-700">Project type
                <select value={workType} onChange={(event) => setWorkType(event.target.value as typeof workType)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm">
                  {workTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">Floor area (m²)
                <input type="number" min={1} value={area} onChange={(event) => setArea(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" required />
              </label>
              <label className="text-xs font-semibold text-slate-700">Number of floors
                <select value={floors} onChange={(event) => setFloors(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm">
                  <option value={1}>1</option><option value={2}>2</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">Finish level
                <select value={finish} onChange={(event) => setFinish(event.target.value as typeof finish)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm">
                  {finishOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">City
                <input value={estimateCity} onChange={(event) => setEstimateCity(event.target.value)} placeholder="Enter project city" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" required />
              </label>
              <label className="text-xs font-semibold text-slate-700">Region
                <select value={estimateRegion} onChange={(event) => setEstimateRegion(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" required>
                  <option value="">Select a region</option>
                  {PHILIPPINE_REGIONS.map((region) => <option key={region.code} value={region.code}>{region.region}</option>)}
                </select>
              </label>
            </div>
            <button type="submit" disabled={estimateLoading} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#136F48] px-5 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">
              <Wrench className="h-4 w-4" />{estimateLoading ? 'Calculating…' : 'Calculate estimate'}
            </button>
            {estimateError && <p role="alert" className="mt-4 text-sm text-rose-700">{estimateError}</p>}
            {estimate && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preliminary estimate range</p>
                <p className="mt-2 text-2xl font-extrabold text-[#136F48]">{formatCurrency(estimate.costLow)} – {formatCurrency(estimate.costHigh)}</p>
                <p className="mt-1 text-sm text-slate-600">Base estimate: {formatCurrency(estimate.costBase)}</p>
                <p className="mt-3 text-xs text-slate-500">Benchmark source: {estimate.benchmarkSource}</p>
              </div>
            )}
          </form>
        </div>
      </section>

      <section className="py-10">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
          {[
            { icon: <ShieldCheck className="h-5 w-5" />, title: 'Review contractor profiles', text: 'See approval status and business details listed on each profile.' },
            { icon: <CheckCircle2 className="h-5 w-5" />, title: 'Compare project information', text: 'Browse portfolio items and homeowner reviews when available.' },
            { icon: <Wrench className="h-5 w-5" />, title: 'Plan your project', text: 'Use database-backed preliminary benchmarks as an initial planning reference.' },
          ].map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#136F48]">{item.icon}</div>
              <h3 className="mt-4 font-extrabold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
