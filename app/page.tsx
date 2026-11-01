'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/formatters';
import { ArrowRight, Building2, Search, ShieldCheck, Star, Wrench } from 'lucide-react';

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

const sampleBreakdown = [
  { label: 'Site works & excavation', amount: 680000, percent: 16 },
  { label: 'Structural works', amount: 1180000, percent: 28 },
  { label: 'Finishes & fixtures', amount: 950000, percent: 23 },
  { label: 'Electrical & plumbing', amount: 760000, percent: 18 },
  { label: 'Project contingency', amount: 530000, percent: 13 },
  { label: 'Permit & admin', amount: 240000, percent: 6 },
];

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
          .select('profile_id', { count: 'exact', head: true }),
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

      if (contractorCountResult.error) {
        setContractorCountError(true);
      } else {
        setActiveContractorCount(contractorCountResult.count ?? 0);
      }

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

  return (
    <main className="min-h-screen bg-[#f5f5f2] text-slate-800">
      <Navbar />

      <section className="py-8 sm:py-10">
        <div className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 sm:px-6 lg:grid-cols-[1.04fr_1.08fr] lg:px-8">
          <div className="max-w-[560px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#136F48]">Your home. Your project. Your choice.</p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[0.94] tracking-[-0.04em] text-slate-900 sm:text-[4.2rem]">
              Find a contractor for your next home project
            </h1>
            <p className="mt-5 max-w-[520px] text-lg leading-relaxed text-slate-600">
              Browse contractor profiles, compare listed services and portfolios, and manage your project in one place.
            </p>

            <form onSubmit={handleSearch} className="mt-8 grid gap-3 rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[1fr_1.1fr_auto]">
              <label className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Service</span>
                <select value={service} onChange={(event) => setService(event.target.value)} className="w-full bg-transparent text-sm text-slate-700 outline-none">
                  <option value="all">All services</option>
                  {workTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Service area</span>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Enter a city or area"
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                />
              </label>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[#136F48] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0f5738]"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between rounded-[14px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Building2 className="h-4 w-4 text-[#136F48]" />
                Approved contractors
              </div>
              <p className="text-xl font-extrabold text-slate-900">
                {contractorCountError ? 'Unavailable' : activeContractorCount == null ? 'Loading…' : activeContractorCount.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_28px_50px_rgba(15,23,42,0.12)]">
            <div
              aria-hidden="true"
              className="h-[360px] w-full bg-cover bg-center sm:h-[430px]"
              style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80")' }}
            />
            <div className="absolute inset-x-5 bottom-5 rounded-[22px] bg-white/95 p-4 shadow-lg backdrop-blur-sm">
              <p className="text-[15px] font-extrabold text-slate-900">Explore contractor profiles</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {contractorsError
                  ? 'Contractor data is unavailable right now.'
                  : contractorsLoading
                    ? 'Loading approved contractor profiles…'
                    : `${featuredContractors.length} featured profile${featuredContractors.length === 1 ? '' : 's'} currently shown below.`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-10 pt-2">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-slate-600">Estimate details are calculated from current project assumptions for planning purposes.</p>

          <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="rounded-[14px] border border-slate-200 bg-white px-3 py-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Project type</span>
                <select className="w-full bg-transparent text-base text-slate-700 outline-none" defaultValue="new_build">
                  <option value="new_build">New build</option>
                  <option value="renovation">Renovation</option>
                  <option value="extension">Extension</option>
                </select>
              </label>

              <label className="rounded-[14px] border border-slate-200 bg-white px-3 py-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Floor area (m²)</span>
                <input defaultValue={120} className="w-full bg-transparent text-base text-slate-700 outline-none" />
              </label>

              <label className="rounded-[14px] border border-slate-200 bg-white px-3 py-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Number of floors</span>
                <select className="w-full bg-transparent text-base text-slate-700 outline-none" defaultValue={2}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </label>

              <label className="rounded-[14px] border border-slate-200 bg-white px-3 py-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Finish level</span>
                <select className="w-full bg-transparent text-base text-slate-700 outline-none" defaultValue="standard">
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </label>

              <label className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 md:col-span-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">City</span>
                <input defaultValue="qwe" className="w-full bg-transparent text-base text-slate-700 outline-none" />
              </label>

              <label className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 md:col-span-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Region</span>
                <select className="w-full bg-transparent text-base text-slate-700 outline-none" defaultValue="Region IV-B - MIMAROPA">
                  <option value="Region IV-B - MIMAROPA">Region IV-B - MIMAROPA</option>
                  <option value="NCR">NCR</option>
                  <option value="Region III">Region III</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              className="mt-5 inline-flex items-center gap-2 rounded-[14px] bg-[#136F48] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0f5738]"
            >
              <Wrench className="h-4 w-4" />
              Calculate estimate
            </button>
          </div>

          <div className="mt-5 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#136F48]">Preliminary estimate range</p>
            <p className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-[#136F48] sm:text-[2.6rem]">₱3,420,000.00 – ₱4,800,000.00</p>
            <p className="mt-3 text-base text-slate-600">Base estimate: ₱4,140,000.00</p>

            <div className="mt-5 border-t border-slate-200 pt-5">
              <div className="grid gap-4 md:grid-cols-3">
                {sampleBreakdown.map((item) => (
                  <div key={item.label} className="rounded-[14px] border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.percent}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-[#136F48]" style={{ width: `${item.percent}%` }} />
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-900">₱{item.amount.toLocaleString('en-PH', { maximumFractionDigits: 0 })}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-5 text-xs text-slate-500">Note: This is only an estimate. Final pricing should be confirmed with the chosen contractor and project scope.</p>
          </div>
        </div>
      </section>

      <section className="pb-10 pt-4">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[2rem] font-extrabold leading-tight tracking-[-0.04em] text-slate-900">Popular home services</h2>
              <p className="mt-1 text-sm text-slate-600">Explore work types available in the contractor directory.</p>
            </div>
            <Link href="/contractors" className="inline-flex items-center gap-1 text-sm font-bold text-[#136F48]">
              All contractors <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {services.map((item) => (
              <Link
                key={item.tag}
                href={`/contractors?service=${item.tag}`}
                className="group overflow-hidden rounded-[18px] border border-slate-200 bg-white transition hover:border-emerald-300 hover:shadow-md"
              >
                <div
                  aria-hidden="true"
                  className="h-[220px] w-full bg-cover bg-center transition duration-300 group-hover:scale-[1.02]"
                  style={{ backgroundImage: `url("${item.image}")` }}
                />
                <div className="p-4">
                  <h3 className="text-xl font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{item.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-10">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredContractors.slice(0, 3).map((contractor) => (
              <article key={contractor.profile_id} className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#136F48]">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-extrabold text-slate-900">{contractor.business_name}</h3>
                    <div className="mt-1 flex items-center gap-1 text-xs text-emerald-800">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approved contractor
                    </div>
                  </div>
                </div>

                {contractor.bio && <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-slate-600">{contractor.bio}</p>}

                <div className="mt-4 flex flex-wrap gap-2">
                  {(contractor.work_types ?? []).map((type) => (
                    <span key={type} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-700">
                      {type.replaceAll('_', ' ')}
                    </span>
                  ))}
                </div>

                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                  {Number(contractor.rating_count ?? 0) > 0 ? (
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      {Number(contractor.rating_avg ?? 0).toFixed(1)} ({contractor.rating_count} reviews)
                    </div>
                  ) : (
                    <p>No reviews yet</p>
                  )}
                  <p>{contractor.service_cities?.length ? contractor.service_cities.join(', ') : 'Service areas not listed'}</p>
                  <p>{formatBudget(contractor.min_project_budget, contractor.max_project_budget)}</p>
                </div>

                <Link href={`/contractors/${contractor.profile_id}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#136F48] hover:underline">
                  View profile <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
