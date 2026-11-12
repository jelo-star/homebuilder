'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { createClient } from '@/lib/supabase/client';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage';
import { Search, Star, ShieldCheck, ChevronDown, Grid2X2, List, MapPin } from 'lucide-react';

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
  profile_image_path: string | null;
  cover_image_path: string | null;
};

const PAGE_SIZE = 20;

const serviceOptions = [
  { value: 'all', label: 'All Services' },
  { value: 'new_build', label: 'New Build' },
  { value: 'renovation', label: 'Renovation' },
  { value: 'extension', label: 'Extension' },
];

const contractorCoverImages = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=700&q=80',
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
  const [budgetFilter, setBudgetFilter] = React.useState('all');
  const [ratingFilter, setRatingFilter] = React.useState('0');
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
  const filterKey = JSON.stringify([normalizedSearch, normalizedLocation, service, budgetFilter, ratingFilter]);

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
            .select('profile_id, business_name, bio, service_cities, specialties, work_types, rating_avg, rating_count, min_project_budget, max_project_budget, profile_image_path, cover_image_path')
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
            const minBudget = contractor.min_project_budget == null ? null : Number(contractor.min_project_budget);
            const maxBudget = contractor.max_project_budget == null ? null : Number(contractor.max_project_budget);
            const budgetMatches = budgetFilter === 'all' ||
              (budgetFilter === 'under_150' && (minBudget == null || minBudget < 150000)) ||
              (budgetFilter === '150_500' && (maxBudget == null || maxBudget >= 150000) && (minBudget == null || minBudget <= 500000)) ||
              (budgetFilter === 'over_500' && (maxBudget == null || maxBudget > 500000));
            const ratingMatches = Number(contractor.rating_avg ?? 0) >= Number(ratingFilter);
            return (!normalizedSearch || searchable.includes(normalizedSearch)) && serviceMatches && locationMatches && budgetMatches && ratingMatches;
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
  }, [budgetFilter, filterKey, normalizedLocation, normalizedSearch, page, ratingFilter, service]);

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
    <main className="min-h-screen bg-[#f5f8f6] text-slate-800">
      <Navbar />
      <section className="relative overflow-hidden border-b border-[#d6e5dc] bg-[#e7f1ec]">
        <div className="absolute inset-y-0 right-0 hidden w-[43%] overflow-hidden bg-[#d9e8e0] lg:block" aria-label="Fixed contractor coverage map">
          <iframe
            title="Street map near Quezon City"
            src="https://www.openstreetmap.org/export/embed.html?bbox=120.99%2C14.63%2C121.10%2C14.73&layer=mapnik"
            className="pointer-events-none absolute inset-0 h-full w-full border-0 opacity-85 grayscale-[8%]"
            loading="lazy"
          />
          <div className="pointer-events-none absolute inset-0 bg-[#e7f1ec]/10" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[36%] bg-gradient-to-r from-[#e7f1ec] via-[#e7f1ec]/75 to-transparent" aria-hidden="true" />
          <div className="pointer-events-none absolute left-[55%] top-[42%] z-20 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#136f48] text-white shadow-[0_4px_12px_rgba(19,111,72,.35)]">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="pointer-events-none absolute left-[68%] top-[28%] z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#136f48] shadow-md">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="pointer-events-none absolute left-[78%] top-[64%] z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#136f48] shadow-md">
            <MapPin className="h-4 w-4" />
          </div>
        </div>
        <div className="relative mx-auto min-h-[320px] w-full px-[5%] py-8 sm:py-9 lg:py-10">
          <div className="max-w-[650px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Your home. Our trusted experts.</p>
            <h1 className="mt-3 max-w-[620px] text-4xl font-extrabold leading-[1.02] tracking-[-0.055em] text-slate-950 sm:text-5xl">Search verified contractors near <span className="text-[#136f48]">you</span></h1>
            <p className="mt-2 max-w-[560px] text-sm leading-relaxed text-slate-500">Find trusted, verified home contractors for your next project. Compare profiles, read reviews, and message professionals — all in one place.</p>
          <div className="mt-5 grid max-w-[610px] gap-2 rounded-xl bg-white/90 p-2 shadow-[0_10px_28px_rgba(15,23,42,.10)] sm:grid-cols-[1.05fr_1.2fr_.9fr_auto]">
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
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#268463] px-5 py-2 text-xs font-bold text-white"><Search className="h-4 w-4" />Search</button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-600"><MapPin className="h-3.5 w-3.5" /> Search within: <span className="rounded bg-[#dff2e9] px-2 py-1 font-semibold text-[#136f48]">10 km</span><span className="rounded bg-white/70 px-2 py-1">25 km</span><span className="rounded bg-white/70 px-2 py-1">50 km</span></div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full gap-5 px-[5%] py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-7">
        <aside className="hidden self-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">Filters</h2>
            <button
              type="button"
              onClick={() => {
                changeFilter('search', '');
                changeFilter('location', '');
                changeFilter('service', 'all');
                setBudgetFilter('all');
                setRatingFilter('0');
              }}
              className="text-[10px] font-semibold text-[#136f48] hover:underline"
            >
              Clear all
            </button>
          </div>

          <label className="mt-4 flex items-center gap-2 text-[11px] font-medium text-slate-700">
            <input type="checkbox" checked readOnly className="accent-[#136f48]" />
            Verified contractors only
          </label>

          <div className="mt-5 border-b border-slate-100 pb-4">
            <p className="text-xs font-bold text-slate-800">Category</p>
            <div className="mt-3 space-y-2">
              {serviceOptions.slice(1).map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={service === option.value}
                    onChange={() => changeFilter('service', service === option.value ? 'all' : option.value)}
                    className="accent-[#136f48]"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-b border-slate-100 py-4">
            <p className="text-xs font-bold text-slate-800">Budget Range (PHP)</p>
            <div className="mt-3 space-y-2">
              {[
                ['all', 'Any budget'],
                ['under_150', 'Under ₱150,000'],
                ['150_500', '₱150,000 – ₱500,000'],
                ['over_500', '₱500,000+'],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-[11px] text-slate-600">
                  <input type="radio" name="budget" checked={budgetFilter === value} onChange={() => setBudgetFilter(value)} className="accent-[#136f48]" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="border-b border-slate-100 py-4">
            <p className="text-xs font-bold text-slate-800">Minimum Rating</p>
            <div className="mt-3 space-y-2">
              {[['0', 'Any rating'], ['4.5', '4.5 & up'], ['4', '4.0 & up'], ['3.5', '3.5 & up']].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-[11px] text-slate-600">
                  <input type="radio" name="rating" checked={ratingFilter === value} onChange={() => setRatingFilter(value)} className="accent-[#136f48]" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <p className="text-xs font-bold text-slate-800">Service Area</p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{location || 'All service areas'}</p>
          </div>
        </aside>

        <div className="min-w-0">
        <div className="mb-6 flex flex-col gap-2 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#136F48]">Browse professionals</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900"><span className="text-[#136f48]">{contractors.length}</span> verified contractors near you</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500"><span>Sort by:</span><button type="button" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">Top Rated <ChevronDown className="h-3 w-3" /></button><button type="button" className="rounded-lg border border-[#b8d7c6] bg-[#edf8f2] p-2 text-[#136f48]" aria-label="Grid view"><Grid2X2 className="h-4 w-4" /></button><button type="button" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500" aria-label="List view"><List className="h-4 w-4" /></button></div>
          <p className="sr-only" aria-live="polite">
            {loading ? 'Loading contractor profiles…' : loadError ? 'Directory unavailable' : directoryExhausted
              ? `${contractors.length} contractor${contractors.length === 1 ? '' : 's'} found`
              : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, contractors.length)} matching contractors`}
          </p>
        </div>
        {loadError ? (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 text-sm text-rose-800 shadow-sm">{loadError}</div>
        ) : loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {visibleContractors.map((contractor) => {
              const specialties = contractor.specialties ?? [];
              const workTypes = contractor.work_types ?? [];
              const offeredServices = [...new Set([...workTypes, ...specialties])];
              const cities = contractor.service_cities ?? [];
              const minBudget = contractor.min_project_budget == null ? null : Number(contractor.min_project_budget);
              const maxBudget = contractor.max_project_budget == null ? null : Number(contractor.max_project_budget);
              return (
                <article key={contractor.profile_id} className="group flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-[#9fcdb7] hover:shadow-[0_14px_28px_rgba(15,23,42,0.12)]">
                  <div className="relative h-[116px] shrink-0 bg-[#dce9e3] bg-cover bg-center" style={{ backgroundImage: `url("${resolvePublicStorageUrl('avatars', contractor.cover_image_path) || contractorCoverImages[visibleContractors.indexOf(contractor) % contractorCoverImages.length]}")` }}>
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-[9px] font-bold text-[#136f48] shadow-sm"><ShieldCheck className="h-3 w-3" /> Verified</span>
                    <span className="absolute right-2 top-2 text-xl leading-none text-white drop-shadow" aria-hidden="true">♡</span>
                  </div>
                  <div className="relative z-10 flex flex-1 flex-col bg-white p-3 pt-5">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="relative z-20 -mt-9 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#113d3b] text-xl font-bold text-white shadow-sm">
                        {contractor.profile_image_path ? <img src={resolvePublicStorageUrl('avatars', contractor.profile_image_path)} alt="" className="h-full w-full rounded-full object-cover" /> : contractor.business_name.trim().slice(0, 1).toUpperCase() || 'C'}
                      </div>
                      <div className="min-w-0">
                        <h3 className="mt-0.5 truncate text-[13px] font-bold text-slate-900">{contractor.business_name}</h3>
                      </div>
                    </div>
                    {Number(contractor.rating_count) > 0 ? (
                      <div className="flex shrink-0 items-center gap-0.5 text-[9px] font-bold text-slate-700">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                        {Number(contractor.rating_avg).toFixed(1)}
                        <span className="font-normal text-slate-500">({contractor.rating_count})</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Services</p>
                    <div className="mt-1.5 flex min-h-6 flex-wrap gap-1">
                      {offeredServices.length ? (
                        <>
                          {offeredServices.slice(0, 4).map((serviceName) => <span key={serviceName} className="rounded-md border border-[#d7e9de] bg-[#f1f8f4] px-2 py-1 text-[9px] font-medium capitalize text-[#155b3d]">{serviceName.replaceAll('_', ' ')}</span>)}
                          {offeredServices.length > 4 && <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] text-slate-500">+{offeredServices.length - 4} more</span>}
                        </>
                      ) : <span className="text-[10px] text-slate-500">Not listed</span>}
                    </div>
                  </div>
                  <dl className="mt-2 grid grow grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-[9px]">
                    <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Location</dt><dd className="mt-1 flex items-start gap-1 text-slate-600"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#136f48]" /><span className="line-clamp-1">{cities[0] || 'Not listed'}</span></dd></div>
                    <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Budget</dt><dd className="mt-1 text-slate-600">{minBudget != null || maxBudget != null ? `${minBudget != null ? formatCurrency(minBudget) : 'N/A'} – ${maxBudget != null ? formatCurrency(maxBudget) : 'N/A'}` : 'Contact pricing'}</dd></div>
                  </dl>
                  <div className="mt-2">
                    <Link href={`/contractors/${contractor.profile_id}`} className="inline-flex w-full items-center justify-center rounded border border-[#2a8b69] px-2 py-1.5 text-[10px] font-semibold text-[#136f48] transition hover:bg-[#edf8f2]">View Profile</Link>
                  </div>
                  </div>
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
        </div>
      </section>
    </main>
  );
}
