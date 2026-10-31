'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  ArrowLeftRight, 
  DollarSign, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  Building2,
  RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Payout, EscrowLedger, ContractorProfile } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

export default function PayoutsAndRefundsPage() {
  const [loading, setLoading] = React.useState(true);
  const [payouts, setPayouts] = React.useState<Payout[]>([]);
  const [refunds, setRefunds] = React.useState<EscrowLedger[]>([]);
  const [activeTab, setActiveTab] = React.useState<'payouts' | 'refunds'>('payouts');
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

    const { data: pData, error: payoutsError } = await supabase
      .from('payouts')
      .select('*, contractor_profiles(*)')
      .order('created_at', { ascending: false });
    if (payoutsError) setError(payoutsError.message);
    setPayouts((pData || []) as any);

    const { data: rData, error: refundsError } = await supabase
      .from('escrow_ledger')
      .select('*, projects(*)')
      .eq('entry_type', 'refund')
      .order('created_at', { ascending: false });
    if (refundsError) setError(current => current ? `${current}; ${refundsError.message}` : refundsError.message);
    setRefunds((rData || []) as any);

    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleProcessPayout = async (payoutId: string) => {
    setActionLoading(payoutId);
    setSuccessMsg('');
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from('payouts')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', payoutId);
      if (updateError) throw updateError;

      const { error: auditError } = await supabase.from('audit_log').insert({
        actor_id: user?.id,
        action: 'execute_contractor_payout',
        entity: 'payout',
        entity_id: payoutId,
        details: { status: 'sent' }
      });
      if (auditError) throw auditError;

      setSuccessMsg('Payout marked as sent.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update payout.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Refunds & Contractor Disbursements"
      subtitle="Supervise banking transfers, milestone contractor payouts, and verified homeowner dispute refunds"
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

        {/* Tab Toggle */}
        <div className="flex border-b border-slate-200 gap-6">
          <button
            onClick={() => setActiveTab('payouts')}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'payouts'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Contractor Payouts ({payouts.length})
          </button>
          <button
            onClick={() => setActiveTab('refunds')}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'refunds'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Homeowner Refunds ({refunds.length})
          </button>
        </div>

        {/* Tab 1: Payouts */}
        {activeTab === 'payouts' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="font-semibold text-slate-900 text-sm">Disbursement Batches ({payouts.length})</h2>
              <button onClick={() => loadData()} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading disbursements...</div>
            ) : payouts.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">No payout batches awaiting disbursement.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {payouts.map((p) => (
                  <div key={p.id} className="p-4 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{(p as any).contractor_profiles?.business_name || 'Contractor'}</div>
                      <div className="text-slate-400">Milestone #{p.milestone_id.slice(0, 8)} • Gross: {formatCurrency(p.gross_amount)} • Platform Fee: {formatCurrency(p.fee_amount)}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Net Transfer</div>
                        <div className="font-bold text-slate-900">{formatCurrency(p.net_amount)}</div>
                      </div>
                      {p.status === 'pending' && (
                        <button
                          onClick={() => handleProcessPayout(p.id)}
                          disabled={actionLoading === p.id}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-xs transition-colors"
                        >
                          Execute Transfer
                        </button>
                      )}
                      {p.status === 'sent' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Disbursed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Refunds */}
        {activeTab === 'refunds' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="font-semibold text-slate-900 text-sm">Executed Homeowner Refunds ({refunds.length})</h2>
            </div>
            {refunds.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">No dispute refunds recorded.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {refunds.map((r) => (
                  <div key={r.id} className="p-4 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{r.note || 'Dispute Refund'}</div>
                      <div className="text-slate-400">Project: {(r as any).projects?.title || 'Residential Build'} • Processed: {formatDate(r.created_at)}</div>
                    </div>
                    <div className="text-right font-bold text-slate-900">
                      {formatCurrency(r.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
