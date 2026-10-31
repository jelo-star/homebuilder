'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  FileCheck, 
  Search, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  Building2,
  RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Quote, Project, ContractorProfile } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

export default function AdminContractsPage() {
  const [loading, setLoading] = React.useState(true);
  const [quotes, setQuotes] = React.useState<(Quote & { projects?: Project; contractor_profiles?: ContractorProfile })[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'accepted' | 'submitted' | 'declined'>('all');
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from('quotes')
      .select('*, projects!quotes_project_id_fkey(*), contractor_profiles(*)')
      .order('created_at', { ascending: false });

    if (queryError) setError(queryError.message);
    setQuotes((data || []) as any);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = quotes.filter(q => {
    const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
    const matchesSearch = search === '' ||
      q.projects?.title?.toLowerCase().includes(search.toLowerCase()) ||
      q.contractor_profiles?.business_name?.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Bids, Quotations & Construction Contracts"
      subtitle="Complete ledger of contractual proposals, accepted covenants, and pricing terms between parties"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {/* Filter and Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex gap-2">
            {(['all', 'accepted', 'submitted', 'declined'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {status} ({quotes.filter(q => status === 'all' ? true : q.status === status).length})
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search contract, project, builder..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Contracts Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Contract Records ({filtered.length})</h2>
            <button
              onClick={() => loadData()}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading contracts...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">No contracts or bids found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Contractor / Firm</th>
                    <th className="px-4 py-3">Agreed Price</th>
                    <th className="px-4 py-3">Estimated Duration</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Submitted At</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <Link href={`/admin/projects/${q.project_id}`} className="font-semibold text-slate-900 hover:text-blue-600">
                          {q.projects?.title || `Project #${q.project_id.slice(0, 8)}`}
                        </Link>
                        <div className="text-[10px] text-slate-400">{q.projects?.city || '—'}</div>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">
                        {q.contractor_profiles?.business_name || 'Contractor'}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900">
                        {formatCurrency(q.price)}
                      </td>
                      <td className="px-4 py-3.5">{q.duration_months ? `${q.duration_months} months` : 'Not specified'}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          q.status === 'accepted'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : q.status === 'submitted'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-400">{formatDate(q.created_at)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/admin/projects/${q.project_id}`}
                          className="px-2.5 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                        >
                          View Project
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
