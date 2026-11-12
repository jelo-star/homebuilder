'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import {
  Landmark,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowDownLeft,
  ShieldCheck,
  Eye,
  FileText,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Payout, EscrowLedger, PaymentTransactionRecord } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

const PAGE_SIZE = 25;

function groupByProject<T extends { project_id?: string | null }>(records: T[]) {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const projectId = record.project_id || '';
    const projectRecords = grouped.get(projectId) || [];
    projectRecords.push(record);
    grouped.set(projectId, projectRecords);
  }
  return Array.from(grouped, ([projectId, projectRecords]) => ({
    projectId,
    records: projectRecords,
  }));
}

function groupReleasedMilestonePayments(records: PaymentTransactionRecord[]) {
  const grouped = new Map<string, PaymentTransactionRecord[]>();
  const rows: Array<{ key: string; transactions: PaymentTransactionRecord[] }> = [];

  for (const transaction of records) {
    const isReleased = transaction.payout_status === 'PAID' || transaction.payout_status === 'RELEASED';
    if (!isReleased || !transaction.project_id) {
      rows.push({ key: transaction.id, transactions: [transaction] });
      continue;
    }

    const milestoneKey = transaction.milestone_id || 'project-funding';
    const key = `${transaction.project_id}:${milestoneKey}`;
    const transactions = grouped.get(key) || [];
    transactions.push(transaction);
    grouped.set(key, transactions);
  }

  for (const [key, transactions] of grouped) {
    rows.push({ key, transactions });
  }

  return rows.sort((a, b) => {
    const aCreatedAt = Math.max(...a.transactions.map(transaction => Date.parse(transaction.created_at) || 0));
    const bCreatedAt = Math.max(...b.transactions.map(transaction => Date.parse(transaction.created_at) || 0));
    return bCreatedAt - aCreatedAt;
  });
}

