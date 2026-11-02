'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  FileText,
  AlertTriangle,
  ArrowLeft,
  UserCheck,
  Check,
  Wrench,
  AlertCircle,
  Home,
  Layers,
  Maximize2,
  Sparkles,
  ExternalLink,
  Lock,
  ArrowRight,
  ArrowUpRight
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Project, Quote, Milestone, ContractorProfile, Profile, Dispute } from '@/types/database';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils/formatters';

// Helper to remove underscores and format text cleanly
function removeUnderscore(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function cleanMilestoneTitle(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/^Payment\s*\d+:\s*/i, '')
    .replace(/^Milestone\s*\d+:\s*/i, '')
    .replace(/\s*\(\d+%\)/g, '')
    .trim();
}

export default function AdminProjectDetailPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-slate-500">Loading project details...</div>}>
      <AdminProjectDetailContent />
    </React.Suspense>
  );
}

function AdminProjectDetailContent() {
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = React.useState(true);
  const [project, setProject] = React.useState<any | null>(null);
  const [homeowner, setHomeowner] = React.useState<any | null>(null);
  const [quotes, setQuotes] = React.useState<any[]>([]);
  const [milestones, setMilestones] = React.useState<Milestone[]>([]);
  const [dispute, setDispute] = React.useState<Dispute | null>(null);
  const [transactions, setTransactions] = React.useState<any[]>([]);
  const [payouts, setPayouts] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: pData, error: projectError } = await supabase
      .from('projects')
      .select('*, profiles:homeowner_id(*)')
      .eq('id', id)
      .maybeSingle();

    if (projectError) {
      setError(projectError.message);
      setProject(null);
      setLoading(false);
      return;
    }
    if (!pData) {
      setProject(null);
      setHomeowner(null);
      setQuotes([]);
      setMilestones([]);
      setDispute(null);
      setTransactions([]);
      setPayouts([]);
      setLoading(false);
      return;
    }

    const resolvedProject: any = pData;

    setProject(resolvedProject);
    setHomeowner(resolvedProject.profiles || null);

    const { data: qData, error: quotesError } = await supabase
      .from('quotes')
      .select('*, contractor_profiles(*)')
      .eq('project_id', resolvedProject.id);
    if (quotesError) setError(current => current ? `${current}; ${quotesError.message}` : quotesError.message);
    setQuotes((qData || []) as any[]);

    const { data: mData, error: milestonesError } = await supabase
      .from('milestones')
      .select('*')
      .eq('project_id', resolvedProject.id)
      .order('seq', { ascending: true });
    if (milestonesError) setError(current => current ? `${current}; ${milestonesError.message}` : milestonesError.message);
    setMilestones((mData || []) as Milestone[]);

    const { data: dData, error: disputeError } = await supabase
      .from('disputes')
      .select('*')
      .eq('project_id', resolvedProject.id)
      .maybeSingle();
    if (disputeError) setError(current => current ? `${current}; ${disputeError.message}` : disputeError.message);
    setDispute((dData as Dispute | null) || null);

    const { data: txData, error: transactionsError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('project_id', resolvedProject.id);
    if (transactionsError) setError(current => current ? `${current}; ${transactionsError.message}` : transactionsError.message);
    setTransactions(txData || []);

    const { data: pyData, error: payoutsError } = await supabase
      .from('payouts')
      .select('*')
      .eq('project_id', resolvedProject.id);
    if (payoutsError) setError(current => current ? `${current}; ${payoutsError.message}` : payoutsError.message);
    setPayouts(pyData || []);

    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <AppLayout userRole="admin" title="Project Details">
        <div className="p-12 text-center text-xs text-slate-400">Loading project data...</div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout userRole="admin" title="Project Not Found" backHref="/admin/projects" showBackButton={true}>
        <div className="p-12 text-center text-xs text-slate-500">{error ? `Unable to load project: ${error}` : 'Project record not found.'}</div>
      </AppLayout>
    );
  }

  const isAwardedOrProgress = project.status === 'awarded' || project.status === 'in_progress' || project.status === 'completed';
  const acceptedQuote = quotes.find(q => q.status === 'accepted') 
    || (project.awarded_quote_id ? quotes.find(q => q.id === project.awarded_quote_id) : null);
  const isAwarded = !!acceptedQuote || isAwardedOrProgress;

  const projectCost = acceptedQuote?.price 
    ? Number(acceptedQuote.price) 
    : (Number(project.budget) || Number(project.est_mid) || 0);
  const contractorName = acceptedQuote?.contractor_profiles?.business_name || '—';
  const contractorRep = acceptedQuote?.contractor_profiles?.authorized_representative || '—';
  const contractorLicense = acceptedQuote?.contractor_profiles?.license_no || '—';

  // Safekeeping Financial Metrics (computed dynamically from payment transactions & payouts)
  const totalReceived = transactions
    .filter(t => t.payment_status === 'PAID' || t.payment_status === 'SUCCEEDED')
    .reduce((sum, t) => sum + ((t.amount_centavos || 0) / 100), 0);
  const totalDisbursed = payouts
    .filter(p => p.status === 'sent' || p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.net_amount || p.gross_amount || 0), 0);
  const inSafekeepingVault = isAwarded ? Math.max(0, totalReceived - totalDisbursed) : 0;
  const disbursedToContractor = isAwarded ? totalDisbursed : 0;
  const remainingBalance = isAwarded ? Math.max(0, projectCost - totalReceived) : projectCost;
  const fundedPercent = (isAwarded && projectCost > 0) ? ((totalReceived / projectCost) * 100).toFixed(1) : '0.0';

  const completedMilestones = milestones.filter(m => m.status === 'approved' || m.status === 'paid');
  const completionPercent = milestones.length > 0
    ? Math.min(100, Math.round(completedMilestones.reduce((acc, m) => acc + (Number(m.percent) || 0), 0)))
    : 0;

  const contestedMilestone = dispute?.milestone_id 
    ? milestones.find(m => m.id === dispute.milestone_id) 
    : (milestones[0] || null);
  const contestedEscrowAmount = dispute 
    ? (Number(dispute.contractor_amount) || Number(contestedMilestone?.amount) || 0) 
    : 0;

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title={project.title}
      subtitle={`${[project.city, project.province].filter(Boolean).join(', ') || 'Location unavailable'} • Started on ${formatDate(project.created_at)}`}
      backHref="/admin/projects"
      showBackButton={true}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {/* 1. EXECUTIVE PROJECT HERO HEADER */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-6 sm:p-8 bg-gradient-to-r from-slate-50 via-white to-blue-50/20 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Residential Build Project
                </span>
                <span className="text-slate-300">•</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                  {removeUnderscore(project.status)}
                </span>
                {dispute && dispute.status === 'open' && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Contested Milestone Alert</span>
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {project.title}
              </h1>

              <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                <div className="flex items-center gap-1.5 font-medium">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <span>Homeowner: <strong className="text-slate-900">{homeowner?.full_name || '—'}</strong></span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5 font-medium">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>Contractor: <strong className="text-slate-900">{contractorName}</strong></span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5 font-medium text-slate-500">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>{[project.city, project.province].filter(Boolean).join(', ') || 'Location unavailable'}</span>
                </div>
              </div>
            </div>

            {/* Financial Highlights */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-2 bg-white/80 p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-left lg:text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  {isAwarded ? 'Agreed Project Cost' : 'Budget Estimate'}
                </span>
                <div className="text-3xl font-black text-slate-900 font-mono text-emerald-700">
                  ₱{projectCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                {isAwarded && project.est_mid && (
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Original Est: ₱{Number(project.est_mid).toLocaleString('en-US')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4-Stat Metric Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100 bg-slate-50/50">
            <div className="p-4 sm:p-5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                {isAwarded ? 'Total Contract' : 'Target Budget'}
              </span>
              <div className="text-base font-black text-slate-900 font-mono mt-0.5">
                ₱{projectCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">
                {isAwarded ? '100% agreed contract' : 'Homeowner budget target'}
              </span>
            </div>

            <div className="p-4 sm:p-5">
              <span className="text-[10px] uppercase font-bold text-emerald-700 block tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>In Safekeeping Vault</span>
              </span>
              <div className="text-base font-black text-emerald-800 font-mono mt-0.5">
                ₱{inSafekeepingVault.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] text-emerald-600 font-medium">
                {isAwarded ? `${fundedPercent}% funded by homeowner` : '0.0% funded (Awaiting award)'}
              </span>
            </div>

            <div className="p-4 sm:p-5">
              <span className="text-[10px] uppercase font-bold text-indigo-700 block tracking-wider">Disbursed to Contractor</span>
              <div className="text-base font-black text-indigo-900 font-mono mt-0.5">
                ₱{disbursedToContractor.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">
                {disbursedToContractor > 0 
                  ? 'Disbursed with attached transfer proof' 
                  : (isAwarded ? 'Awaiting milestone approval' : 'Awaiting contractor award')}
              </span>
            </div>

            <div className="p-4 sm:p-5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Remaining Due</span>
              <div className="text-base font-black text-slate-700 font-mono mt-0.5">
                ₱{remainingBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">
                {isAwarded ? 'Subsequent progress stages' : 'Unfunded (open for bidding)'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. ACTIVE DISPUTE & COMPLAINT ALERT (IF PRESENT) */}
        {dispute && dispute.status === 'open' && (
          <div className="bg-amber-50/80 border border-amber-300 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-amber-950 text-sm">
                    Active Homeowner Complaint on {contestedMilestone?.name || 'Milestone'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-200 text-amber-900">
                    Escrow Frozen (₱{contestedEscrowAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })})
                  </span>
                </div>
                <p className="text-xs text-amber-900 mt-1 leading-relaxed italic">
                  "{dispute.reason}"
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                  <span className="text-amber-800 font-semibold">
                    Contractor Fix Status:
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-xl text-[11px] font-bold uppercase inline-flex items-center gap-1 ${
                    dispute.contractor_fix_status === 'fixed'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-200 text-amber-900 border border-amber-300'
                  }`}>
                    <Wrench className="w-3 h-3" />
                    <span>{dispute.contractor_fix_status === 'fixed' ? 'Fixed (Awaiting Sign-off)' : 'Fix in Progress'}</span>
                  </span>
                  {dispute.contractor_fix_note && (
                    <span className="text-[11px] text-amber-800 italic">
                      • {dispute.contractor_fix_note}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <Link
                href="/admin/disputes"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-2xs transition inline-flex items-center gap-1.5"
              >
                <span>Mediate in Disputes Ledger</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* 3. CONSTRUCTION MILESTONES (REDESIGNED CARDS) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Construction Milestone Schedule ({milestones.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sequential progress stages, escrow allocations, and verification standing
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Completion:</span>
              <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {completionPercent}% Completed
              </span>
            </div>
          </div>

          {milestones.length === 0 ? (
            <div className="py-12 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-6">
              <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No Construction Milestones Scheduled Yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                This project is currently open for bidding. Milestone stages, progress inspections, and escrow payout schedules will be established once a contractor's proposal is accepted.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {milestones.map((m) => {
                const isDisputed = (dispute && dispute.status === 'open' && (dispute.milestone_id === m.id || (!dispute.milestone_id && m.seq === 2))) || m.status === 'disputed';
                const isApproved = m.status === 'approved' || m.status === 'paid';
                const isInProgress = m.status === 'in_progress';
                const isLocked = !isApproved && !isInProgress && !isDisputed;

                return (
                  <div
                    key={m.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isDisputed
                        ? 'bg-amber-50/50 border-amber-300 shadow-xs'
                        : isApproved
                        ? 'bg-emerald-50/30 border-emerald-200'
                        : isInProgress
                        ? 'bg-blue-50/30 border-blue-200'
                        : 'bg-slate-50/40 border-slate-200/80 opacity-90'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          isDisputed
                            ? 'bg-amber-500 text-white'
                            : isApproved
                            ? 'bg-emerald-600 text-white'
                            : isInProgress
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}>
                          {m.seq}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                              {cleanMilestoneTitle(m.name)}
                            </h4>
                            <span className="text-slate-400 text-xs">•</span>
                            <span className="text-xs font-semibold text-slate-600">
                              {m.percent}% of Contract
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>Escrow Allocation:</span>
                            <strong className="text-slate-900 font-mono font-bold">
                              ₱{Number(m.amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge without underscores */}
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 ${
                          isDisputed
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : isApproved
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isInProgress
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {isDisputed ? (
                            <>
                              <AlertTriangle className="w-3 h-3 text-amber-700" />
                              <span>Disputed Escrow Frozen</span>
                            </>
                          ) : isApproved ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Paid and Released</span>
                            </>
                          ) : isInProgress ? (
                            <>
                              <Clock className="w-3 h-3 text-blue-600" />
                              <span>In Progress</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>Locked Upcoming</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. SCOPE PARAMETERS & SPECIFICATIONS */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <Home className="w-4 h-4 text-blue-600" />
              <span>House Type</span>
            </div>
            <div className="font-bold text-slate-900 text-sm capitalize">
              {removeUnderscore(project.house_type || 'two_storey')}
            </div>
            <div className="text-[11px] text-slate-400">Residential specification</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Work Type</span>
            </div>
            <div className="font-bold text-slate-900 text-sm capitalize">
              {removeUnderscore(project.work_type || 'new_construction')}
            </div>
            <div className="text-[11px] text-slate-400">Ground-up construction</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <Maximize2 className="w-4 h-4 text-emerald-600" />
              <span>Floor Area</span>
            </div>
            <div className="font-bold text-slate-900 text-sm">
              {project.floor_area_sqm || 120} sq.m ({project.floors || 2} floors)
            </div>
            <div className="text-[11px] text-slate-400">Enclosed floor space</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Finish Level</span>
            </div>
            <div className="font-bold text-slate-900 text-sm capitalize">
              {removeUnderscore(project.finish_level || 'standard')} Executive
            </div>
            <div className="text-[11px] text-slate-400">Materials & architectural standard</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <MapPin className="w-4 h-4 text-rose-600" />
              <span>City / Location</span>
            </div>
            <div className="font-bold text-slate-900 text-sm">
              {project.city || 'Location unavailable'}
            </div>
            <div className="text-[11px] text-slate-400">{project.province || '—'}</div>
          </div>
        </div>

        {/* 5. AWARDED CONTRACTOR & GOVERNANCE */}
        {acceptedQuote ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Awarded Proposal & Contractor Oversight
                </h3>
              </div>
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                Contract Accepted
              </span>
            </div>

            <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 text-base">
                  {contractorName}
                </h4>
                <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                  <span>Authorized Representative: <strong className="text-slate-900">{contractorRep}</strong></span>
                  <span>•</span>
                  <span className="font-mono text-blue-700 font-semibold">{contractorLicense}</span>
                  <span>•</span>
                  <span>Target Duration: <strong>{acceptedQuote?.duration_months ? `${acceptedQuote.duration_months} months` : 'Not specified'}</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Accepted Price</span>
                  <span className="text-2xl font-black text-slate-900 font-mono text-blue-700">
                    ₱{projectCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>

                <Link
                  href="/admin/contractors"
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5"
                >
                  <span>Contractor Profile</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden p-6 text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Contractor Bidding in Progress</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              No contractor proposal has been awarded yet. Once the homeowner reviews bids and accepts an itemized proposal, contractor credentials, license registration, and agreed terms will be displayed here.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
