'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { createClient } from '@/lib/supabase/client';
import { Search, Star, ShieldCheck, ArrowRight, SlidersHorizontal } from 'lucide-react';

type ContractorRecord = {
  profile_id: string;
  business_name: string;
  bio: string | null;
  service_cities: string[];
  specialties: string[];
  work_types: string[];
  license_no: string | null;
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
  const [sort, setSort] = React.useState(searchParams.get('sort') === 'reviews' ? 'reviews' : 'rating');
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
      setSort(params.get('sort') === 'reviews' ? 'reviews' : 'rating');
      setPage(getPageFromParams(params));
    };

    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const normalizedLocation = location.trim().toLowerCase();
  const filterKey = JSON.stringify([normalizedSearch, normalizedLocation, service, sort]);

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
            .select('profile_id, business_name, bio, service_cities, specialties, work_types, license_no, rating_avg, rating_count, min_project_budget, max_project_budget')
            .order(sort === 'reviews' ? 'rating_count' : 'rating_avg', { ascending: false });

          if (sort === 'reviews') {
            query = query.order('rating_avg', { ascending: false });
          }
          query = query.order('profile_id', { ascending: true });

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
  }, [filterKey, normalizedLocation, normalizedSearch, page, service, sort]);

  const visibleContractors = contractors.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasPrevious = page > 0;
  const hasNext = contractors.length > (page + 1) * PAGE_SIZE;

  const changeFilter = (key: 'search' | 'location' | 'service' | 'sort', value: string) => {
    if (key === 'search') setSearch(value);
    else if (key === 'location') setLocation(value);
    else if (key === 'service') setService(value);
    else setSort(value);
    setPage(0);
    updateQueryParams({ [key]: value || null, page: '1' });
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    updateQueryParams({ page: String(nextPage + 1) });
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <Navbar />
      <section className="border-b border-slate-200 bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-widest text-[#136F48]">Contractor directory</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Find a contractor</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            Browse active, approved contractor profiles and filter by their listed services and service areas.
          </p>

          <div className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="sr-only">Search contractors</span>
              <input value={search} onChange={(event) => changeFilter('search', event.target.value)} placeholder="Business, trade, or specialty" className="w-full py-3 text-sm outline-none" />
            </label>
            <label className="rounded-xl border border-slate-200 bg-white px-3">
              <span className="sr-only">Filter by service area</span>
              <input value={location} onChange={(event) => changeFilter('location', event.target.value)} placeholder="Service area" className="w-full py-3 text-sm outline-none" />
            </label>
            <label className="rounded-xl border border-slate-200 bg-white px-3">
              <span className="sr-only">Filter by service type</span>
              <select value={service} onChange={(event) => changeFilter('service', event.target.value)} className="w-full bg-white py-3 text-sm outline-none">
                {serviceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="sr-only">Sort contractors</span>
              <select value={sort} onChange={(event) => changeFilter('sort', event.target.value)} className="w-full bg-white py-3 text-sm outline-none">
                <option value="rating">Highest rated</option>
                <option value="reviews">Most reviewed</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
        <p className="mb-5 text-sm text-slate-600" aria-live="polite">
          {loading ? 'Loading contractor profiles…' : loadError ? 'Directory unavailable' : directoryExhausted
            ? `${contractors.length} contractor${contractors.length === 1 ? '' : 's'} found`
            : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, contractors.length)} matching contractors`}
        </p>
        {loadError ? (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{loadError}</div>
        ) : loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading contractor profiles…</div>
        ) : visibleContractors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="font-bold text-slate-900">No matching contractors</h2>
            <p className="mt-2 text-sm text-slate-600">
              {scannedCount === 0 && !search && !location && service === 'all'
                ? 'There are no active, approved contractor profiles available yet.'
                : 'Try changing or clearing your search filters.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleContractors.map((contractor) => {
              const specialties = contractor.specialties ?? [];
              const workTypes = contractor.work_types ?? [];
              const cities = contractor.service_cities ?? [];
              const minBudget = contractor.min_project_budget == null ? null : Number(contractor.min_project_budget);
              const maxBudget = contractor.max_project_budget == null ? null : Number(contractor.max_project_budget);
              return (
                <article key={contractor.profile_id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900">{contractor.business_name}</h2>
                      <div className="mt-2 flex items-center gap-2 text-xs text-emerald-800">
                        <ShieldCheck className="h-4 w-4" />
                        Approved profile
                      </div>
                    </div>
                    {Number(contractor.rating_count) > 0 ? (
                      <div className="flex shrink-0 items-center gap-1 text-sm font-bold text-slate-800">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        {Number(contractor.rating_avg).toFixed(1)}
                        <span className="text-xs font-normal text-slate-500">({contractor.rating_count})</span>
                      </div>
                    ) : <span className="text-xs text-slate-500">No reviews yet</span>}
                  </div>
                  {contractor.bio && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-600">{contractor.bio}</p>}
                  {workTypes.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {workTypes.map((workType) => <span key={workType} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{workType.replaceAll('_', ' ')}</span>)}
                      {specialties.map((specialty) => <span key={specialty} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{specialty.replaceAll('_', ' ')}</span>)}
                    </div>
                  )}
                  <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                    <div><dt className="inline font-semibold text-slate-700">Service areas: </dt><dd className="inline text-slate-600">{cities.length ? cities.join(', ') : 'Not listed'}</dd></div>
                    <div><dt className="inline font-semibold text-slate-700">Project budget: </dt><dd className="inline text-slate-600">{minBudget != null || maxBudget != null ? `${minBudget != null ? formatCurrency(minBudget) : 'Not specified'} – ${maxBudget != null ? formatCurrency(maxBudget) : 'Not specified'}` : 'Contact for pricing'}</dd></div>
                    {contractor.license_no && <div><dt className="inline font-semibold text-slate-700">License: </dt><dd className="inline text-slate-600">{contractor.license_no}</dd></div>}
                  </dl>
                  <Link href={`/contractors/${contractor.profile_id}`} className="mt-5 inline-flex items-center gap-2 font-bold text-sm text-[#136F48] hover:underline">
                    View profile <ArrowRight className="h-4 w-4" />
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
