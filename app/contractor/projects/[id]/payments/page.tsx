'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/ui/AppLayout';
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  Clock,
  Eye,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Project, Milestone, Quote, ContractorProfile, PaymentTransactionRecord } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

const TRANSACTION_PAGE_SIZE = 25;

function TransactionPagination({
  page,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / TRANSACTION_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  if (totalItems <= TRANSACTION_PAGE_SIZE) return null;

  const firstItem = (currentPage - 1) * TRANSACTION_PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * TRANSACTION_PAGE_SIZE, totalItems);

  return (
    <nav aria-label="Project payment history pagination" className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs">
      <span aria-live="polite" className="text-slate-500">
        Showing {firstItem}–{lastItem} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous project payment history page"
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
          aria-label="Next project payment history page"
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

function getPaymentStatusLabel(status: PaymentTransactionRecord['payment_status']) {
  if (status === 'PAID') return 'Received in escrow';
  if (status === 'SUCCEEDED') return 'Payment confirmed';
  return status.replace(/_/g, ' ');
}

function getPaymentStatusClass(status: PaymentTransactionRecord['payment_status']) {
  if (status === 'PAID' || status === 'SUCCEEDED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['PENDING', 'PENDING_VERIFICATION', 'UNDER_REVIEW', 'PROCESSING'].includes(status)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (status === 'REJECTED' || status === 'FAILED' || status === 'CANCELLED') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function getPayoutStatusLabel(status: PaymentTransactionRecord['payout_status']) {
  if (status === 'PAID' || status === 'RELEASED') return 'Paid to contractor';
  if (status === 'NOT_DUE' || status === 'NOT_READY') return 'Not released';
  if (status === 'PENDING' || status === 'PENDING_APPROVAL' || status === 'PENDING_PAYOUT' || status === 'PROCESSING') {
    return 'Awaiting payout';
  }
  return status.replace(/_/g, ' ');
}

function getPayoutStatusClass(status: PaymentTransactionRecord['payout_status']) {
  if (status === 'PAID' || status === 'RELEASED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['PENDING', 'PENDING_APPROVAL', 'PENDING_PAYOUT', 'PROCESSING'].includes(status)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (status === 'FAILED' || status === 'ON_HOLD') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function ContractorProjectPaymentsPage() {
  return (
    <React.Suspense fallback={<div className="p-12 text-center text-slate-400">Loading payments overview...</div>}>
      <ContractorProjectPaymentsContent />
    </React.Suspense>
  );
}

function ContractorProjectPaymentsContent() {
  const params = useParams();
  const projectId = params?.id as string;

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [project, setProject] = React.useState<Project | null>(null);
  const [contractor, setContractor] = React.useState<ContractorProfile | null>(null);
  const [awardedQuote, setAwardedQuote] = React.useState<Quote | null>(null);
  const [milestones, setMilestones] = React.useState<Milestone[]>([]);
  const [transactions, setTransactions] = React.useState<PaymentTransactionRecord[]>([]);
  const [transactionCount, setTransactionCount] = React.useState(0);
  const [transactionLoading, setTransactionLoading] = React.useState(true);
  const [transactionPage, setTransactionPage] = React.useState(1);
  const initialTransactionPageLoaded = React.useRef(false);
  const [viewingPaymentProof, setViewingPaymentProof] = React.useState<PaymentTransactionRecord | null>(null);
  const [paymentProofLoading, setPaymentProofLoading] = React.useState(false);
  const [paymentProofError, setPaymentProofError] = React.useState('');
  const paymentProofRequestId = React.useRef(0);

  const openPaymentProof = async (transaction: PaymentTransactionRecord) => {
    const requestId = ++paymentProofRequestId.current;
    setViewingPaymentProof(transaction);
    setPaymentProofLoading(true);
    setPaymentProofError('');

    try {
      const { data, error } = await createClient()
        .from('payment_transactions')
        .select('proof_file_url, proof_file_name')
        .eq('id', transaction.id)
        .maybeSingle();
      if (requestId !== paymentProofRequestId.current) return;

      if (error) {
        setPaymentProofError(error.message);
      } else if (data?.proof_file_url) {
        setViewingPaymentProof({
          ...transaction,
          proof_file_url: data.proof_file_url,
          proof_file_name: data.proof_file_name,
        });
      } else {
        setPaymentProofError('No payment proof image is attached to this transaction.');
      }
    } catch (error) {
      if (requestId === paymentProofRequestId.current) {
        setPaymentProofError(error instanceof Error ? error.message : 'Unable to load payment proof.');
      }
    } finally {
      if (requestId === paymentProofRequestId.current) setPaymentProofLoading(false);
    }
  };

  const closePaymentProof = () => {
    paymentProofRequestId.current += 1;
    setViewingPaymentProof(null);
    setPaymentProofLoading(false);
    setPaymentProofError('');
  };

  React.useEffect(() => {
    async function loadData() {
      if (!projectId) return;
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setLoadError(authError.message);
        setLoading(false);
        return;
      }

      // 1. Fetch Project
      let currentProj: Project | null = null;
      if (user) {
        const { data: pData, error: projectError } = await supabase
          .from('projects')
          .select('id, title, budget, awarded_quote_id')
          .eq('id', projectId)
          .single();
        if (projectError && projectError.code !== 'PGRST116') {
          setLoadError(projectError.message);
          setLoading(false);
          return;
        }
        if (pData) currentProj = pData as Project;
      }
      setProject(currentProj);
      if (!currentProj) {
        setLoading(false);
        return;
      }

      if (!user) {
        setLoading(false);
        return;
      }

      const quotePromise = currentProj.awarded_quote_id
        ? supabase
            .from('quotes')
            .select('price')
            .eq('id', currentProj.awarded_quote_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });
      const [
        { data: qData, error: quoteError },
        { data: cData, error: contractorError },
        { data: msData, error: milestonesError },
        { data: txData, error: transactionsError, count: transactionsTotal },
      ] = await Promise.all([
        quotePromise,
        supabase
          .from('contractor_profiles')
          .select('business_name')
          .eq('profile_id', user.id)
          .maybeSingle(),
        supabase
          .from('milestones')
          .select('id, seq, name, amount, status, description')
          .eq('project_id', projectId)
          .order('seq', { ascending: true }),
        supabase
          .from('payment_transactions')
          .select('id, transaction_ref, payment_method, created_at, payment_status, payout_status, amount_centavos', { count: 'exact' })
          .eq('project_id', projectId)
          .range(0, TRANSACTION_PAGE_SIZE - 1)
          .order('created_at', { ascending: false }),
      ]);
      const queryError = quoteError || contractorError || milestonesError || transactionsError;
      if (queryError) {
        setLoadError(queryError.message);
        setLoading(false);
        return;
      }

      if (qData) setAwardedQuote(qData as Quote);
      if (cData) setContractor(cData as ContractorProfile);
      setMilestones((msData || []) as Milestone[]);
      setTransactions((txData || []) as PaymentTransactionRecord[]);
      setTransactionCount(transactionsTotal ?? txData?.length ?? 0);

      setLoading(false);
    }

    loadData();
  }, [projectId]);

  React.useEffect(() => {
    if (!projectId || loading) return;

    let active = true;
    let refreshing = false;
    const refreshStatuses = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const { data, error } = await createClient()
          .from('milestones')
          .select('id, status')
          .eq('project_id', projectId);
        if (error) throw error;
        if (!active) return;

        const statuses = new Map((data || []).map(milestone => [milestone.id, milestone.status]));
        setMilestones(current => current.map(milestone => ({
          ...milestone,
          status: statuses.get(milestone.id) ?? milestone.status,
        })));
      } catch (error) {
        if (active) console.error('Unable to refresh payment milestone statuses:', error);
      } finally {
        refreshing = false;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshStatuses();
    };

    const intervalId = window.setInterval(() => void refreshStatuses(), 15000);
    window.addEventListener('focus', refreshStatuses);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshStatuses);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loading, projectId]);

  React.useEffect(() => {
    if (!projectId || !project) return;
    if (!initialTransactionPageLoaded.current) {
      initialTransactionPageLoaded.current = true;
      return;
    }

    let active = true;
    async function loadTransactionPage() {
      setTransactionLoading(true);
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !user) {
        setLoadError(authError?.message || 'You are not authorized to view these payment records.');
        setTransactionLoading(false);
        return;
      }

      const { data, error, count } = await supabase
        .from('payment_transactions')
        .select('id, transaction_ref, payment_method, created_at, payment_status, payout_status, amount_centavos', { count: 'exact' })
        .eq('project_id', projectId)
        .range((transactionPage - 1) * TRANSACTION_PAGE_SIZE, transactionPage * TRANSACTION_PAGE_SIZE - 1)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) {
        setLoadError(error.message);
        setTransactionLoading(false);
        return;
      }

      setTransactions((data || []) as PaymentTransactionRecord[]);
      setTransactionCount(count ?? data?.length ?? 0);
      setTransactionPage(page => Math.min(page, Math.max(1, Math.ceil((count ?? 0) / TRANSACTION_PAGE_SIZE))));
      setTransactionLoading(false);
    }

    void loadTransactionPage();
    return () => {
      active = false;
    };
  }, [project, projectId, transactionPage]);

  if (loading) {
    return (
      <AppLayout
        userRole="contractor"
        title="Project Payments"
        subtitle="Loading financial records..."
        workspace={{
          projectId,
          projectTitle: 'Loading...',
          projectRef: `PRJ-${projectId.slice(-6).toUpperCase()}`,
        }}
      >
        <div className="p-12 text-center text-slate-400">Loading payments overview...</div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout userRole="contractor" title="Project Payments Unavailable" backHref="/contractor/projects">
        <div className="p-12 text-center text-red-600">{loadError}</div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout userRole="contractor" title="Project Not Found" backHref="/contractor/projects">
        <div className="p-12 text-center text-slate-400">Project record was not found.</div>
      </AppLayout>
    );
  }

  const projectRef = `PRJ-${project.id.slice(-6).toUpperCase()}`;
  const contractAmount = awardedQuote?.price || project.budget || 0;
  const totalAllocated = milestones.reduce((sum, m) => sum + Number(m.amount), 0);

  // Financial Balances
  const releasedFunds = milestones
    .filter(m => m.status === 'paid')
    .reduce((sum, m) => sum + Number(m.amount), 0);

  const awaitingRelease = milestones
    .filter(m => m.status === 'approved')
    .reduce((sum, m) => sum + Number(m.amount), 0);

  const remainingBalance = Math.max(0, contractAmount - releasedFunds);
  return (
    <AppLayout
      userRole="contractor"
      userName={contractor?.business_name || 'Contractor'}
      title="Project Payments & Escrow Ledger"
      subtitle={`${project.title} • Milestone Financial Disbursement Records`}
      workspace={{
        projectId: project.id,
        projectTitle: project.title,
        projectRef,
      }}
    >
      <div className="w-full space-y-6 pb-12">
        {/* 4 Financial Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Agreed Contract Amount</span>
              <DollarSign className="w-4 h-4 text-[#136F48]" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{formatCurrency(contractAmount)}</div>
            <div className="text-xs text-slate-400 mt-1">Total contract value</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Funds Released (Paid)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(releasedFunds)}</div>
            <div className="text-xs text-slate-400 mt-1">Disbursed to your account</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Awaiting Homeowner Release</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600 mt-2">{formatCurrency(awaitingRelease)}</div>
            <div className="text-xs text-slate-400 mt-1">Approved stages pending payout</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Remaining Contract Balance</span>
              <CreditCard className="w-4 h-4 text-slate-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{formatCurrency(remainingBalance)}</div>
            <div className="text-xs text-slate-400 mt-1">Future milestone tranches</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        {/* Milestone Payment Tranches Breakdown */}
        <div id="milestone-disbursement" className="order-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4 lg:order-2">
          <h2 className="text-sm font-bold text-slate-900 flex items-center justify-between">
            <span>Milestone Disbursement Schedule</span>
            <span className="text-xs font-mono font-semibold text-slate-500">
              Total: {formatCurrency(totalAllocated)}
            </span>
          </h2>

          <div className="divide-y divide-slate-100">
            {milestones.map((m) => (
              <div key={m.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-slate-100 font-bold text-slate-700 flex items-center justify-center text-xs">
                    {m.seq}
                  </span>
                  <div>
                    <span className="font-bold text-slate-900 block">{m.name}</span>
                    <span className="text-[11px] text-slate-400">
                      {m.description || 'No description provided'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center">
                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-900 text-sm block">
                      {formatCurrency(m.amount)}
                    </span>
                    <span className={`text-[10px] font-bold uppercase ${
                      m.status === 'paid'
                        ? 'text-emerald-700'
                        : m.status === 'approved'
                        ? 'text-teal-700'
                        : 'text-slate-400'
                    }`}>
                      {m.status.replace('_', ' ')}
                    </span>
                  </div>

                  {m.status === 'paid' ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Paid
                    </span>
                  ) : m.status === 'approved' ? (
                    <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-800 text-[11px] font-bold border border-teal-200 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Pending Release
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium">
                      In Escrow
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <div className="order-1 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4 lg:order-1">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Safekeeping & Payment Receipts</h2>
              <p className="mt-1 text-xs text-slate-500">
                Homeowner deposits are held in escrow; they are not contractor payouts.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Homeowner Payment</th>
                  <th className="px-4 py-3">Contractor Payout</th>
                  <th className="px-4 py-3">Payment Proof</th>
                  <th className="px-4 py-3 text-right">Deposit Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactionLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Loading transaction history...
                    </td>
                  </tr>
                ) : transactionCount === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      No transactions recorded for this project yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="text-slate-600">
                      <td className="px-4 py-3.5 font-bold text-slate-900">{tx.transaction_ref}</td>
                      <td className="px-4 py-3.5 capitalize">{tx.payment_method.replace('_', ' ')}</td>
                      <td className="px-4 py-3.5">{formatDate(tx.created_at)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${getPaymentStatusClass(tx.payment_status)}`}>
                          {getPaymentStatusLabel(tx.payment_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${getPayoutStatusClass(tx.payout_status)}`}>
                          {getPayoutStatusLabel(tx.payout_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => void openPaymentProof(tx)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:border-[#136F48] hover:text-[#136F48]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View proof
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm font-bold text-[#136F48]">
                        {formatCurrency(tx.amount_centavos / 100)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
            <TransactionPagination
              page={transactionPage}
              totalItems={transactionCount}
              onPageChange={setTransactionPage}
            />
            </div>
        </div>
      </div>
      {viewingPaymentProof && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Homeowner payment proof"
          onClick={closePaymentProof}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Homeowner Payment Proof</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {viewingPaymentProof.proof_file_name || viewingPaymentProof.transaction_ref}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close payment proof"
                onClick={closePaymentProof}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {paymentProofLoading ? (
              <p className="py-16 text-center text-sm text-slate-500">Loading payment proof...</p>
            ) : paymentProofError ? (
              <p role="alert" className="py-16 text-center text-sm text-rose-600">{paymentProofError}</p>
            ) : viewingPaymentProof.proof_file_url ? (
              <img
                src={viewingPaymentProof.proof_file_url}
                alt={`Payment proof for transaction ${viewingPaymentProof.transaction_ref}`}
                className="mx-auto max-h-[75vh] max-w-full rounded-xl object-contain"
              />
            ) : null}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
