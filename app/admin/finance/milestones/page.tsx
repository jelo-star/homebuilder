'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  DollarSign, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  FileText,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Milestone, Project, MilestoneStatus } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

function cleanMilestoneTitle(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/^Payment\s*\d+:\s*/i, '')
    .replace(/^Milestone\s*\d+:\s*/i, '')
    .replace(/\s*\(\d+%\)/g, '')
    .trim();
}

export default function MilestoneReleasesPage() {
  const [loading, setLoading] = React.useState(true);
  const [milestones, setMilestones] = React.useState<(Milestone & { projects?: Project })[]>([]);
  const [filter, setFilter] = React.useState<MilestoneStatus | 'all'>('proof_submitted');
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
      .from('milestones')
      .select('*, projects(*)')
      .order('created_at', { ascending: false });

    if (queryError) setError(queryError.message);
    setMilestones((data || []) as any);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAuthorizeRelease = async (milestone: Milestone) => {
    setActionLoading(milestone.id);
    setSuccessMsg('');
    setError(null);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Mark milestone as paid
      const { error: updateError } = await supabase
        .from('milestones')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString()
        })
        .eq('id', milestone.id);
      if (updateError) throw updateError;

      // 2. Append release ledger entry
      const { error: ledgerError } = await supabase.from('escrow_ledger').insert({
        project_id: milestone.project_id,
        milestone_id: milestone.id,
        entry_type: 'release',
        amount: milestone.amount,
        note: `Admin authorized contractor payout: ${milestone.name}`
      });
      if (ledgerError) throw ledgerError;

      const commissionAmount = Number(milestone.platform_commission_amount ?? 0);
      if (commissionAmount > 0) {
        const { error: commissionLedgerError } = await supabase.from('escrow_ledger').insert({
          project_id: milestone.project_id,
          milestone_id: milestone.id,
          entry_type: 'fee',
          amount: commissionAmount,
          note: `Homeowner platform commission for ${milestone.name}`
        });
        if (commissionLedgerError) throw commissionLedgerError;
      }

      // 3. Audit log
      const { error: auditError } = await supabase.from('audit_log').insert({
        actor_id: user?.id,
        action: 'authorize_milestone_payment_release',
        entity: 'milestone',
        entity_id: milestone.id,
        details: {
          contractor_amount: milestone.amount,
          commission_amount: commissionAmount,
          homeowner_total_amount: milestone.homeowner_total_amount ?? milestone.amount + commissionAmount,
          milestone_name: milestone.name
        }
      });
      if (auditError) throw auditError;

      setSuccessMsg(
        `Contractor payout of ${formatCurrency(milestone.amount)} authorized; homeowner commission: ${formatCurrency(commissionAmount)}.`
      );
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to authorize milestone release.');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = milestones.filter(m => {
    if (filter === 'all') return true;
    return m.status === filter;
  });

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Milestone Releases & Approvals"
      subtitle="Verify submitted photographic proof, inspect completion criteria, and authorize escrow disbursement"
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

        {/* Status Filters */}
        <div className="flex gap-2">
          {(['proof_submitted', 'approved', 'paid', 'disputed', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === status
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {status.replace('_', ' ')} ({
                milestones.filter(m => status === 'all' ? true : m.status === status).length
              })
            </button>
          ))}
        </div>

        {/* Milestones Queue */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Milestones ({filtered.length})</h2>
            <button
              onClick={() => loadData()}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading milestones...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">No milestones matching filter.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <div key={m.id} className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/40 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">{m.seq}. {cleanMilestoneTitle(m.name)}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        m.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : m.status === 'proof_submitted'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : m.status === 'disputed'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {m.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap gap-2">
                      <span>Project: <strong className="text-slate-800">{m.projects?.title || 'Residential Build'}</strong></span>
                      <span>•</span>
                      <span>Allocation: <strong>{m.percent}%</strong></span>
                      {m.proof_submitted_at && (
                        <>
                          <span>•</span>
                          <span>Proof Submitted: <strong>{formatDate(m.proof_submitted_at)}</strong></span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Milestone Value</div>
                      <div className="text-sm font-bold text-slate-900">{formatCurrency(m.amount)}</div>
                    </div>

                    {m.status === 'proof_submitted' && (
                      <button
                        onClick={() => handleAuthorizeRelease(m)}
                        disabled={actionLoading === m.id}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-xs transition-colors flex items-center gap-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Authorize Release
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
