'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { createClient } from '@/lib/supabase/client';
import { Search, Star, ShieldCheck, ArrowRight } from 'lucide-react';

type ContractorRecord = {
  profile_id: string;
  business_name: string;
  bio: string | null;
  service_cities: string[];
  specialties: string[];
  work_types: string[];
  rating_avg: number;
  rating_count: number;
  min_project_budget: number | null;
  max_project_budget: number | null;
};

const PAGE_SIZE = 20;

const serviceOptions = [
  { value: 'all', label: 'All Services' },
  { value: 'new_build', label: 'New Build' },
  { value: 'renovation', label: 'Renovation' },
  { value: 'extension', label: 'Extension' },
];

function formatCurrency(value: number) {
  return `₱${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(value)}`;
}

function getPageFromParams(searchParams: URLSearchParams) {
  const parsedPage = Number.parseInt(searchParams.get('page') ?? '1', 10);
  return Number.isFinite(parsedPage) && parsedPage > 1 ? parsedPage - 1 : 0;
}

export default function ContractorsDirectoryPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-50" aria-label="Loading contractors" />}>
      <ContractorsDirectoryContent />
    </React.Suspense>
  );
}

function ContractorsDirectoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryString = searchParams.toString();
  const [contractors, setContractors] = React.useState<ContractorRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [search, setSearch] = React.useState(searchParams.get('search') ?? '');
  const [location, setLocation] = React.useState(searchParams.get('location') ?? '');
  const [service, setService] = React.useState(searchParams.get('service') ?? 'all');
  const [page, setPage] = React.useState(() => getPageFromParams(new URLSearchParams(queryString)));
  const [directoryExhausted, setDirectoryExhausted] = React.useState(false);
  const [scannedCount, setScannedCount] = React.useState(0);
  const scanState = React.useRef<{
    key: string;
    offset: number;
    matches: ContractorRecord[];
    exhausted: boolean;
    scannedCount: number;
  } | null>(null);

  const updateQueryParams = React.useCallback((changes: Record<string, string | null>) => {
    const params = new URLSearchParams(queryString);
    Object.entries(changes).forEach(([key, value]) => {
      if (value == null || value === '') params.delete(key);
      else params.set(key, value);
    });
    const updatedQuery = params.toString();
    router.replace(`${pathname}${updatedQuery ? `?${updatedQuery}` : ''}`, { scroll: false });
  }, [pathname, queryString, router]);

  React.useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get('search') ?? '');
      setLocation(params.get('location') ?? '');
      setService(params.get('service') ?? 'all');
      setPage(getPageFromParams(params));
    };

    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const normalizedLocation = location.trim().toLowerCase();
  const filterKey = JSON.stringify([normalizedSearch, normalizedLocation, service]);

  React.useEffect(() => {
    let active = true;
    const loadContractors = async () => {
      setLoading(true);
      setLoadError('');

      if (scanState.current?.key !== filterKey) {
        scanState.current = {
          key: filterKey,
          offset: 0,
          matches: [],
          exhausted: false,
          scannedCount: 0,
        };
        setContractors([]);
        setDirectoryExhausted(false);
        setScannedCount(0);
      }

      const currentScan = scanState.current;
      if (!currentScan) return;
      const targetMatchCount = (page + 1) * PAGE_SIZE + 1;
      const supabase = createClient();

      try {
        while (active && !currentScan.exhausted && currentScan.matches.length < targetMatchCount) {
          const end = currentScan.offset + PAGE_SIZE - 1;
          let query = supabase
            .from('contractor_directory')
            .select('profile_id, business_name, bio, service_cities, specialties, work_types, rating_avg, rating_count, min_project_budget, max_project_budget')
            .order('business_name', { ascending: true })
            .order('profile_id', { ascending: true });

          if (service !== 'all') query = query.contains('work_types', [service]);

          const { data, error } = await query.range(currentScan.offset, end);
          if (!active) return;
          if (error) {
            console.error(
              `Unable to load contractor directory (${error.code}): ${error.message}`,
              error.details,
              error.hint,
            );
            setLoadError(`Contractors could not be loaded: ${error.message}`);
            break;
          }

          const batch = (data ?? []) as ContractorRecord[];
          currentScan.offset += batch.length;
          currentScan.scannedCount += batch.length;
          if (batch.length < PAGE_SIZE) currentScan.exhausted = true;

          const batchMatches = batch.filter((contractor) => {
            const searchable = [
              contractor.business_name,
              contractor.bio ?? '',
              ...(contractor.work_types ?? []),
              ...(contractor.specialties ?? []),
            ].join(' ').toLowerCase();
            const serviceMatches = service === 'all' || (contractor.work_types ?? []).includes(service);
            const locationMatches = !normalizedLocation ||
              (contractor.service_cities ?? []).some((city) => city.toLowerCase().includes(normalizedLocation));
            return (!normalizedSearch || searchable.includes(normalizedSearch)) && serviceMatches && locationMatches;
          });
          currentScan.matches.push(...batchMatches);
          setContractors([...currentScan.matches]);
          setScannedCount(currentScan.scannedCount);
          setDirectoryExhausted(currentScan.exhausted);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadContractors();
    return () => {
      active = false;
    };
  }, [filterKey, normalizedLocation, normalizedSearch, page, service]);

  const visibleContractors = contractors.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasPrevious = page > 0;
  const hasNext = contractors.length > (page + 1) * PAGE_SIZE;

  const changeFilter = (key: 'search' | 'location' | 'service', value: string) => {
    if (key === 'search') setSearch(value);
    else if (key === 'location') setLocation(value);
    else setService(value);
    setPage(0);
    updateQueryParams({ [key]: value || null, sort: null, page: '1' });
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    updateQueryParams({ page: String(nextPage + 1) });
  };

  return (
    <main className="min-h-screen bg-[#f3f7f4] text-slate-800">
      <Navbar />
      <section className="border-b border-[#d6e5dc] bg-[#e6f1eb]">
        <div className="w-full px-4 py-9 sm:px-6 lg:px-10 lg:py-12">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#136F48]">Contractor directory</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.05em] text-slate-900 sm:text-5xl">Find the right team for your project</h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                Compare approved local professionals by services, service areas, experience and project budget.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-sm text-slate-600 shadow-sm">
              <ShieldCheck className="h-5 w-5 text-[#136F48]" />
              <span>Active, approved contractor profiles</span>
            </div>
          </div>

          <div className="mt-8 grid gap-3 rounded-2xl border border-[#d8e6dd] bg-white/80 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)] md:grid-cols-3">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-[#136F48] focus-within:ring-2 focus-within:ring-[#136F48]/10">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="sr-only">Search contractors</span>
              <input value={search} onChange={(event) => changeFilter('search', event.target.value)} placeholder="Business, trade, or specialty" className="w-full py-3.5 text-sm outline-none" />
            </label>
            <label className="rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-[#136F48] focus-within:ring-2 focus-within:ring-[#136F48]/10">
              <span className="sr-only">Filter by service area</span>
              <input value={location} onChange={(event) => changeFilter('location', event.target.value)} placeholder="Service area" className="w-full py-3.5 text-sm outline-none" />
            </label>
            <label className="rounded-xl border border-slate-200 bg-white px-3">
              <span className="sr-only">Filter by service type</span>
              <select value={service} onChange={(event) => changeFilter('service', event.target.value)} className="w-full bg-white py-3.5 text-sm outline-none">
                {serviceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="w-full px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="mb-6 flex flex-col gap-2 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#136F48]">Browse professionals</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Available contractors</h2>
          </div>
          <p className="text-sm text-slate-600" aria-live="polite">
            {loading ? 'Loading contractor profiles…' : loadError ? 'Directory unavailable' : directoryExhausted
              ? `${contractors.length} contractor${contractors.length === 1 ? '' : 's'} found`
              : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, contractors.length)} matching contractors`}
          </p>
        </div>
        {loadError ? (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 text-sm text-rose-800 shadow-sm">{loadError}</div>
        ) : loading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />)}
          </div>
        ) : visibleContractors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#edf5f0] text-[#136F48]">
              <Search className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">No matching contractors</h2>
            <p className="mt-2 text-sm text-slate-600">
              {scannedCount === 0 && !search && !location && service === 'all'
                ? 'There are no active, approved contractor profiles available yet.'
                : 'Try changing or clearing your search filters.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {visibleContractors.map((contractor) => {
              const specialties = contractor.specialties ?? [];
              const workTypes = contractor.work_types ?? [];
              const cities = contractor.service_cities ?? [];
              const minBudget = contractor.min_project_budget == null ? null : Number(contractor.min_project_budget);
              const maxBudget = contractor.max_project_budget == null ? null : Number(contractor.max_project_budget);
              return (
                <article key={contractor.profile_id} className="group flex min-h-[300px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#bdd8c7] hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d6e8de] bg-[#f0f7f3] text-lg font-bold text-[#136F48]">
                        {contractor.business_name.trim().slice(0, 1).toUpperCase() || 'C'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#136F48]">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Approved profile
                        </div>
                        <h3 className="mt-1 truncate text-lg font-bold text-slate-900">{contractor.business_name}</h3>
                      </div>
                    </div>
                    {Number(contractor.rating_count) > 0 ? (
                      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-bold text-slate-800">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                        {Number(contractor.rating_avg).toFixed(1)}
                        <span className="text-xs font-normal text-slate-500">({contractor.rating_count})</span>
                      </div>
                    ) : <span className="shrink-0 text-xs text-slate-500">No reviews</span>}
                  </div>
                  {contractor.bio && <p className="mt-4 line-clamp-3 min-h-[3.75rem] text-sm leading-relaxed text-slate-600">{contractor.bio}</p>}
                  <div className="mt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Services & specialties</p>
                    <div className="mt-2 flex min-h-7 flex-wrap gap-2">
                      {workTypes.length || specialties.length ? (
                        <>
                          {workTypes.map((workType) => <span key={workType} className="rounded-md border border-[#d7e9de] bg-[#f1f8f4] px-2.5 py-1 text-xs font-medium capitalize text-[#155b3d]">{workType.replaceAll('_', ' ')}</span>)}
                          {specialties.map((specialty) => <span key={specialty} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">{specialty.replaceAll('_', ' ')}</span>)}
                        </>
                      ) : <span className="text-sm text-slate-500">Not listed</span>}
                    </div>
                  </div>
                  <dl className="mt-4 grow space-y-2 border-t border-slate-100 pt-4 text-sm">
                    <div><dt className="font-semibold text-slate-700">Service areas</dt><dd className="mt-1 line-clamp-2 text-slate-600">{cities.length ? cities.join(', ') : 'Not listed'}</dd></div>
                    <div><dt className="inline font-semibold text-slate-700">Project budget: </dt><dd className="inline text-slate-600">{minBudget != null || maxBudget != null ? `${minBudget != null ? formatCurrency(minBudget) : 'Not specified'} – ${maxBudget != null ? formatCurrency(maxBudget) : 'Not specified'}` : 'Contact for pricing'}</dd></div>
                  </dl>
                  <Link href={`/contractors/${contractor.profile_id}`} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#136F48] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f5738] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#136F48]">
                    View contractor profile <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
        {!loadError && (hasPrevious || hasNext) && (
          <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Contractor directory pages">
            <button
              type="button"
              onClick={() => changePage(page - 1)}
              disabled={!hasPrevious || loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">Page {page + 1}</span>
            <button
              type="button"
              onClick={() => changePage(page + 1)}
              disabled={!hasNext || loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </main>
  );
}
