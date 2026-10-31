'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { ChevronLeft, ChevronRight, Eye, RefreshCw, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ProjectStatus } from '@/types/database';

const PAGE_SIZE = 25;
const PROJECT_STATUSES = ['open', 'quoted', 'awarded', 'in_progress', 'completed', 'disputed'] as const;

interface AdminProjectRow {
  id: string;
  title: string;
  status: ProjectStatus;
  city: string | null;
  province: string | null;
  budget: number | null;
  est_mid: number | null;
  profiles: { full_name: string | null }[] | { full_name: string | null } | null;
  quotes: Array<{
    status: string;
    price: number | string | null;
    contractor_profiles: { business_name: string | null }[] | { business_name: string | null } | null;
  }>;
}

function removeUnderscore(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export default function AdminProjectsPage() {
  const [loading, setLoading] = React.useState(true);
  const [projects, setProjects] = React.useState<AdminProjectRow[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<ProjectStatus | 'all'>('all');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [resultCount, setResultCount] = React.useState(0);
  const [statusCounts, setStatusCounts] = React.useState<Record<string, number>>({});
  const [error, setError] = React.useState<string | null>(null);
  const loadRequestId = React.useRef(0);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadData = React.useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    let query = supabase
      .from('projects')
      .select('id, title, status, city, province, budget, est_mid, created_at, profiles:homeowner_id(full_name), quotes!quotes_project_id_fkey(status, price, contractor_profiles(business_name))', { count: 'exact' });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (debouncedSearch) {
      const escapedSearch = debouncedSearch
        .replace(/[%_*\\]/g, character => `\\${character}`)
        .replace(/"/g, '\\"');
      const pattern = `"%${escapedSearch}%"`;
      query = query.or(
        `title.ilike.${pattern},city.ilike.${pattern},profiles.full_name.ilike.${pattern}`
      );
    }

    const { data, count, error: queryError } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (requestId !== loadRequestId.current) return;
    if (queryError) {
      setError(queryError.message);
      setProjects([]);
      setResultCount(0);
      setLoading(false);
      return;
    }
    setProjects((data || []) as AdminProjectRow[]);
    setResultCount(count || 0);
    setLoading(false);
  }, [debouncedSearch, page, statusFilter]);

  const loadStatusCounts = React.useCallback(async () => {
    const supabase = createClient();
    const [allProjects, ...statusResults] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }),
      ...PROJECT_STATUSES.map(status =>
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', status)
      ),
    ]);

    const failedResult = [allProjects, ...statusResults].find(result => result.error);
    if (failedResult?.error) {
      setStatusCounts({});
      setError(failedResult.error.message);
      return;
    }
    setStatusCounts({
      all: allProjects.count || 0,
      ...Object.fromEntries(PROJECT_STATUSES.map((status, index) => [
        status,
        statusResults[index].count || 0,
      ])),
    });
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadStatusCounts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStatusCounts]);

  const handleRefresh = () => {
    void loadData();
    void loadStatusCounts();
  };

  const changeStatus = (status: ProjectStatus | 'all') => {
    setStatusFilter(status);
    setPage(1);
  };

  const pageCount = Math.max(1, Math.ceil(resultCount / PAGE_SIZE));
  const firstResult = resultCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, resultCount);

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Platform Projects & Construction"
      subtitle="Complete ledger of residential builds, milestone progressions, and site contract statuses"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {(['all', ...PROJECT_STATUSES] as const).map((status) => (
              <button
                key={status}
                onClick={() => changeStatus(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {removeUnderscore(status)} ({statusCounts[status] ?? '…'})
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search project, owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Projects List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Projects ({resultCount})</h2>
            <button
              onClick={handleRefresh}
              disabled={loading}
              aria-label="Refresh project list"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">No projects found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Project Title</th>
                    <th className="px-4 py-3">Homeowner</th>
                    <th className="px-4 py-3">Contractor</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projects.map((p) => {
                    const isAwardedOrProgress = p.status === 'awarded' || p.status === 'project_planning' || p.status === 'in_progress' || p.status === 'completed';
                    const acceptedQuote = p.quotes.find(q => q.status === 'accepted')
                      || p.quotes[0];
                    const homeowner = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
                    const contractorProfile = Array.isArray(acceptedQuote?.contractor_profiles)
                      ? acceptedQuote.contractor_profiles[0]
                      : acceptedQuote?.contractor_profiles;

                    const contractorName = contractorProfile?.business_name
                      || '—';

                    const projectCost = acceptedQuote?.price 
                      ? Number(acceptedQuote.price) 
                      : (Number(p.budget) || Number(p.est_mid) || 0);

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        {/* 1. PROJECT TITLE (Clean - NO raw ID underneath) */}
                        <td className="px-4 py-3.5">
                          <Link href={`/admin/projects/${p.id}`} className="font-bold text-slate-900 hover:text-blue-600 transition-colors text-xs">
                            {p.title}
                          </Link>
                        </td>

                        {/* 2. HOMEOWNER (Clean - NO location underneath) */}
                        <td className="px-4 py-3.5 font-semibold text-slate-800">
                          {homeowner?.full_name || 'Homeowner'}
                        </td>

                        {/* 3. CONTRACTOR */}
                        <td className="px-4 py-3.5">
                          <span className={`font-medium ${isAwardedOrProgress ? 'text-slate-900 font-semibold' : 'text-slate-400 italic'}`}>
                            {contractorName}
                          </span>
                        </td>

                        {/* 4. LOCATION */}
                        <td className="px-4 py-3.5 text-slate-700">
                          {[p.city, p.province].filter(Boolean).join(', ') || 'Location unavailable'}
                        </td>

                        {/* 5. COST (When awarded, shows actual project cost/contract price) */}
                        <td className="px-4 py-3.5">
                          <div className="font-mono font-black text-slate-900 text-sm">
                            ₱{projectCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                          {isAwardedOrProgress ? (
                            <span className="text-[10px] font-bold text-emerald-700 font-sans block">
                              Agreed Project Cost
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-sans block">
                              Est. Budget
                            </span>
                          )}
                        </td>

                        {/* 6. STATUS */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            p.status === 'awarded'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : p.status === 'in_progress'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : p.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : p.status === 'disputed'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {removeUnderscore(p.status)}
                          </span>
                        </td>

                        {/* 7. ACTION BUTTON: OVERVIEW */}
                        <td className="px-4 py-3.5 text-right">
                          <Link
                            href={`/admin/projects/${p.id}`}
                            className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors inline-flex items-center gap-1 shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Overview</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {resultCount > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Showing {firstResult}–{lastResult} of {resultCount} projects</span>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPage(currentPage => Math.max(1, currentPage - 1))}
                  disabled={loading || page <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                <span>Page {page} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage => Math.min(pageCount, currentPage + 1))}
                  disabled={loading || page >= pageCount}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
