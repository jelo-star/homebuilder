'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  ShieldAlert, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Flag,
  UserX,
  RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { FraudReport, Profile } from '@/types/database';
import { formatDate } from '@/lib/utils/formatters';

export default function FraudMonitoringPage() {
  const [loading, setLoading] = React.useState(true);
  const [reports, setReports] = React.useState<FraudReport[]>([]);
  const [filter, setFilter] = React.useState<string>('all');
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from('fraud_reports')
      .select('*, reporter:reporter_id(*), reported_user:reported_user_id(*)')
      .order('created_at', { ascending: false });

    if (queryError) setError(queryError.message);
    setReports((data || []) as any);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleResolveReport = async (reportId: string, status: 'resolved_action_taken' | 'resolved_dismissed') => {
    setActionLoading(reportId);
    setSuccessMsg('');
    setError(null);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from('fraud_reports')
        .update({
          status,
          investigated_by: user?.id,
          resolved_at: new Date().toISOString()
        })
        .eq('id', reportId);
      if (updateError) throw updateError;

      const { error: auditError } = await supabase.from('audit_log').insert({
        actor_id: user?.id,
        action: `fraud_report_${status}`,
        entity: 'fraud_report',
        entity_id: reportId,
        details: { status }
      });
      if (auditError) throw auditError;

      setSuccessMsg(`Incident report marked as ${status.replace('resolved_', '')}!`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update incident report.');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = reports.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Trust, Fraud & Incident Surveillance"
      subtitle="Investigate suspicious bidding anomalies, contractor misconduct, and platform policy infractions"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {successMsg && (
          <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
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
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex gap-2">
          {(['all', 'pending', 'investigating', 'resolved_action_taken', 'resolved_dismissed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === s
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {s.replace('resolved_', '').replace('_', ' ')} ({reports.filter(r => s === 'all' ? true : r.status === s).length})
            </button>
          ))}
        </div>

        {/* Fraud Queue */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Complaint Dossiers ({filtered.length})</h2>
            <button onClick={() => loadData()} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading incident records...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">No incident reports matching filter.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <div key={r.id} className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/40 transition-colors">
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                      <span className="font-semibold text-slate-900 text-sm">{r.category}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                        {r.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">
                      "{r.description}"
                    </p>
                    <div className="text-[11px] text-slate-400">
                      Filed by: <strong>{r.reporter?.full_name || 'Anonymous User'}</strong> • Filed: {formatDate(r.created_at)}
                    </div>
                  </div>

                  {r.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleResolveReport(r.id, 'resolved_action_taken')}
                        disabled={actionLoading === r.id}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium shadow-xs transition-colors"
                      >
                        Enforce Penalty
                      </button>
                      <button
                        onClick={() => handleResolveReport(r.id, 'resolved_dismissed')}
                        disabled={actionLoading === r.id}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
