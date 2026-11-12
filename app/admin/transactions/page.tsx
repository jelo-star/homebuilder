'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { 
  Search, 
  ShieldCheck, 
  CheckCircle2, 
  Eye, 
  Check, 
  X, 
  AlertCircle, 
  ArrowUpRight, 
  Send, 
  Upload, 
  Building2, 
  RefreshCw, 
  MapPin, 
  Clock 
} from 'lucide-react';
import { ContractorPayoutAccount, Milestone, PaymentTransactionRecord, Payout } from '@/types/database';
import { formatNumberInput, parseNumberInput } from '@/lib/utils/formatters';

interface ProjectSafekeepingSummary {
  id: string;
  title: string;
  location: string;
  homeownerName: string;
  contractorName: string;
  contractPrice: number;
  commissionPercent: number;
  status: string;
}

type MilestonePayoutInfo = Pick<
  Milestone,
  'id' | 'project_id' | 'seq' | 'name' | 'amount' | 'status' | 'platform_commission_amount' | 'homeowner_total_amount'
>;
type ProjectPayoutSummary = Pick<Payout, 'project_id' | 'milestone_id' | 'gross_amount' | 'status'>;

const PROJECTS_PER_PAGE = 20;
const QUERY_PAGE_SIZE = 500;

function getErrorMessage(error: unknown, workflow: 'payment' | 'payout'): string {
  const values = typeof error === 'object' && error !== null
    ? error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    : null;
  const message = error instanceof Error
    ? error.message
    : typeof values?.message === 'string'
    ? values.message
    : typeof error === 'string'
    ? error
    : '';
  const details = typeof values?.details === 'string' ? values.details : '';
  const hint = typeof values?.hint === 'string' ? values.hint : '';
  const code = typeof values?.code === 'string' ? values.code : '';
  const description = [message, details, hint].filter(Boolean).join(' — ');

  if (
    workflow === 'payment'
    && description.includes('admin_verify_homeowner_payment')
    && description.includes('schema cache')
  ) {
    return 'Payment approval is not installed in Supabase yet. Apply migration 88, then refresh this page.';
  }
  if (
    workflow === 'payout'
    && (
    code === 'PGRST202'
    || (
      description.includes('admin_record_contractor_milestone_payout')
      && (description.includes('schema cache') || code === '42883')
    )
    )
  ) {
    return 'Milestone transfer support is not installed in Supabase yet. Apply migration 116, then refresh this page.';
  }
  if (
    workflow === 'payout'
    && code === '23505'
    && description.includes('payment_transactions_payout_tx_ref_key')
  ) {
    return 'This bank or trace reference is already recorded on another payment. Enter the unique reference for this contractor transfer. Apply migration 117 to prevent milestone transfers from reusing one reference across multiple homeowner payments.';
  }

  if (description) return description;
  if (code) return `Supabase returned database error ${code} without a message.`;
  if (values) {
    return workflow === 'payout'
      ? 'Supabase returned an empty error object. Check that migration 116 is applied and the Supabase schema cache has refreshed.'
      : 'Supabase returned an empty error object while verifying the homeowner payment.';
  }
  return error == null ? 'No error details were returned by Supabase.' : `Unexpected error response: ${String(error)}`;
}

