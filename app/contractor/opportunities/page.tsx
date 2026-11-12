'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import AppLayout from '@/components/ui/AppLayout';
import {
  Building2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Search,
  FileText,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Project, Quote } from '@/types/database';
import { formatCurrency } from '@/lib/utils/formatters';

const PAGE_SIZE = 12;

function escapeSearchFilter(value: string): string {
  const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[%_]/g, '\\$&');
  return `"%${escapedValue}%"`;
}

export default function OpportunitiesPage() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [opportunities, setOpportunities] = React.useState<Project[]>([]);
  const [myQuotes, setMyQuotes] = React.useState<Record<string, Pick<Quote, 'price'>>>({});
  const [uniqueCities, setUniqueCities] = React.useState<string[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [currentPage, setCurrentPage] = React.useState(0);
  const citiesLoadedRef = React.useRef(false);
  const requestIdRef = React.useRef(0);
  const router = useRouter();

  // Search & Opportunity Filtering State
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCity, setSelectedCity] = React.useState('all');
  const [selectedWorkType, setSelectedWorkType] = React.useState('all');
  const [selectedHouseType, setSelectedHouseType] = React.useState('all');
  const [selectedFinish, setSelectedFinish] = React.useState('all');
  const [successMsg, setSuccessMsg] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');

  const openQuoteModalForProject = (p: Project) => {
    router.push(`/contractor/opportunities/${p.id}/proposal`);
  };

  const loadData = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(authError.message);
      setLoading(false);
      return;
    }
    // Load the complete city filter list independently of the visible project page.
    if (!citiesLoadedRef.current) {
      const allCities: string[] = [];
      let cityOffset = 0;
      while (true) {
        const { data: cities, error: citiesError } = await supabase
          .from('projects')
          .select('city')
          .in('status', ['open', 'quoted'])
          .not('city', 'is', null)
          .order('city')
          .order('id')
          .range(cityOffset, cityOffset + 999);
        if (citiesError) {
          if (requestId !== requestIdRef.current) return;
          setLoadError(citiesError.message);
          setLoading(false);
          return;
        }
        allCities.push(...(cities || []).map(project => project.city).filter(Boolean));
        if (!cities || cities.length < 1000) break;
        cityOffset += 1000;
      }
      setUniqueCities(Array.from(new Set(allCities)).sort());
      citiesLoadedRef.current = true;
    }
    if (requestId !== requestIdRef.current) return;

    // 2. Fetch one server-filtered page of open / quoted projects.
    let projectsQuery = supabase
      .from('projects')
      .select('id, title, city, province, work_type, plan_file_path, house_type, finish_level, floor_area_sqm, floors, bedrooms, est_mid, budget', { count: 'exact' })
      .in('status', ['open', 'quoted'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);
    if (selectedCity !== 'all') projectsQuery = projectsQuery.eq('city', selectedCity);
    if (selectedWorkType !== 'all') projectsQuery = projectsQuery.eq('work_type', selectedWorkType);
    if (selectedHouseType !== 'all') projectsQuery = projectsQuery.eq('house_type', selectedHouseType);
    if (selectedFinish !== 'all') projectsQuery = projectsQuery.eq('finish_level', selectedFinish);
    const normalizedSearch = searchTerm.trim();
    if (normalizedSearch) {
      const escapedSearch = escapeSearchFilter(normalizedSearch);
      projectsQuery = projectsQuery.or(`title.ilike.${escapedSearch},city.ilike.${escapedSearch}`);
    }
    const { data: projs, error: projectsError, count } = await projectsQuery;
    if (projectsError) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(projectsError.message);
      setLoading(false);
      return;
    }
    if (count != null && currentPage > 0 && currentPage * PAGE_SIZE >= count) {
      setCurrentPage(Math.max(0, Math.ceil(count / PAGE_SIZE) - 1));
      return;
    }

    setOpportunities((projs || []) as Project[]);
    setTotalCount(count || 0);

    // 3. Fetch quotes only for projects visible on this page.
    let currentQuotes: Pick<Quote, 'project_id' | 'price'>[] = [];
    const projectIds = (projs || []).map(project => project.id);
    if (user && projectIds.length > 0) {
      const { data: quotes, error: quotesError } = await supabase
        .from('quotes')
        .select('project_id, price')
        .eq('contractor_id', user.id)
        .in('project_id', projectIds);
      if (quotesError) {
        if (requestId !== requestIdRef.current) return;
        setLoadError(quotesError.message);
        setLoading(false);
        return;
      }
      if (quotes && quotes.length > 0) {
        currentQuotes = quotes.filter(quote => projectIds.includes(quote.project_id)) as Pick<Quote, 'project_id' | 'price'>[];
      }
    }

    const quoteMap: Record<string, Pick<Quote, 'price'>> = {};
    currentQuotes.forEach((q) => {
      quoteMap[q.project_id] = { price: q.price };
    });
    if (requestId !== requestIdRef.current) return;
    setMyQuotes(quoteMap);
    setLoadError('');
    setLoading(false);
  }, [currentPage, searchTerm, selectedCity, selectedWorkType, selectedHouseType, selectedFinish]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  const filteredOpportunities = opportunities;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const firstResult = totalCount === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const lastResult = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);

  return (
    <AppLayout
      userRole="contractor"
      title="Project Opportunities & Leads"
      subtitle="Review open homeowner projects and submit a six-category cost breakdown with your bid"
      backHref="/contractor/dashboard"
    >
      <div className="w-full space-y-6">
        {(errorMsg || successMsg) && (
          <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200 space-y-2">
            {errorMsg && (
              <div className="p-4 rounded-xl bg-white border border-red-200 shadow-xl text-red-700 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                  <div className="font-semibold leading-relaxed">{errorMsg}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
                >
                  ?
                </button>
              </div>
            )}
            {successMsg && (
              <div className="p-4 rounded-xl bg-white border border-emerald-200 shadow-xl text-emerald-800 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div className="font-semibold leading-relaxed">{successMsg}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMsg('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
                >
                  ?
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search project title, city, or specifications..."
                value={searchTerm}
                onChange={(e) => {
                  setCurrentPage(0);
                  setSearchTerm(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCity}
                onChange={(e) => {
                  setCurrentPage(0);
                  setSelectedCity(e.target.value);
                }}
                className="text-xs p-2.5 border border-slate-200 rounded-xl bg-white text-slate-700"
              >
                <option value="all">All Locations</option>
                {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <select
                value={selectedWorkType}
                onChange={(e) => {
                  setCurrentPage(0);
                  setSelectedWorkType(e.target.value);
                }}
                className="text-xs p-2.5 border border-slate-200 rounded-xl bg-white text-slate-700"
              >
                <option value="all">All Work Types</option>
                <option value="new_build">New Build</option>
                <option value="renovation">Renovation</option>
                <option value="extension">Extension</option>
              </select>

              <select
                value={selectedHouseType}
                onChange={(e) => {
                  setCurrentPage(0);
                  setSelectedHouseType(e.target.value);
                }}
                className="text-xs p-2.5 border border-slate-200 rounded-xl bg-white text-slate-700"
              >
                <option value="all">All Storeys</option>
                <option value="one_storey">1-Storey</option>
                <option value="two_storey">2-Storey</option>
                <option value="townhouse">Townhouse</option>
              </select>

              <select
                value={selectedFinish}
                onChange={(e) => {
                  setCurrentPage(0);
                  setSelectedFinish(e.target.value);
                }}
                className="text-xs p-2.5 border border-slate-200 rounded-xl bg-white text-slate-700"
              >
                <option value="all">All Finishes</option>
                <option value="basic">Basic</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>

            </div>
          </div>
        </div>

        {/* Opportunities Feed */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(item => <div key={item} className="h-[30rem] animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
          </div>
        ) : loadError ? (
          <div className="p-16 text-center text-xs text-red-600 bg-white rounded-2xl border border-red-200">{loadError}</div>
        ) : filteredOpportunities.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-2">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-800 text-sm">
              {totalCount > 0 ? 'No high-match opportunities on this page' : 'No open project opportunities yet'}
            </div>
            <p className="text-slate-400">
              {totalCount > 0
                ? 'Use the page controls below to browse more opportunities matching your filters.'
                : 'When a homeowner publishes a new project, it will appear here for you to submit a project cost breakdown.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOpportunities.map((p) => {
              const existingQuote = myQuotes[p.id];

              return (
                <div
                  key={p.id}
                  className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  {/* Project Image Banner */}
                  <div className="relative aspect-video w-full overflow-hidden bg-slate-100 flex items-center justify-center">
                    {p.plan_file_path ? (
                      <Image src={p.plan_file_path} alt={`${p.title} project`} fill unoptimized className="object-cover" />
                    ) : (
                      <Building2 className="w-10 h-10 text-slate-300" />
                    )}
                    <div className="absolute top-3 right-3">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/95 text-blue-700 shadow-xs border border-white uppercase tracking-wider">
                        {p.work_type.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{p.title}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{p.city}{p.province ? `, ${p.province}` : ''}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs py-1 border-t border-b border-slate-100 text-slate-600">
                      <div>
                        <span className="text-slate-400">Area:</span> <strong className="text-slate-900">{p.floor_area_sqm != null ? `${p.floor_area_sqm} sq.m` : 'Not provided'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Floors:</span> <strong className="text-slate-900">{p.floors != null ? `${p.floors} Storey` : 'Not provided'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Finish:</span> <strong className="capitalize text-slate-900">{p.finish_level}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Bedrooms:</span> <strong className="text-slate-900">{p.bedrooms ?? 'Not provided'}</strong>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Estimated Project Cost:</span>
                        <span className="font-bold text-slate-900">
                          {p.est_mid != null ? formatCurrency(p.est_mid) : 'Not provided'}
                        </span>
                      </div>
                      {p.budget != null && (
                        <div className="flex justify-between items-center text-[11px] text-slate-500">
                          <span>Homeowner&apos;s Target Budget:</span>
                          <span className="font-semibold text-slate-700">{formatCurrency(p.budget)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="px-6 pb-6 pt-3 border-t border-slate-100 space-y-2">
                    {existingQuote ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span>Proposal submitted</span>
                          </div>
                          <div className="mt-1 text-sm font-extrabold text-slate-900">
                            {formatCurrency(existingQuote.price)}
                          </div>
                        </div>
                        <Link
                          href={`/contractor/opportunities/${p.id}`}
                          className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100"
                        >
                          View / Revise
                        </Link>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Link
                          href={`/contractor/opportunities/${p.id}`}
                          className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors text-center"
                        >
                          Details
                        </Link>
                        <button
                          type="button"
                          onClick={() => openQuoteModalForProject(p)}
                          className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Enter Project Cost Breakdown</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !loadError && totalPages > 0 && (
          <nav aria-label="Opportunity pages" className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-600" aria-live="polite">
              {`Showing ${firstResult}–${lastResult} of ${totalCount} opportunities`}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentPage(page => Math.max(0, page - 1))}
                disabled={currentPage === 0}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-slate-600" aria-label={`Page ${currentPage + 1} of ${totalPages}`}>
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(page => Math.min(totalPages - 1, page + 1))}
                disabled={currentPage >= totalPages - 1}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </nav>
        )}

      </div>
    </AppLayout>
  );
}
