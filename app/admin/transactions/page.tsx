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
import { ContractorPayoutAccount, PaymentTransactionRecord } from '@/types/database';
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

const PROJECTS_PER_PAGE = 20;
const QUERY_PAGE_SIZE = 500;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    const message = error.message;
    if (message.includes('admin_verify_homeowner_payment') && message.includes('schema cache')) {
      return 'Payment approval is not installed in Supabase yet. Apply migration 88, then refresh this page.';
    }
    const details = 'details' in error && typeof error.details === 'string' ? error.details : '';
    const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : '';
    return [message, details, hint].filter(Boolean).join(' — ');
  }
  return 'Unable to confirm received funds. Please try again.';
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
        const preferredAccount = accounts.find(account => account.is_primary && account.status === 'VERIFIED')
          || accounts.find(account => account.status === 'VERIFIED')
          || accounts.find(account => account.is_primary)
          || accounts[0];
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
        if (!cancelled) setTransactions(pageTransactions);
      } catch (err) {
        if (!cancelled) {
          setTransactions([]);
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

  const getProjectInfo = (projectId?: string | null): ProjectSafekeepingSummary | null =>
    projectId ? projectsById.get(projectId) || null : null;

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
        text: `Verified ₱${((tx.amount_centavos || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} into Safekeeping Vault!`,
        type: 'success'
      });
    } catch (err: unknown) {
      const message = getErrorMessage(err);
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
      if (!transferringTx.project_id || !transferringTx.recipient_id || !transferringTx.milestone_id) {
        throw new Error('The transaction must include a project, contractor, and milestone before payout.');
      }
      if (payoutAccountsLoading) throw new Error('Wait for the contractor payout details to finish loading.');
      if (payoutAccountsError) throw new Error(`Could not load the contractor payout details: ${payoutAccountsError}`);
      const selectedPayoutAccount = contractorPayoutAccounts.find(account => account.id === selectedPayoutAccountId);
      const payoutMethod = selectedPayoutAccount?.payout_method || transferMethod;
      const disburseRef = payoutBankRef.trim();
      const { error: payoutError } = await supabase.rpc('admin_record_contractor_payout', {
        p_payment_id: transferringTx.id,
        p_amount: numericAmount,
        p_payout_method: payoutMethod,
        p_payout_account_id: selectedPayoutAccount?.id || null,
        p_payout_reference: disburseRef,
        p_proof_url: payoutProofUrl || null,
        p_proof_name: payoutProofFileName || null,
        p_notes: transferNotes || `Disbursement for homeowner deposit ${transferringTx.transaction_ref}`,
      });
      if (payoutError) throw payoutError;

      const updatedTx: PaymentTransactionRecord = {
        ...transferringTx,
        payout_status: 'PAID',
        payout_tx_ref: disburseRef,
        payout_proof_url: payoutProofUrl || null
      };

      setTransactions(prev => prev.map(t => t.id === transferringTx.id ? updatedTx : t));
      setTransferringTx(null);
      setPayoutProofUrl('');
      setPayoutProofFileName('');
      setPayoutBankRef('');
      setTransferNotes('');

      setActionNotice({
        text: `Successfully transferred ₱${numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} to the contractor.`,
        type: 'success'
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : '';
      const message = code === 'PGRST202' || errorMessage.includes('admin_record_contractor_payout')
        ? 'Payout repair is not installed in Supabase yet. Apply migration 91, then refresh and retry.'
        : errorMessage;
      console.error('Error executing payout:', { message, code });
      setActionNotice({ text: `Error executing payout transfer: ${message}`, type: 'error' });
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Projects ({filteredProjects.length})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setProjectPage(0);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
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
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
              />
            </div>

            <button
              type="button"
              onClick={() => loadData()}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition shrink-0"
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
            const projReceived = projTxs
              .filter(t => t.payment_status === 'PAID' || t.payment_status === 'SUCCEEDED')
              .reduce((acc, t) => acc + (t.amount_centavos || 0), 0) / 100;
            const projDisbursed = projTxs
              .filter(t => t.payout_status === 'PAID')
              .reduce((acc, t) => acc + (t.amount_centavos || 0), 0) / 100;
            const projVaultBalance = Math.max(0, projReceived - projDisbursed);
            const projRemaining = Math.max(0, proj.contractPrice - projReceived);

            return (
              <div key={proj.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                {/* PROJECT HEADER & MINI FINANCIAL SUMMARY */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
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
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    <div className="px-3 py-1 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Contract</span>
                      <strong className="text-slate-900 font-mono">
                        ₱{proj.contractPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="px-3 py-1 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-[10px] text-emerald-600 block uppercase font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>In Safekeeping Vault</span>
                      </span>
                      <strong className="text-emerald-900 font-mono">
                        ₱{projVaultBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="px-3 py-1 bg-indigo-50 rounded-xl border border-indigo-200">
                      <span className="text-[10px] text-indigo-600 block uppercase font-bold">Transferred</span>
                      <strong className="text-indigo-900 font-mono">
                        ₱{projDisbursed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="px-3 py-1 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Remaining Due</span>
                      <strong className="text-slate-700 font-mono">
                        ₱{projRemaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
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
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-bold text-[10px]">
                          <th className="py-2.5 px-4">Name of the Payer</th>
                          <th className="py-2.5 px-4">Method</th>
                          <th className="py-2.5 px-4">Contractor</th>
                          <th className="py-2.5 px-4">Amount</th>
                          <th className="py-2.5 px-4">Proof</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {projTxs.map((tx) => {
                          const isPending = ['PENDING_VERIFICATION', 'PENDING', 'CREATED'].includes(tx.payment_status);
                          const isSucceeded = tx.payment_status === 'PAID' || tx.payment_status === 'SUCCEEDED';
                          const isRejected = tx.payment_status === 'REJECTED';

                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/60 transition">
                              {/* 1. NAME OF THE PAYER */}
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900">
                                  {tx.sender_name && tx.sender_name !== 'Homeowner' 
                                    ? tx.sender_name 
                                    : (proj.homeownerName || '—')}
                                </div>
                              </td>

                              {/* 2. METHOD */}
                              <td className="py-3 px-4">
                                <span className="font-semibold text-slate-800 capitalize">
                                  {removeUnderscore(tx.provider || tx.payment_method)}
                                </span>
                                {tx.provider_tx_ref && (
                                  <div className="text-[10px] text-blue-600 font-mono mt-0.5">
                                    Ref: {tx.provider_tx_ref}
                                  </div>
                                )}
                              </td>

                              {/* 3. CONTRACTOR */}
                              <td className="py-3 px-4">
                                <div className="font-medium text-slate-800">{proj.contractorName}</div>
                              </td>

                              {/* 4. AMOUNT */}
                              <td className="py-3 px-4 font-mono font-black text-slate-900 text-sm">
                                ₱{((tx.amount_centavos || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </td>

                              {/* 5. PROOF */}
                              <td className="py-3 px-4">
                                {tx.proof_file_url ? (
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

                              {/* 6. ACTION */}
                              <td className="py-3 px-4 text-right">
                                {isPending ? (
                                  <div className="inline-flex items-center gap-1.5 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setReviewingTx(tx)}
                                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Review &amp; Approve</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRejectingTx(tx);
                                        setRejectionReason('');
                                      }}
                                      className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs border border-red-200 transition"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : isSucceeded ? (
                                  tx.payout_status === 'PAID' ? (
                                    <div className="inline-flex items-center gap-1.5 justify-end">
                                      <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1 border border-slate-200">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Transferred</span>
                                      </span>
                                      {tx.payout_proof_url && (
                                        <button
                                          type="button"
                                          onClick={() => setInspectingPayoutProof({
                                            url: tx.payout_proof_url!,
                                            ref: tx.payout_tx_ref || 'DISBURSE-REF',
                                            contractor: proj.contractorName,
                                            amount: (tx.amount_centavos || 0) / 100,
                                            method: tx.payment_method,
                                            date: new Date().toISOString()
                                          })}
                                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold border border-indigo-200 transition flex items-center gap-1"
                                          title="View proof sent to contractor"
                                        >
                                          <Eye className="w-3 h-3" />
                                          <span>Proof</span>
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTransferringTx(tx);
                                        setTransferAmount(((tx.amount_centavos || 0) / 100).toString());
                                        setTransferMethod('bank_transfer');
                                        setContractorPayoutAccounts([]);
                                        setSelectedPayoutAccountId('');
                                        setPayoutAccountsLoading(Boolean(tx.recipient_id));
                                        setPayoutAccountsError(null);
                                        setPayoutBankRef('');
                                        setPayoutProofUrl('');
                                        setPayoutProofFileName('');
                                        setTransferNotes(`Disburse verified homeowner payment ${tx.transaction_ref} for ${proj.title}`);
                                      }}
                                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 ml-auto"
                                    >
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                      <span>Transfer to Contractor</span>
                                    </button>
                                  )
                                ) : isRejected ? (
                                  <span className="text-red-600 text-xs font-semibold italic">
                                    Declined (Unpaid)
                                  </span>
                                ) : null}
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
                    ₱{((reviewingTx.amount_centavos || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
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
                            {account.status !== 'VERIFIED' ? ` — ${removeUnderscore(account.status)}` : ''}
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
                        <div className="mt-1 text-[10px] text-slate-500">
                          Account status: {removeUnderscore(selectedPayoutAccount.status)}
                        </div>
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
                disabled={isTransferring}
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
                    ₱{inspectingPayoutProof.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