function PaginationControls({
  label,
  page,
  totalItems,
  onPageChange,
}: {
  label: string;
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * PAGE_SIZE, totalItems);

  if (totalItems <= PAGE_SIZE) return null;

  return (
    <nav aria-label={`${label} pagination`} className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs">
      <span aria-live="polite" className="text-slate-500">
        Showing {firstItem}–{lastItem} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Previous ${label} page`}
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span aria-current="page" className="whitespace-nowrap text-slate-600">
          Page {currentPage} of {totalPages}
        </span>
        <button
          type="button"
          aria-label={`Next ${label} page`}
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export default function ContractorPaymentsPage() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [proofError, setProofError] = React.useState('');
  const [payouts, setPayouts] = React.useState<Payout[]>([]);
  const [ledgerEntries, setLedgerEntries] = React.useState<EscrowLedger[]>([]);
  const [homeownerSubmissions, setHomeownerSubmissions] = React.useState<PaymentTransactionRecord[]>([]);
  const [projectTitles, setProjectTitles] = React.useState<Record<string, string>>({});
  const [payoutCount, setPayoutCount] = React.useState(0);
  const [ledgerCount, setLedgerCount] = React.useState(0);
  const [submissionCount, setSubmissionCount] = React.useState(0);
  const [proofTransactionIds, setProofTransactionIds] = React.useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = React.useState<'homeowner_payments' | 'payouts' | 'ledger'>('homeowner_payments');
  const [submissionPage, setSubmissionPage] = React.useState(1);
  const [payoutPage, setPayoutPage] = React.useState(1);
  const [ledgerPage, setLedgerPage] = React.useState(1);
  const [pageLoading, setPageLoading] = React.useState(true);
  const [contractorId, setContractorId] = React.useState('');
  const [proofLoadingId, setProofLoadingId] = React.useState<string | null>(null);
  const initialPageLoadComplete = React.useRef(false);
  const pageRequestId = React.useRef(0);
  const [inspectingPayoutProof, setInspectingPayoutProof] = React.useState<{
    url: string;
    ref: string;
    amount: number;
    method?: string;
    date?: string | null;
  } | null>(null);
  const homeownerPaymentRows = React.useMemo(
    () => groupReleasedMilestonePayments(homeownerSubmissions),
    [homeownerSubmissions],
  );

  const loadData = React.useCallback(async () => {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoadError(authError.message);
      setLoading(false);
      setPageLoading(false);
      return;
    }

    if (user) {
      setContractorId(user.id);
      const [
        { data: pData, error: payoutsError, count: payoutTotal },
        { data: lData, error: ledgerError, count: ledgerTotal },
        { data: txData, error: transactionsError, count: submissionTotal },
      ] = await Promise.all([
        supabase
          .from('payouts')
          .select('id, project_id, status, net_amount, fee_amount, gross_amount, sent_at, created_at, provider_ref', { count: 'exact' })
          .eq('contractor_id', user.id)
          .range(0, PAGE_SIZE - 1)
          .order('created_at', { ascending: false }),
        supabase
          .from('escrow_ledger')
          .select('id, project_id, entry_type, note, created_at, amount', { count: 'exact' })
          .or(`to_party.eq.${user.id},from_party.eq.${user.id}`)
          .range(0, PAGE_SIZE - 1)
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_transactions')
          .select('id, project_id, transaction_ref, payment_method, provider, sender_name, provider_tx_ref, amount_centavos, payment_status, payout_status, payout_tx_ref, net_amount_centavos, verified_at, created_at', { count: 'exact' })
          .eq('recipient_id', user.id)
          .range(0, PAGE_SIZE - 1)
          .order('created_at', { ascending: false }),
      ]);
      const queryError = payoutsError || ledgerError || transactionsError;
      if (queryError) {
        setLoadError(queryError.message);
        setLoading(false);
        setPageLoading(false);
        return;
      }

      const projectIds = Array.from(new Set([
        ...(pData || []).map(payout => payout.project_id),
        ...(lData || []).map(entry => entry.project_id),
        ...(txData || []).map(transaction => transaction.project_id),
      ].filter((projectId): projectId is string => Boolean(projectId))));
      const { data: projectData, error: projectsError } = projectIds.length
        ? await supabase.from('projects').select('id, title').in('id', projectIds)
        : { data: [], error: null };
      if (projectsError) {
        setLoadError(projectsError.message);
        setLoading(false);
        setPageLoading(false);
        return;
      }

      setPayouts((pData || []) as Payout[]);
      setLedgerEntries((lData || []) as EscrowLedger[]);
      setHomeownerSubmissions((txData || []) as PaymentTransactionRecord[]);
      setProjectTitles(Object.fromEntries((projectData || []).map(project => [project.id, project.title])));
      setPayoutCount(payoutTotal ?? pData?.length ?? 0);
      setLedgerCount(ledgerTotal ?? lData?.length ?? 0);
      setSubmissionCount(submissionTotal ?? txData?.length ?? 0);
      setPayoutPage(1);
      setLedgerPage(1);
      setSubmissionPage(1);

      const proofIdsResult = txData?.length
        ? await supabase
            .from('payment_transactions')
            .select('id')
            .eq('recipient_id', user.id)
            .in('id', txData.map(tx => tx.id))
            .not('payout_proof_url', 'is', null)
        : { data: [], error: null };
      if (proofIdsResult.error) {
        setLoadError(proofIdsResult.error.message);
        setLoading(false);
        setPageLoading(false);
        return;
      }
      setProofTransactionIds(new Set((proofIdsResult.data || []).map(row => row.id)));
    } else {
      setPayoutCount(0);
      setLedgerCount(0);
      setSubmissionCount(0);
    }

    setLoadError('');
    setLoading(false);
    setPageLoading(false);
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    if (!contractorId) return;
    if (!initialPageLoadComplete.current) {
      initialPageLoadComplete.current = true;
      return;
    }

    async function loadCurrentPages() {
      const requestId = ++pageRequestId.current;
      setPageLoading(true);
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (requestId !== pageRequestId.current) return;
      if (authError || !user || user.id !== contractorId) {
        setLoadError('You are no longer authorized to view these payment records.');
        setPageLoading(false);
        return;
      }

      const [
        { data: pData, error: payoutsError, count: payoutTotal },
        { data: lData, error: ledgerError, count: ledgerTotal },
        { data: txData, error: transactionsError, count: submissionTotal },
      ] = await Promise.all([
        supabase
          .from('payouts')
          .select('id, project_id, status, net_amount, fee_amount, gross_amount, sent_at, created_at, provider_ref', { count: 'exact' })
          .eq('contractor_id', user.id)
          .range((payoutPage - 1) * PAGE_SIZE, payoutPage * PAGE_SIZE - 1)
          .order('created_at', { ascending: false }),
        supabase
          .from('escrow_ledger')
          .select('id, project_id, entry_type, note, created_at, amount', { count: 'exact' })
          .or(`to_party.eq.${user.id},from_party.eq.${user.id}`)
          .range((ledgerPage - 1) * PAGE_SIZE, ledgerPage * PAGE_SIZE - 1)
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_transactions')
          .select('id, project_id, transaction_ref, payment_method, provider, sender_name, provider_tx_ref, amount_centavos, payment_status, payout_status, payout_tx_ref, net_amount_centavos, verified_at, created_at', { count: 'exact' })
          .eq('recipient_id', user.id)
          .range((submissionPage - 1) * PAGE_SIZE, submissionPage * PAGE_SIZE - 1)
          .order('created_at', { ascending: false }),
      ]);
      const queryError = payoutsError || ledgerError || transactionsError;
      if (requestId !== pageRequestId.current) return;
      if (queryError) {
        setLoadError(queryError.message);
        setPageLoading(false);
        return;
      }

      const projectIds = Array.from(new Set([
        ...(pData || []).map(payout => payout.project_id),
        ...(lData || []).map(entry => entry.project_id),
        ...(txData || []).map(transaction => transaction.project_id),
      ].filter((projectId): projectId is string => Boolean(projectId))));
      const [proofIdsResult, projectsResult] = await Promise.all([
        txData?.length
          ? supabase
            .from('payment_transactions')
            .select('id')
            .eq('recipient_id', user.id)
            .in('id', txData.map(tx => tx.id))
            .not('payout_proof_url', 'is', null)
          : Promise.resolve({ data: [], error: null }),
        projectIds.length
          ? supabase.from('projects').select('id, title').in('id', projectIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (requestId !== pageRequestId.current) return;
      if (proofIdsResult.error || projectsResult.error) {
        setLoadError(proofIdsResult.error?.message || projectsResult.error?.message || 'Unable to load payment project details.');
        setPageLoading(false);
        return;
      }

      setPayouts((pData || []) as Payout[]);
      setLedgerEntries((lData || []) as EscrowLedger[]);
      setHomeownerSubmissions((txData || []) as PaymentTransactionRecord[]);
      setProjectTitles(Object.fromEntries((projectsResult.data || []).map(project => [project.id, project.title])));
      setProofTransactionIds(new Set((proofIdsResult.data || []).map(row => row.id)));
      setPayoutCount(payoutTotal ?? pData?.length ?? 0);
      setLedgerCount(ledgerTotal ?? lData?.length ?? 0);
      setSubmissionCount(submissionTotal ?? txData?.length ?? 0);
      setPayoutPage(page => Math.min(page, Math.max(1, Math.ceil((payoutTotal ?? 0) / PAGE_SIZE))));
      setLedgerPage(page => Math.min(page, Math.max(1, Math.ceil((ledgerTotal ?? 0) / PAGE_SIZE))));
      setSubmissionPage(page => Math.min(page, Math.max(1, Math.ceil((submissionTotal ?? 0) / PAGE_SIZE))));
      setLoadError('');
      setPageLoading(false);
    }

    void loadCurrentPages();
  }, [contractorId, ledgerPage, payoutPage, submissionPage]);

  const inspectPayoutProof = async (tx: PaymentTransactionRecord) => {
    setProofError('');
    setProofLoadingId(tx.id);
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== contractorId) {
      setProofError('You are no longer authorized to view this proof.');
      setProofLoadingId(null);
      return;
    }

    const { data, error } = await supabase
      .from('payment_transactions')
      .select('payout_proof_url, payout_tx_ref, amount_centavos, payment_method, verified_at')
      .eq('id', tx.id)
      .eq('recipient_id', user.id)
      .maybeSingle();

    if (error || !data?.payout_proof_url) {
      setProofError('The transfer proof is unavailable or you do not have permission to view it.');
      setProofLoadingId(null);
      return;
    }

    setInspectingPayoutProof({
      url: data.payout_proof_url,
      ref: data.payout_tx_ref || 'Not provided',
      amount: (data.amount_centavos || 0) / 100,
      method: data.payment_method,
      date: data.verified_at,
    });
    setProofLoadingId(null);
  };

  return (
    <AppLayout
      userRole="contractor"
      title="Project Payments & Financial History"
      subtitle="Review homeowner payments, contractor payouts, and escrow activity grouped by project"
      backHref="/contractor/dashboard"
    >
      <div className="w-full space-y-6">
        {loadError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{loadError}</div>}
        {proofError && <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{proofError}</div>}
        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab('homeowner_payments')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'homeowner_payments'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Homeowner Payments & Verification ({homeownerPaymentRows.length})
          </button>
          <button
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'payouts'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Contractor Payouts Disbursed ({payoutCount})
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'ledger'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Escrow Audit Ledger ({ledgerCount})
          </button>
        </div>

        {/* TAB 1: HOMEOWNER PAYMENTS */}
        {activeTab === 'homeowner_payments' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Homeowner Payment Submissions on Your Projects</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Distinguishes payments awaiting admin bank reconciliation from verified received funds</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {homeownerPaymentRows.length} {homeownerPaymentRows.length === 1 ? 'Payment entry' : 'Payment entries'}
              </span>
            </div>

            {loading || pageLoading ? (
              <div className="p-12 text-center text-xs text-slate-500">Loading payment records...</div>
            ) : submissionCount === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500 space-y-1">
                <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <div>No homeowner payment submissions recorded yet.</div>
                <p className="text-[11px] text-slate-400">When your client submits an external transfer slip or reference, it will display here with its audit verification status.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">Channel / Provider</th>
                      <th className="py-3 px-4">Payer Name</th>
                      <th className="py-3 px-4">Bank Trace Ref #</th>
                      <th className="py-3 px-4">Gross Amount</th>
                      <th className="py-3 px-4">Homeowner Payment Status</th>
                      <th className="py-3 px-4">Contractor Payout Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {groupByProject(homeownerPaymentRows.map(row => ({
                      ...row,
                      project_id: row.transactions[0]?.project_id || null,
                    }))).map(({ projectId, records }) => (
                      <React.Fragment key={projectId || 'unassigned'}>
                        <tr className="bg-blue-50/70 text-slate-800">
                          <th colSpan={6} className="px-4 py-2.5 text-left font-bold">
                            Project: {projectTitles[projectId] || (projectId ? 'Project details unavailable' : 'Unassigned project')}
                          </th>
                        </tr>
                        {records.map(({ key, transactions }) => {
                          const tx = transactions[0];
                          if (!tx) return null;
                          const amountCentavos = transactions.reduce(
                            (total, transaction) => total + (transaction.amount_centavos || 0),
                            0,
                          );
                          const isCombined = transactions.length > 1;
                          const isPending = tx.payment_status === 'PENDING_VERIFICATION' || tx.payment_status === 'PENDING';
                          const isPaid = transactions.every(transaction =>
                            transaction.payment_status === 'PAID' || transaction.payment_status === 'SUCCEEDED'
                          );
                          const isRejected = tx.payment_status === 'REJECTED';
                          const payoutStat = transactions.every(transaction =>
                            transaction.payout_status === 'PAID' || transaction.payout_status === 'RELEASED'
                          )
                            ? 'RELEASED'
                            : tx.payout_status === 'NOT_DUE' ? 'NOT_READY' : tx.payout_status;
                          const proofTransaction = transactions.find(transaction => proofTransactionIds.has(transaction.id));

                          return (
                            <tr key={key} className="hover:bg-slate-50/50">
                          <td className="py-3.5 px-4 font-medium capitalize">
                            {isCombined ? 'Combined payments' : tx.provider || tx.payment_method.replace('_', ' ')}
                          </td>
                          <td className="py-3.5 px-4">
                            {isCombined ? `${transactions.length} payments` : tx.sender_name || 'Homeowner'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-blue-700 font-semibold">
                            {isCombined ? 'Multiple payments' : tx.provider_tx_ref || '—'}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            ₱{(amountCentavos / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-3.5 px-4">
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                PAID (Admin Verified)
                              </span>
                            ) : isPending ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />
                                PENDING VERIFICATION
                              </span>
                            ) : isRejected ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                REJECTED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                {tx.payment_status?.replace(/_/g, ' ')}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                payoutStat === 'RELEASED' || payoutStat === 'PAID'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : payoutStat === 'PENDING' || payoutStat === 'PROCESSING'
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {payoutStat ? (payoutStat === 'PAID' ? 'RELEASED' : payoutStat.replace(/_/g, ' ')) : 'Not provided'}
                              </span>
                              {proofTransaction && (
                                <button
                                  type="button"
                                  disabled={proofLoadingId === proofTransaction.id}
                                  onClick={() => void inspectPayoutProof(proofTransaction)}
                                  className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold border border-indigo-200 transition flex items-center gap-1"
                                  title="View disbursement proof uploaded by Admin"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>{proofLoadingId === proofTransaction.id ? 'Loading…' : 'Proof'}</span>
                                </button>
                              )}
                            </div>
                          </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !pageLoading && submissionCount > 0 && (
              <PaginationControls
                label="Homeowner payment"
                page={submissionPage}
                totalItems={submissionCount}
                onPageChange={setSubmissionPage}
              />
            )}
          </div>
        )}

        {/* TAB 2: PAYOUT DISBURSEMENTS */}
        {activeTab === 'payouts' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Disbursement Payout Records</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Authoritative bank and e-wallet milestone payouts</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{payoutCount} Disbursements</span>
            </div>

            {pageLoading ? (
              <div className="p-12 text-center text-xs text-slate-500">Loading payout records...</div>
            ) : payoutCount === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500 space-y-1">
                <Landmark className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <div>No payout disbursements executed yet.</div>
                <p className="text-[11px] text-slate-400">Payouts appear once milestone progress proofs are signed off and released by the administrator.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {groupByProject(payouts).map(({ projectId, records }) => (
                  <section key={projectId || 'unassigned'}>
                    <h3 className="bg-blue-50/70 px-4 py-2.5 font-bold text-slate-800">
                      Project: {projectTitles[projectId] || (projectId ? 'Project details unavailable' : 'Unassigned project')}
                    </h3>
                    {records.map((p) => (
                      <div key={p.id} className="p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                            <ArrowDownLeft className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">Milestone Payout Release</div>
                            <div className="text-[11px] text-slate-400">
                              Disbursed: {formatDate(p.sent_at || p.created_at)} • Ref: {p.provider_ref?.replace(/_/g, ' ') || 'Not provided'}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-emerald-700 text-sm">{formatCurrency(p.net_amount)}</div>
                          {p.fee_amount > 0 && (
                            <div className="text-[10px] text-slate-400">
                              Gross: {formatCurrency(p.gross_amount)} (Fee: {formatCurrency(p.fee_amount)})
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
            {!pageLoading && (
              <PaginationControls
                label="Contractor payout"
                page={payoutPage}
                totalItems={payoutCount}
                onPageChange={setPayoutPage}
              />
            )}
          </div>
        )}

        {/* TAB 3: Escrow Ledger Audit Trail */}
        {activeTab === 'ledger' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Escrow Transaction Audit Ledger</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Append-only immutable record of all deposits, releases, and platform fees</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{ledgerCount} Transactions</span>
            </div>

            {pageLoading ? (
              <div className="p-12 text-center text-xs text-slate-500">Loading ledger history...</div>
            ) : ledgerCount === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                No escrow ledger transactions recorded for your contracts yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {groupByProject(ledgerEntries).map(({ projectId, records }) => (
                  <section key={projectId || 'unassigned'}>
                    <h3 className="bg-blue-50/70 px-4 py-2.5 font-bold text-slate-800">
                      Project: {projectTitles[projectId] || (projectId ? 'Project details unavailable' : 'Unassigned project')}
                    </h3>
                    {records.map((e) => (
                      <div key={e.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              e.entry_type === 'release'
                                ? 'bg-emerald-100 text-emerald-800'
                                : e.entry_type === 'deposit'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {e.entry_type}
                            </span>
                            <span className="font-medium text-slate-800">{e.note || 'Escrow Ledger Transaction'}</span>
                          </div>
                          <div className="text-[11px] text-slate-400">{formatDate(e.created_at)}</div>
                        </div>

                        <div className="font-bold text-slate-900">
                          {formatCurrency(e.amount)}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
            {!pageLoading && (
              <PaginationControls
                label="Escrow ledger"
                page={ledgerPage}
                totalItems={ledgerCount}
                onPageChange={setLedgerPage}
              />
            )}
          </div>
        )}
        {/* MODAL: INSPECT DISBURSEMENT PROOF OF TRANSFER */}
        {inspectingPayoutProof && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Disbursement Proof of Transfer</h3>
                    <p className="text-[11px] text-slate-500 font-mono">Ref: {inspectingPayoutProof.ref}</p>
                  </div>
                </div>
                <button
                  onClick={() => setInspectingPayoutProof(null)}
                  className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Payment Disbursed to You</div>
                    <div className="text-sm font-bold text-slate-900">Official Transfer Voucher</div>
                    {inspectingPayoutProof.method && (
                      <div className="text-[11px] text-slate-500 capitalize">Method: {inspectingPayoutProof.method.replace('_', ' ')}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Amount Received</div>
                    <div className="text-lg font-black text-emerald-900 font-mono">
                      ₱{inspectingPayoutProof.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-slate-700 mb-2">Platform Admin Bank / E-Wallet Proof</div>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-100 max-h-80 flex items-center justify-center relative">
                    {inspectingPayoutProof.url.startsWith('data:image') || inspectingPayoutProof.url.startsWith('http') || inspectingPayoutProof.url.startsWith('/') ? (
                      <img
                        src={inspectingPayoutProof.url}
                        alt="Transfer Proof"
                        className="w-full h-auto max-h-80 object-contain mx-auto"
                      />
                    ) : (
                      <div className="p-8 text-center text-slate-500 space-y-2">
                        <FileText className="w-10 h-10 text-emerald-500 mx-auto" />
                        <div className="text-xs font-semibold text-slate-700">Official Transfer Confirmation</div>
                        <div className="text-[11px] font-mono text-slate-400">{inspectingPayoutProof.url}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setInspectingPayoutProof(null)}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