// Clean helper to remove underscores and format text
function removeUnderscore(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [milestonesById, setMilestonesById] = useState<Map<string, MilestonePayoutInfo>>(new Map());
  const [projectPayouts, setProjectPayouts] = useState<ProjectPayoutSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSafekeepingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectDataLoaded, setProjectDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [projectPage, setProjectPage] = useState(0);

  // Modals State
  const [reviewingTx, setReviewingTx] = useState<PaymentTransactionRecord | null>(null);
  const [rejectingTx, setRejectingTx] = useState<PaymentTransactionRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [inspectorSlipUrl, setInspectorSlipUrl] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Contractor Payout Transfer Modal State
  const [transferringTx, setTransferringTx] = useState<PaymentTransactionRecord | null>(null);
  const [transferringMilestoneId, setTransferringMilestoneId] = useState<string | null>(null);
  const [projectTransferViewId, setProjectTransferViewId] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferMethod, setTransferMethod] = useState<'bank_transfer' | 'gcash' | 'maya'>('bank_transfer');
  const [contractorPayoutAccounts, setContractorPayoutAccounts] = useState<ContractorPayoutAccount[]>([]);
  const [selectedPayoutAccountId, setSelectedPayoutAccountId] = useState('');
  const [payoutAccountsLoading, setPayoutAccountsLoading] = useState(false);
  const [payoutAccountsError, setPayoutAccountsError] = useState<string | null>(null);
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [payoutBankRef, setPayoutBankRef] = useState<string>('');
  const [payoutProofUrl, setPayoutProofUrl] = useState<string>('');
  const [payoutProofFileName, setPayoutProofFileName] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Inspect Contractor Transfer Proof Modal State
  const [inspectingPayoutProof, setInspectingPayoutProof] = useState<{
    url: string;
    ref: string;
    contractor: string;
    amount: number;
    method: string;
    date?: string | null;
  } | null>(null);

  // Auto-dismiss top-right popup toast
  useEffect(() => {
    if (actionNotice) {
      const timer = setTimeout(() => setActionNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionNotice]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const contractorId = transferringTx?.recipient_id;
    if (!contractorId) return;

    let cancelled = false;
    async function loadContractorPayoutAccounts() {
      try {
        const { data, error } = await createClient()
          .from('contractor_payout_accounts')
          .select('*')
          .eq('contractor_id', contractorId)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (cancelled) return;

        const accounts = (data || []) as ContractorPayoutAccount[];
        setContractorPayoutAccounts(accounts);
        const preferredAccount = accounts.find(account => account.is_primary) || accounts[0];
        setSelectedPayoutAccountId(preferredAccount?.id || '');
        if (preferredAccount) setTransferMethod(preferredAccount.payout_method);
      } catch (error) {
        if (cancelled) return;
        setPayoutAccountsError(error instanceof Error ? error.message : 'Unable to load the contractor payout account.');
      } finally {
        if (!cancelled) setPayoutAccountsLoading(false);
      }
    }

    loadContractorPayoutAccounts();
    return () => {
      cancelled = true;
    };
  }, [transferringTx]);

  async function loadData() {
    setLoading(true);
    setProjectDataLoaded(false);
    setLoadError(null);
    try {
      const supabase = createClient();
      
      const [
        { data: dbProjects, error: projectsError },
        { data: qData, error: quotesError },
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('*, profiles:homeowner_id(full_name)'),
        supabase
          .from('quotes')
          .select('*, contractor_profiles(business_name)'),
      ]);

      if (projectsError) throw projectsError;
      if (quotesError) throw quotesError;

      type QuoteRecord = NonNullable<typeof qData>[number];
      const acceptedQuoteByProject = new Map<QuoteRecord['project_id'], QuoteRecord>();
      const acceptedQuoteById = new Map<QuoteRecord['id'], QuoteRecord>();
      for (const quote of qData || []) {
        if (quote.status === 'accepted') {
          acceptedQuoteById.set(quote.id, quote);
          if (!acceptedQuoteByProject.has(quote.project_id)) {
            acceptedQuoteByProject.set(quote.project_id, quote);
          }
        }
      }

      const projectSummaryList: ProjectSafekeepingSummary[] = (dbProjects || []).flatMap((p: any) => {
        const acceptedQuote = (p.awarded_quote_id
          ? acceptedQuoteById.get(p.awarded_quote_id)
          : null) || acceptedQuoteByProject.get(p.id);
        if (!acceptedQuote) return [];

        const contractorName = acceptedQuote?.contractor_profiles?.business_name 
          || '—';

        const contractPrice = acceptedQuote?.price
          ? Number(acceptedQuote.price) 
          : (Number(p.budget) || Number(p.est_mid) || 0);

        return [{
          id: p.id,
          title: p.title || 'Untitled project',
          location: [p.city, p.province].filter(Boolean).join(', ') || 'Location unavailable',
          homeownerName: p.profiles?.full_name || '—',
          contractorName,
          contractPrice: Number(p.homeowner_total_amount) || contractPrice,
          commissionPercent: Number(p.platform_commission_percent) || 0,
          status: p.status || 'in_progress'
        }];
      });

      setProjects(projectSummaryList);
      setProjectDataLoaded(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load payment records.');
      setTransactions([]);
      setProjects([]);
      setProjectDataLoaded(false);
    } finally {
      setLoading(false);
    }
  }

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesDropdown = selectedProjectId === 'all' || p.id === selectedProjectId;
      const matchesSearch =
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.contractorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.homeownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.location.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesDropdown && matchesSearch;
    });
  }, [projects, selectedProjectId, searchTerm]);

  const effectiveProjectPage = Math.min(
    projectPage,
    Math.max(0, Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE) - 1)
  );
  const pagedProjects = useMemo(
    () => filteredProjects.slice(effectiveProjectPage * PROJECTS_PER_PAGE, (effectiveProjectPage + 1) * PROJECTS_PER_PAGE),
    [filteredProjects, effectiveProjectPage]
  );
  const pagedProjectIds = useMemo(() => pagedProjects.map(project => project.id), [pagedProjects]);

  useEffect(() => {
    if (!projectDataLoaded) return;
    if (pagedProjectIds.length === 0) return;

    let cancelled = false;
    async function loadPageTransactions() {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = createClient();
        const pageTransactions: PaymentTransactionRecord[] = [];
        for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
          const { data, error } = await supabase
            .from('payment_transactions')
            .select('*')
            .in('project_id', pagedProjectIds)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + QUERY_PAGE_SIZE - 1);
          if (error) throw error;
          const rows = (data || []) as PaymentTransactionRecord[];
          pageTransactions.push(...rows);
          if (rows.length < QUERY_PAGE_SIZE) break;
        }
        const { data: milestoneRows, error: milestonesError } = await supabase
          .from('milestones')
          .select('id, project_id, seq, name, amount, status, platform_commission_amount, homeowner_total_amount')
          .in('project_id', pagedProjectIds);
        if (milestonesError) throw milestonesError;
        const { data: payoutRows, error: payoutsError } = await supabase
          .from('payouts')
          .select('project_id, milestone_id, gross_amount, status')
          .in('project_id', pagedProjectIds);
        if (payoutsError) throw payoutsError;
        if (!cancelled) {
          setTransactions(pageTransactions);
          setMilestonesById(new Map(
            ((milestoneRows || []) as MilestonePayoutInfo[]).map(milestone => [milestone.id, milestone])
          ));
          setProjectPayouts((payoutRows || []) as ProjectPayoutSummary[]);
        }
      } catch (err) {
        if (!cancelled) {
          setTransactions([]);
          setMilestonesById(new Map());
          setProjectPayouts([]);
          setLoadError(err instanceof Error ? err.message : 'Unable to load payment records.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPageTransactions();
    return () => {
      cancelled = true;
    };
  }, [pagedProjectIds, projectDataLoaded]);

  const projectsById = useMemo(() => {
    const projectMap = new Map<string, ProjectSafekeepingSummary>();
    for (const project of projects) {
      if (!projectMap.has(project.id)) projectMap.set(project.id, project);
    }
    return projectMap;
  }, [projects]);

  const transactionsByProject = useMemo(() => {
    const transactionsMap = new Map<string, PaymentTransactionRecord[]>();
    for (const transaction of transactions) {
      if (!transaction.project_id) continue;
      const projectTransactions = transactionsMap.get(transaction.project_id) || [];
      projectTransactions.push(transaction);
      transactionsMap.set(transaction.project_id, projectTransactions);
    }
    return transactionsMap;
  }, [transactions]);

  const payoutsByProject = useMemo(() => {
    const payoutsMap = new Map<string, ProjectPayoutSummary[]>();
    for (const payout of projectPayouts) {
      if (!payout.project_id) continue;
      const projectPayoutRows = payoutsMap.get(payout.project_id) || [];
      projectPayoutRows.push(payout);
      payoutsMap.set(payout.project_id, projectPayoutRows);
    }
    return payoutsMap;
  }, [projectPayouts]);

  const getProjectInfo = (projectId?: string | null): ProjectSafekeepingSummary | null =>
    projectId ? projectsById.get(projectId) || null : null;

  const getVerifiedPaymentAmount = (tx: PaymentTransactionRecord) =>
    Number(tx.verified_amount ?? (tx.amount_centavos || 0) / 100);

  const getFundingTransaction = (
    projectId: string,
    milestoneId: string,
    projectTransactions: PaymentTransactionRecord[]
  ) => projectTransactions.find(tx =>
    tx.payment_status === 'PAID'
    && Boolean(tx.recipient_id)
    && (tx.milestone_id === milestoneId || tx.milestone_id === null)
  ) || null;

  const openTransferModal = (projectId: string, milestone: MilestonePayoutInfo) => {
    if (milestone.status !== 'approved') return;
    const projectTransactions = transactionsByProject.get(projectId) || [];
    const fundingTransaction = getFundingTransaction(projectId, milestone.id, projectTransactions);
    if (!fundingTransaction) {
      setActionNotice({
        text: 'No verified homeowner payment is available to fund this approved milestone.',
        type: 'error',
      });
      return;
    }
    setProjectTransferViewId(null);
    setTransferringTx(fundingTransaction);
    setTransferringMilestoneId(milestone.id);
    setTransferAmount(milestone.amount.toString());
    setTransferMethod('bank_transfer');
    setContractorPayoutAccounts([]);
    setSelectedPayoutAccountId('');
    setPayoutAccountsLoading(Boolean(fundingTransaction.recipient_id));
    setPayoutAccountsError(null);
    setPayoutBankRef('');
    setPayoutProofUrl('');
    setPayoutProofFileName('');
    setTransferNotes(`Disbursement for approved milestone ${milestone.name}`);
  };

  // Confirm Received Funds into Safekeeping
  const handleConfirmReceivedFunds = async (tx: PaymentTransactionRecord) => {
    setIsVerifying(true);
    setActionNotice(null);
    const supabase = createClient();

    try {
      const { error } = await supabase.rpc('admin_verify_homeowner_payment', {
        p_payment_id: tx.id
      });
      if (error) throw error;
      const updatedTx: PaymentTransactionRecord = {
        ...tx,
        payment_status: 'PAID',
        verified_amount: (tx.amount_centavos || 0) / 100,
        verified_at: new Date().toISOString(),
        reviewer_notes: 'Deposit confirmed by admin into Safekeeping Vault',
      };

      setTransactions(prev => prev.map(t => t.id === tx.id ? updatedTx : t));
      setReviewingTx(null);
      setActionNotice({
        text: `Verified ₱${((tx.amount_centavos || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} into Safekeeping Vault!`,
        type: 'success'
      });
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'payment');
      console.error('Error confirming payment:', message);
      setActionNotice({ text: `Error confirming payment: ${message}`, type: 'error' });
    } finally {
      setIsVerifying(false);
    }
  };

  // Execute Payout Transfer to Contractor with Proof
  const handleExecuteContractorPayout = async () => {
    if (!transferringTx) return;
    const numericAmount = parseNumberInput(transferAmount);
    if (numericAmount <= 0) {
      setActionNotice({ text: 'Please enter a valid transfer amount.', type: 'error' });
      return;
    }
    if (!payoutBankRef.trim()) {
      setActionNotice({ text: 'Enter the actual bank or trace reference before recording the payout.', type: 'error' });
      return;
    }

    setIsTransferring(true);
    setActionNotice(null);
    const supabase = createClient();

    try {
      const approvedMilestone = transferringMilestoneId
        ? milestonesById.get(transferringMilestoneId)
        : null;
      if (!transferringTx.project_id || !transferringTx.recipient_id || !approvedMilestone || approvedMilestone.project_id !== transferringTx.project_id || approvedMilestone.status !== 'approved') {
        throw new Error('Only verified funds for an approved milestone can be transferred to the contractor.');
      }
      if (Math.abs(numericAmount - approvedMilestone.amount) > 0.005) {
        throw new Error(`The transfer amount must match the approved milestone amount (${approvedMilestone.amount.toLocaleString('en-US')}).`);
      }
      if (payoutAccountsLoading) throw new Error('Wait for the contractor payout details to finish loading.');
      if (payoutAccountsError) throw new Error(`Could not load the contractor payout details: ${payoutAccountsError}`);
      const selectedPayoutAccount = contractorPayoutAccounts.find(account => account.id === selectedPayoutAccountId);
      const payoutMethod = selectedPayoutAccount?.payout_method || transferMethod;
      const disburseRef = payoutBankRef.trim();
      const { error: payoutError } = await supabase.rpc('admin_record_contractor_milestone_payout', {
        p_payment_id: transferringTx.id,
        p_milestone_id: approvedMilestone.id,
        p_amount: numericAmount,
        p_payout_method: payoutMethod,
        p_payout_account_id: selectedPayoutAccount?.id || null,
        p_payout_reference: disburseRef,
        p_proof_url: payoutProofUrl || null,
        p_proof_name: payoutProofFileName || null,
        p_notes: transferNotes || `Disbursement for homeowner deposit ${transferringTx.transaction_ref}`,
      });
      if (payoutError) throw payoutError;

      const releaseAmount = Math.max(
        approvedMilestone.amount + (approvedMilestone.platform_commission_amount || 0),
        approvedMilestone.homeowner_total_amount || approvedMilestone.amount,
      );
      const sourceTransactions = (transactionsByProject.get(transferringTx.project_id) || [])
        .filter(tx =>
          (tx.payment_status === 'PAID' || tx.payment_status === 'SUCCEEDED')
          && tx.recipient_id === transferringTx.recipient_id
          && (tx.milestone_id === approvedMilestone.id || tx.milestone_id === null)
        )
        .sort((a, b) => {
          const aIsMilestonePayment = a.milestone_id === approvedMilestone.id;
          const bIsMilestonePayment = b.milestone_id === approvedMilestone.id;
          if (aIsMilestonePayment !== bIsMilestonePayment) return aIsMilestonePayment ? -1 : 1;
          return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
        });
      const releasedFundingIds = new Set<string>();
      let allocatedFunding = 0;
      for (const transaction of sourceTransactions) {
        if (allocatedFunding >= releaseAmount) break;
        releasedFundingIds.add(transaction.id);
        allocatedFunding += Number(transaction.verified_amount ?? (transaction.amount_centavos || 0) / 100);
      }

      setTransactions(prev => prev.map(transaction => {
        const isPayoutSource = releasedFundingIds.has(transaction.id);
        const isPayoutRecord = transaction.id === transferringTx.id;
        if (!isPayoutSource && !isPayoutRecord) return transaction;

        return {
          ...transaction,
          payout_status: 'PAID',
          ...(isPayoutRecord ? {
            payout_tx_ref: disburseRef,
            payout_proof_url: payoutProofUrl || null,
          } : {}),
        };
      }));
      setMilestonesById(prev => new Map(prev).set(approvedMilestone.id, { ...approvedMilestone, status: 'paid' }));
      const commissionPercent = projectsById.get(transferringTx.project_id)?.commissionPercent || 0;
      const feeAmount = Math.round(numericAmount * commissionPercent) / 100;
      setProjectPayouts(prev => [
        ...prev,
        { project_id: transferringTx.project_id, milestone_id: approvedMilestone.id, gross_amount: numericAmount + feeAmount, status: 'sent' },
      ]);
      setTransferringTx(null);
      setTransferringMilestoneId(null);
      setPayoutProofUrl('');
      setPayoutProofFileName('');
      setPayoutBankRef('');
      setTransferNotes('');

      setActionNotice({
        text: `Successfully transferred ₱${numericAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })} to the contractor.`,
        type: 'success'
      });
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err, 'payout');
      const code = typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
        ? err.code
        : '';
      console.error('Error executing payout:', {
        message: errorMessage,
        code,
        details: typeof err === 'object' && err !== null && 'details' in err ? err.details : undefined,
        hint: typeof err === 'object' && err !== null && 'hint' in err ? err.hint : undefined,
        error: err,
      });
      setActionNotice({ text: `Error executing payout transfer: ${errorMessage}`, type: 'error' });
    } finally {
      setIsTransferring(false);
    }
  };

  // Reject Inaccurate Deposit Submission
  const handleRejectTransaction = async (tx: PaymentTransactionRecord) => {
    const reason = rejectionReason.trim();
    if (!reason) {
      setActionNotice({ text: 'Enter a reason before rejecting this payment.', type: 'error' });
      return;
    }

    setIsVerifying(true);
    setActionNotice(null);
    const supabase = createClient();

    try {
      const { error } = await supabase.rpc('admin_reject_homeowner_payment', {
        p_payment_id: tx.id,
        p_rejection_reason: reason
      });
      if (error) throw error;

      const updatedTx: PaymentTransactionRecord = {
        ...tx,
        payment_status: 'REJECTED',
        rejection_reason: reason,
        reviewer_notes: reason
      };

      setTransactions(prev => prev.map(t => t.id === tx.id ? updatedTx : t));
      setRejectingTx(null);
      setRejectionReason('');
      setActionNotice({
        text: `Transaction marked as REJECTED. Balance remains UNPAID on homeowner project.`,
        type: 'error'
      });
    } catch (err: any) {
      console.error('Error rejecting transaction:', err);
      setActionNotice({ text: 'Error rejecting transaction: ' + (err.message || 'Unknown error'), type: 'error' });
    } finally {
      setIsVerifying(false);
    }
  };

  const selectedPayoutAccount = contractorPayoutAccounts.find(account => account.id === selectedPayoutAccountId);

  return (
    <AppLayout 
      userRole="admin" 
      title="Safekeeping & Transactions by Project" 
      subtitle="Homeowner payments, safekeeping vault balance, and contractor payouts organized strictly by project"
    >
      {/* FLOATING POPUP TOAST NOTIFICATION ON TOP-RIGHT */}
      {actionNotice && (
        <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
          <div className={`p-3.5 rounded-2xl bg-white shadow-2xl flex items-center justify-between gap-3 text-xs font-bold border ${
            actionNotice.type === 'success' 
              ? 'border-emerald-200 text-emerald-800' 
              : 'border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="leading-snug">{actionNotice.text}</span>
            </div>
            <button 
              type="button"
              onClick={() => setActionNotice(null)}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {loadError && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{loadError}</div>}
        {/* SIMPLE SEARCH & PROJECT SELECTOR HEADER */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Building2 className="h-4 w-4" />
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Projects ({filteredProjects.length})
            </h2>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:items-center">
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setProjectPage(0);
              }}
              className="col-span-2 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-1 sm:max-w-64"
            >
              <option value="all">📁 All Projects ({projects.length})</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search project, payer..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setProjectPage(0);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={() => loadData()}
              className="justify-self-end rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* PROJECTS LIST: CLEAN & BY PROJECT ONLY */}
        {loading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">
            Loading project safekeeping records...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">
            No projects found matching your search.
          </div>
        ) : (
          pagedProjects.map((proj) => {
            // Transactions strictly belonging to this project
            const projTxs = transactionsByProject.get(proj.id) || [];
            const paymentGroups = new Map<string, PaymentTransactionRecord[]>();
            for (const transaction of projTxs) {
              const groupKey = transaction.milestone_id
                ? `milestone:${transaction.milestone_id}`
                : `payment:${transaction.id}`;
              const group = paymentGroups.get(groupKey) || [];
              group.push(transaction);
              paymentGroups.set(groupKey, group);
            }
            const projPayoutRows = payoutsByProject.get(proj.id) || [];
            const projReceived = projTxs
              .filter(t => t.payment_status === 'PAID' || t.payment_status === 'SUCCEEDED')
              .reduce((acc, t) => acc + getVerifiedPaymentAmount(t), 0);
            const projDisbursed = projPayoutRows
              .filter(payout => payout.status === 'sent')
              .reduce((acc, payout) => acc + Number(payout.gross_amount || 0), 0);
            const projReserved = projPayoutRows
              .filter(payout => payout.status === 'pending' || payout.status === 'sent')
              .reduce((acc, payout) => acc + Number(payout.gross_amount || 0), 0);
            const projVaultBalance = Math.max(0, projReceived - projReserved);
            const projRemaining = Math.max(0, proj.contractPrice - projReceived);

            return (
              <div key={proj.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                {/* PROJECT HEADER & MINI FINANCIAL SUMMARY */}
                <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 sm:p-5 xl:flex-row xl:items-center">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-sm">{proj.title}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                          {removeUnderscore(proj.status)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 text-slate-400">
                          <MapPin className="w-3 h-3" />
                          {proj.location}
                        </span>
                        <span>•</span>
                        <span>Contractor: <strong className="text-slate-800">{proj.contractorName}</strong></span>
                        <span>•</span>
                        <span>Homeowner: <strong className="text-slate-800">{proj.homeownerName}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* SIMPLE PROJECT FINANCIAL BAR */}
                  <div className="flex w-full flex-wrap items-center gap-2 text-xs xl:w-auto xl:justify-end">
                    <div className="min-w-[112px] rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Contract</span>
                      <strong className="text-slate-900 font-mono">
                        ₱{proj.contractPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </strong>
                    </div>

                    <div className="min-w-[140px] rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <span className="text-[10px] text-emerald-600 block uppercase font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>In Safekeeping Vault</span>
                      </span>
                      <strong className="text-emerald-900 font-mono">
                        ₱{projVaultBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </strong>
                    </div>

                    <div className="min-w-[112px] rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
                      <span className="text-[10px] text-indigo-600 block uppercase font-bold">Transferred</span>
                      <strong className="text-indigo-900 font-mono">
                        ₱{projDisbursed.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </strong>
                    </div>

                    <div className="min-w-[112px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Remaining Due</span>
                      <strong className="text-slate-700 font-mono">
                        ₱{projRemaining.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </strong>
                    </div>
                    <button
                      type="button"
                      disabled={projReceived <= 0}
                      onClick={() => setProjectTransferViewId(proj.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2 font-bold text-white shadow-xs transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Transfer to Contractor
                    </button>
                  </div>
                </div>

                {/* SIMPLE TABLE: EXACT REQUESTED COLUMNS */}
                {/* NAME OF THE PAYER | METHOD | CONTRACTOR | AMOUNT | PROOF | ACTION */}
                <div className="overflow-x-auto">
                  {projTxs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No payments submitted yet for this project.
                    </div>
                  ) : (
                    <table className="w-full min-w-[1020px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <th className="px-5 py-3">Name of the Payer</th>
                          <th className="px-5 py-3">Method</th>
                          <th className="px-5 py-3">Payment For</th>
                          <th className="px-5 py-3">Contractor</th>
                          <th className="px-5 py-3">Amount</th>
                          <th className="px-5 py-3">Proof</th>
                          <th className="px-5 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {Array.from(paymentGroups, ([groupKey, payments]) => {
                          const tx = payments[0];
                          if (!tx) return null;
                          const paymentMilestone = tx.milestone_id ? milestonesById.get(tx.milestone_id) : null;
                          const milestonePayout = paymentMilestone
                            ? projPayoutRows.find(payout => payout.milestone_id === paymentMilestone.id)
                            : null;
                          const totalAmount = payments.reduce(
                            (total, payment) => total + (payment.amount_centavos || 0) / 100,
                            0,
                          );
                          const multiplePayments = payments.length > 1;
                          const payerDetails = (
                            <div className="space-y-1.5">
                              {payments.map(payment => (
                                <div key={payment.id} className="font-semibold text-slate-800">
                                  {payment.sender_name && payment.sender_name !== 'Homeowner'
                                    ? payment.sender_name
                                    : proj.homeownerName || '—'}
                                </div>
                              ))}
                            </div>
                          );
                          const methodDetails = (
                            <div className="space-y-1.5">
                              {payments.map(payment => (
                                <div key={payment.id}>
                                  <span className="font-semibold text-slate-800 capitalize">
                                    {removeUnderscore(payment.provider || payment.payment_method)}
                                  </span>
                                  {payment.provider_tx_ref && (
                                    <div className="text-[10px] text-blue-600 font-mono mt-0.5">
                                      Ref: {payment.provider_tx_ref}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                          const paymentStatuses = payments.map(payment => {
                            const pending = ['PENDING_VERIFICATION', 'PENDING', 'CREATED'].includes(payment.payment_status);
                            const paid = payment.payment_status === 'PAID' || payment.payment_status === 'SUCCEEDED';
                            const rejected = payment.payment_status === 'REJECTED';
                            return { payment, pending, paid, rejected };
                          });

                          return (
                            <tr key={groupKey} className="transition-colors hover:bg-blue-50/30">
                              {/* 1. NAME OF THE PAYER */}
                              <td className="px-5 py-4">
                                {multiplePayments ? (
                                  <details className="group">
                                    <summary className="cursor-pointer list-none font-bold text-slate-900">
                                      {payments.length} payers <span className="text-blue-600">▾</span>
                                    </summary>
                                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
                                      {payerDetails}
                                    </div>
                                  </details>
                                ) : <div className="font-bold text-slate-900">{payerDetails}</div>}
                              </td>

                              {/* 2. METHOD */}
                              <td className="px-5 py-4">
                                {multiplePayments ? (
                                  <details className="group">
                                    <summary className="cursor-pointer list-none font-semibold text-slate-800">
                                      {payments.length} payments <span className="text-blue-600">▾</span>
                                    </summary>
                                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
                                      {methodDetails}
                                    </div>
                                  </details>
                                ) : methodDetails}
                              </td>

                              {/* 3. PAYMENT ALLOCATION */}
                              <td className="px-5 py-4">
                                {paymentMilestone ? (
                                  <span className="font-medium text-slate-800">
                                    Milestone {paymentMilestone.seq}: {paymentMilestone.name}
                                  </span>
                                ) : (
                                  <span className="font-medium text-slate-600">Full project payment</span>
                                )}
                              </td>

                              {/* 4. CONTRACTOR */}
                              <td className="px-5 py-4">
                                <div className="font-medium text-slate-800">{proj.contractorName}</div>
                              </td>

                              {/* 5. AMOUNT */}
                              <td className="px-5 py-4 font-mono text-sm font-black text-slate-900">
                                {multiplePayments ? (
                                  <details>
                                    <summary className="cursor-pointer list-none">
                                      ₱{totalAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-[10px] font-sans font-semibold text-blue-600">({payments.length} payments ▾)</span>
                                    </summary>
                                    <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-medium">
                                      {payments.map(payment => (
                                        <div key={payment.id} className="flex justify-between gap-3">
                                          <span className="text-slate-500">{payment.sender_name || 'Homeowner'}</span>
                                          <span>₱{((payment.amount_centavos || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                ) : (
                                  `₱${((tx.amount_centavos || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                                )}
                              </td>

                              {/* 6. PROOF */}
                              <td className="px-5 py-4">
                                {multiplePayments ? (
                                  <details>
                                    <summary className="cursor-pointer list-none rounded-lg bg-blue-50 px-2.5 py-1 font-bold text-[11px] text-blue-700 hover:bg-blue-100">
                                      Proofs ({payments.length}) ▾
                                    </summary>
                                    <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-white p-2">
                                      {payments.map((payment, index) => (
                                        <div key={payment.id} className="flex items-center justify-between gap-2">
                                          <span className="text-[10px] text-slate-500">Payment {index + 1}</span>
                                          {payment.proof_file_url ? (
                                            <button
                                              type="button"
                                              onClick={() => setInspectorSlipUrl(payment.proof_file_url || null)}
                                              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
                                            >
                                              <Eye className="h-3 w-3" /> Inspect
                                            </button>
                                          ) : <span className="text-[10px] italic text-slate-400">No file</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                ) : tx.proof_file_url ? (
                                  <button
                                    type="button"
                                    onClick={() => setInspectorSlipUrl(tx.proof_file_url || null)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] transition"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Inspect Slip</span>
                                  </button>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">No file</span>
                                )}
                              </td>

                              {/* 7. ACTION */}
                              <td className="px-5 py-4 text-right">
                                {multiplePayments ? (
                                  <details className="text-left">
                                    <summary className="inline-block cursor-pointer list-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700">
                                      Actions ({payments.length}) ▾
                                    </summary>
                                    <div className="ml-auto mt-2 max-h-72 w-80 max-w-full space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-left shadow-xl">
                                      {paymentStatuses.map(({ payment, pending, paid, rejected }, index) => (
                                        <div key={payment.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2">
                                          <div className="min-w-0">
                                            <div className="truncate text-[10px] font-semibold text-slate-700">
                                              Payment {index + 1} · ₱{((payment.amount_centavos || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                            </div>
                                            <div className="text-[9px] text-slate-400">{removeUnderscore(payment.payment_status)}</div>
                                          </div>
                                          {pending ? (
                                            <div className="flex shrink-0 gap-1">
                                              <button type="button" onClick={() => setReviewingTx(payment)} className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700">Review</button>
                                              <button type="button" onClick={() => { setRejectingTx(payment); setRejectionReason(''); }} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100">Reject</button>
                                            </div>
                                          ) : paid && (payment.payout_status === 'PAID' || milestonePayout) ? (
                                            <div className="flex shrink-0 items-center gap-1">
                                              <span className="text-[10px] font-bold text-emerald-700">Transferred</span>
                                              {payment.payout_proof_url && (
                                                <button type="button" onClick={() => setInspectingPayoutProof({
                                                  url: payment.payout_proof_url!,
                                                  ref: payment.payout_tx_ref || 'DISBURSE-REF',
                                                  contractor: proj.contractorName,
                                                  amount: (payment.amount_centavos || 0) / 100,
                                                  method: payment.payment_method,
                                                  date: new Date().toISOString(),
                                                })} className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100">Proof</button>
                                              )}
                                            </div>
                                          ) : rejected ? (
                                            <span className="text-[10px] font-semibold text-red-600">Declined</span>
                                          ) : paid ? (
                                            <span className="text-right text-[9px] font-semibold text-slate-500">
                                              {paymentMilestone?.status === 'approved' ? 'Ready for project transfer' : paymentMilestone ? 'Awaiting milestone approval' : 'Held in project vault'}
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-semibold text-slate-400">Awaiting verification</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                ) : (() => {
                                  const { pending, paid, rejected } = paymentStatuses[0];
                                  if (pending) {
                                    return (
                                      <div className="inline-flex items-center gap-1.5 justify-end">
                                        <button type="button" onClick={() => setReviewingTx(tx)} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1">
                                          <Check className="w-3.5 h-3.5" /><span>Review &amp; Approve</span>
                                        </button>
                                        <button type="button" onClick={() => { setRejectingTx(tx); setRejectionReason(''); }} className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs border border-red-200 transition">Reject</button>
                                      </div>
                                    );
                                  }
                                  if (paid && (tx.payout_status === 'PAID' || milestonePayout)) {
                                    return (
                                      <div className="inline-flex items-center gap-1.5 justify-end">
                                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1 border border-slate-200">
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>Transferred</span>
                                        </span>
                                        {tx.payout_proof_url && (
                                          <button type="button" onClick={() => setInspectingPayoutProof({
                                            url: tx.payout_proof_url!,
                                            ref: tx.payout_tx_ref || 'DISBURSE-REF',
                                            contractor: proj.contractorName,
                                            amount: (tx.amount_centavos || 0) / 100,
                                            method: tx.payment_method,
                                            date: new Date().toISOString(),
                                          })} className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold border border-indigo-200 transition flex items-center gap-1" title="View proof sent to contractor">
                                            <Eye className="w-3 h-3" /><span>Proof</span>
                                          </button>
                                        )}
                                      </div>
                                    );
                                  }
                                  if (rejected) return <span className="text-red-600 text-xs font-semibold italic">Declined (Unpaid)</span>;
                                  if (paid) {
                                    return (
                                      <span className="text-[11px] font-semibold text-slate-400">
                                        {paymentMilestone?.status === 'approved' ? 'Ready for project transfer' : paymentMilestone ? 'Awaiting milestone approval' : 'Held in project vault'}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })
        )}
        {!loading && filteredProjects.length > PROJECTS_PER_PAGE && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
            <span className="text-slate-500">
              Showing {effectiveProjectPage * PROJECTS_PER_PAGE + 1}–{Math.min((effectiveProjectPage + 1) * PROJECTS_PER_PAGE, filteredProjects.length)} of {filteredProjects.length} projects
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={effectiveProjectPage === 0}
                onClick={() => setProjectPage(Math.max(0, effectiveProjectPage - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={(effectiveProjectPage + 1) * PROJECTS_PER_PAGE >= filteredProjects.length}
                onClick={() => setProjectPage(effectiveProjectPage + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {projectTransferViewId && (() => {
        const transferProject = projectsById.get(projectTransferViewId);
        const transferProjectTransactions = transactionsByProject.get(projectTransferViewId) || [];
        const receivedAmount = transferProjectTransactions
          .filter(tx => tx.payment_status === 'PAID' || tx.payment_status === 'SUCCEEDED')
          .reduce((total, tx) => total + getVerifiedPaymentAmount(tx), 0);
        const projectPayoutRows = payoutsByProject.get(projectTransferViewId) || [];
        const projectMilestones = Array.from(milestonesById.values())
          .filter(milestone => milestone.project_id === projectTransferViewId)
          .sort((a, b) => a.seq - b.seq);
        const reservedAmount = projectPayoutRows
          .filter(payout => payout.status === 'pending' || payout.status === 'sent')
          .reduce((total, payout) => total + Number(payout.gross_amount || 0), 0);
        const vaultAmount = Math.max(0, receivedAmount - reservedAmount);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-900 to-indigo-900 p-5 text-white">
                <div>
                  <h3 className="text-sm font-bold">Transfer to Contractor</h3>
                  <p className="mt-1 text-[11px] text-blue-200">{transferProject?.title || 'Project payment overview'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setProjectTransferViewId(null)}
                  className="rounded-full p-1.5 text-blue-200 transition hover:bg-white/20 hover:text-white"
                  aria-label="Close transfer overview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-bold uppercase text-slate-500">Total verified from homeowner</div>
                    <div className="mt-1 font-mono text-lg font-bold text-slate-900">
                      ₱{receivedAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-[10px] font-bold uppercase text-emerald-700">Available in project vault</div>
                    <div className="mt-1 font-mono text-lg font-bold text-emerald-900">
                      ₱{vaultAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">
                  Each approved milestone is transferred once for its full milestone amount, even when the homeowner paid in multiple transactions. Full-project payments remain in the vault until an approved milestone is ready.
                </p>

                <section className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">Milestone transfers</h4>
                  {projectMilestones.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 p-5 text-center text-xs text-slate-500">
                      No milestones are available for this project.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[620px] text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Milestone</th>
                            <th className="px-4 py-3">Approval status</th>
                            <th className="px-4 py-3 text-right">Milestone total</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {projectMilestones.map(milestone => {
                            const payout = projectPayoutRows.find(row => row.milestone_id === milestone.id);
                            const fundingTransaction = getFundingTransaction(
                              projectTransferViewId,
                              milestone.id,
                              transferProjectTransactions
                            );
                            const canTransfer = milestone.status === 'approved' && !payout && Boolean(fundingTransaction);
                            return (
                              <tr key={milestone.id}>
                                <td className="px-4 py-3 font-semibold text-slate-800">
                                  Milestone {milestone.seq}: {milestone.name}
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {payout ? 'Transferred' : removeUnderscore(milestone.status)}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                                  ₱{milestone.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {canTransfer ? (
                                    <button
                                      type="button"
                                      onClick={() => openTransferModal(projectTransferViewId, milestone)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 font-bold text-white transition hover:bg-blue-700"
                                    >
                                      <ArrowUpRight className="h-3.5 w-3.5" />
                                      Transfer milestone
                                    </button>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-slate-400">
                                      {payout
                                        ? 'Already transferred'
                                        : milestone.status === 'approved'
                                        ? 'Awaiting verified funds'
                                        : 'Awaiting approval'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 1: CONFIRM RECEIVED FUNDS INTO SAFEKEEPING */}
      {reviewingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Confirm Received Funds</h3>
                  <p className="text-[11px] text-slate-500">Safekeeping Vault Audit Verification</p>
                </div>
              </div>
              <button
                onClick={() => setReviewingTx(null)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-2xl space-y-2 border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">Project:</span>
                  <span className="font-bold text-slate-900">{getProjectInfo(reviewingTx.project_id)?.title || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Homeowner / Payer:</span>
                  <span className="font-bold text-slate-900">{reviewingTx.sender_name || 'Homeowner'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Selected Method:</span>
                  <span className="font-bold text-slate-900 capitalize">{reviewingTx.provider || reviewingTx.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bank / Trace Ref #:</span>
                  <span className="font-mono font-bold text-blue-700">{reviewingTx.provider_tx_ref || 'N/A'}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="font-bold text-slate-700">Amount to Confirm:</span>
                  <span className="font-mono font-black text-slate-900 text-base text-emerald-700">
                    ₱{((reviewingTx.amount_centavos || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {reviewingTx.proof_file_url && (
                <div className="space-y-1.5">
                  <div className="font-bold text-slate-700">Homeowner Deposit Slip:</div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 max-h-48 flex items-center justify-center">
                    <img 
                      src={reviewingTx.proof_file_url} 
                      alt="Deposit Slip" 
                      className="w-full h-auto max-h-48 object-contain"
                    />
                  </div>
                </div>
              )}
              {!reviewingTx.proof_file_url && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">
                  Payment proof is missing. Request a valid receipt before approving this payment.
                </div>
              )}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                By confirming, this amount is credited to the <strong>Platform Safekeeping Vault</strong> for this project.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setReviewingTx(null)}
                className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-200 text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isVerifying || !reviewingTx.proof_file_url}
                onClick={() => handleConfirmReceivedFunds(reviewingTx)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isVerifying ? 'Verifying...' : 'Approve & Credit to Safekeeping'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DECLINE SUBMISSION */}
      {rejectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-red-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Decline Deposit Submission</h3>
                  <p className="text-[11px] text-slate-500">The homeowner will need to submit a valid payment proof.</p>
                </div>
              </div>
              <button
                onClick={() => setRejectingTx(null)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Reason for Decline / Rejection *</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Describe the reason for rejection"
                  rows={3}
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRejectingTx(null)}
                className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-200 text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isVerifying || !rejectionReason.trim()}
                onClick={() => handleRejectTransaction(rejectingTx)}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
              >
                {isVerifying ? 'Saving...' : 'Reject Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TRANSFER TO CONTRACTOR WITH PROOF */}
      {transferringTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-900 to-indigo-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
                  <ArrowUpRight className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Disburse Milestone to Contractor</h3>
                  <p className="text-[11px] text-blue-200">Transfer from Safekeeping Vault with Attached Proof</p>
                </div>
              </div>
              <button
                onClick={() => setTransferringTx(null)}
                className="p-1.5 rounded-full hover:bg-white/20 text-blue-200 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-100 space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">Target Contractor & Project</div>
                <div className="font-bold text-slate-900 text-sm">{getProjectInfo(transferringTx.project_id)?.contractorName || '—'}</div>
                <div className="text-[11px] text-slate-600">
                  Project: <strong>{getProjectInfo(transferringTx.project_id)?.title || '—'}</strong>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Contractor Payout (PHP) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-500">₱</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatNumberInput(transferAmount)}
                    onChange={(e) => setTransferAmount(formatNumberInput(e.target.value))}
                    readOnly={Boolean(transferringMilestoneId)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
                {transferringMilestoneId && (
                  <p className="text-[10px] text-slate-500">
                    This transfer is for the full approved milestone amount and can only be recorded once.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Contractor Payment Method</label>
                {payoutAccountsLoading ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-500">Loading contractor payout details…</p>
                ) : payoutAccountsError ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{payoutAccountsError}</p>
                ) : contractorPayoutAccounts.length > 0 ? (
                  <>
                    {contractorPayoutAccounts.length > 1 ? (
                      <select
                        value={selectedPayoutAccountId}
                        onChange={(e) => {
                          const account = contractorPayoutAccounts.find(item => item.id === e.target.value);
                          setSelectedPayoutAccountId(e.target.value);
                          if (account) setTransferMethod(account.payout_method);
                        }}
                        className="w-full p-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50"
                      >
                        {contractorPayoutAccounts.map(account => (
                          <option key={account.id} value={account.id}>
                            {removeUnderscore(account.payout_method)}
                            {account.bank_name ? ` — ${account.bank_name}` : ''}
                            {account.is_primary ? ' (Primary)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {selectedPayoutAccount && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-slate-700">
                        <div className="font-bold">
                          {removeUnderscore(selectedPayoutAccount.payout_method)}
                          {selectedPayoutAccount.bank_name ? ` · ${selectedPayoutAccount.bank_name}` : ''}
                        </div>
                        <div className="mt-1">{selectedPayoutAccount.account_name}</div>
                        <div className="font-mono">{selectedPayoutAccount.account_number_mask}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-amber-700">The contractor has no registered payout account. Select the channel used for this manual transfer.</p>
                    <select
                      value={transferMethod}
                      onChange={(e) => setTransferMethod(e.target.value as 'bank_transfer' | 'gcash' | 'maya')}
                      className="w-full p-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50"
                    >
                      <option value="bank_transfer">Philippine Bank Transfer (BDO, BPI, UnionBank)</option>
                      <option value="gcash">GCash E-Wallet</option>
                      <option value="maya">Maya Philippines</option>
                    </select>
                  </>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Bank / Trace Reference # *</label>
                <input
                  type="text"
                  required
                  value={payoutBankRef}
                  onChange={(e) => setPayoutBankRef(e.target.value)}
                  placeholder="Enter bank or trace reference"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Attach Transfer Proof Receipt</label>
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-4 text-center transition bg-slate-50/50">
                  <input
                    type="file"
                    id="payout-proof-file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setPayoutProofFileName(file.name);
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          setPayoutProofUrl(event.target?.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  
                  {payoutProofUrl ? (
                    <div className="space-y-2">
                      <div className="max-h-36 overflow-hidden rounded-xl border border-slate-200 bg-white mx-auto flex items-center justify-center">
                        <img 
                          src={payoutProofUrl} 
                          alt="Proof Preview" 
                          className="max-h-36 w-auto object-contain"
                        />
                      </div>
                      <label htmlFor="payout-proof-file" className="text-[10px] text-blue-600 hover:underline cursor-pointer font-bold">
                        Change Image
                      </label>
                    </div>
                  ) : (
                    <label htmlFor="payout-proof-file" className="cursor-pointer block space-y-1">
                      <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                      <div className="text-xs font-bold text-blue-700">Upload bank transfer slip screenshot</div>
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setTransferringTx(null)}
                className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-200 text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTransferring || payoutAccountsLoading || Boolean(payoutAccountsError)}
                onClick={handleExecuteContractorPayout}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
              >
                {isTransferring ? 'Processing...' : 'Confirm & Disburse to Contractor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: INSPECT DEPOSIT SLIP */}
      {inspectorSlipUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Homeowner Deposit Slip</h3>
              <button
                onClick={() => setInspectorSlipUrl(null)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[70vh] overflow-auto">
              <img
                src={inspectorSlipUrl}
                alt="Deposit Slip Proof"
                className="max-h-[65vh] w-auto object-contain rounded-xl shadow-xs"
              />
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setInspectorSlipUrl(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 text-white font-bold text-xs hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: INSPECT DISBURSEMENT TRANSFER PROOF */}
      {inspectingPayoutProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
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
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider">Disbursed To Contractor</div>
                  <div className="text-sm font-bold text-slate-900">{inspectingPayoutProof.contractor}</div>
                  <div className="text-[11px] text-slate-500">Method: {inspectingPayoutProof.method}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider">Amount Sent</div>
                  <div className="text-lg font-black text-indigo-900 font-mono">
                    ₱{inspectingPayoutProof.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-700 mb-2">Attached Bank / E-Wallet Proof Receipt</div>
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-100 max-h-80 flex items-center justify-center relative">
                  <img
                    src={inspectingPayoutProof.url}
                    alt="Disbursement Transfer Proof"
                    className="w-full h-auto max-h-80 object-contain mx-auto"
                  />
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
    </AppLayout>
  );
}
