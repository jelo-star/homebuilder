'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  History, 
  Search, 
  ShieldCheck, 
  Clock, 
  FileText, 
  RefreshCw,
  Filter
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AuditLog } from '@/types/database';
import { formatDate } from '@/lib/utils/formatters';

export default function AuditLogsPage() {
  const [loading, setLoading] = React.useState(true);
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (queryError) setError(queryError.message);
    setLogs((data || []) as AuditLog[]);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = logs.filter(l => {
    return search === '' ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.entity.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(l.details || {}).toLowerCase().includes(search.toLowerCase());
  });

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Immutable Administrative Audit Trails"
      subtitle="Cryptographically tracked log of all administrative actions, financial disbursements, and policy adjudications"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {/* Search */}
        <div className="flex justify-between items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by action, entity, parameters..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => loadData()}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Audit Log Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Audit Records ({filtered.length})</h2>
            <span className="text-[11px] text-slate-400">Append-only • Non-repudiable</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading audit records...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">No audit events recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Timestamp (PHT)</th>
                    <th className="px-4 py-3">Action Event</th>
                    <th className="px-4 py-3">Entity Type</th>
                    <th className="px-4 py-3">Entity ID</th>
                    <th className="px-4 py-3">Parameters / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3.5 text-slate-400 font-mono text-[11px]">
                        {formatDate(l.created_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          {l.action}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700 capitalize">
                        {l.entity.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">
                        {l.entity_id ? l.entity_id.slice(0, 13) : 'System-wide'}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 font-mono text-[11px] max-w-[320px] truncate" title={JSON.stringify(l.details || {})}>
                        {JSON.stringify(l.details || {})}
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
