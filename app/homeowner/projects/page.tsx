'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import {
  Building2,
  MapPin,
  CreditCard,
  Eye,
  FileSpreadsheet,
  AlertTriangle,
  HardHat,
  Clock,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Trash2,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile, Project, Quote, Milestone } from '@/types/database';
import { formatCurrency, cleanMilestoneTitle, removeUnderscore } from '@/lib/utils/formatters';
import { exportProjectToExcel } from '@/lib/utils/excelExport';
import { useToast } from '@/components/ui/ToastProvider';

const PROJECTS_PAGE_SIZE = 10;
const PROJECT_IDS_PAGE_SIZE = 1000;

type ProjectIdsPage = {
  data: { id: string }[] | null;
  error: { message: string } | null;
};

type ProjectListRow = Project & {
  awardedQuote: (Quote & { contractor_profile: ContractorProfile | null }) | null;
  proposalQuotes: Array<Quote & { contractor_profile: ContractorProfile | null }>;
  contractor: ContractorProfile | null;
  contractorQuoteAmount: number | null;
  platformCommissionAmount: number;
  commissionPercent: number;
  agreedAmount: number | null;
  moneyReleased: number;
  moneyInEscrow: number;
  remainingBalance: number | null;
  completionPercentage: number;
  displayStatus: string;
  currentMilestone: Milestone | null;
  milestones: Milestone[];
  transactions: Array<Record<string, unknown>>;
  isBuildActive: boolean;
};

async function fetchAllProjectIds(
  createQuery: (from: number, to: number) => PromiseLike<ProjectIdsPage>
) {
  const ids: string[] = [];
  for (let offset = 0; ; offset += PROJECT_IDS_PAGE_SIZE) {
    const { data, error } = await createQuery(offset, offset + PROJECT_IDS_PAGE_SIZE - 1);
    if (error) return { ids, error };
    const rows = data || [];
    ids.push(...rows.map(row => row.id));
    if (rows.length < PROJECT_IDS_PAGE_SIZE) return { ids, error: null };
  }
}

export default function HomeownerProjectsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [projects, setProjects] = React.useState<ProjectListRow[]>([]);
  const [filter, setFilter] = React.useState<'projects' | 'active' | 'quotes' | 'completed'>('projects');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [totalCount, setTotalCount] = React.useState(0);
  const [projectToDelete, setProjectToDelete] = React.useState<ProjectListRow | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const loadRequestId = React.useRef(0);

  const loadData = React.useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError('');
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (requestId !== loadRequestId.current) return;
    if (authError) {
      setLoadError(authError.message);
      setProjects([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    if (!user) {
      setProjects([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    const statusFilter: Project['status'][] | null = filter === 'active'
      ? ['awarded', 'project_planning', 'in_progress', 'disputed']
      : filter === 'completed'
          ? ['completed']
          : null;

    let matchingProjectIds: string[] | null = null;
    if (filter === 'quotes') {
      const ownerProjectResult = await fetchAllProjectIds((from, to) => supabase
        .from('projects')
        .select('id')
        .eq('homeowner_id', user.id)
        .in('status', ['draft', 'open', 'quoted'])
        .order('id')
        .range(from, to));
      if (requestId !== loadRequestId.current) return;
      if (ownerProjectResult.error) {
        setLoadError(ownerProjectResult.error.message);
        setProjects([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const proposedProjectIds: string[] = [];
      for (let offset = 0; offset < ownerProjectResult.ids.length; offset += PROJECT_IDS_PAGE_SIZE) {
        const projectIdBatch = ownerProjectResult.ids.slice(offset, offset + PROJECT_IDS_PAGE_SIZE);
        const { data, error } = await supabase
          .from('quotes')
          .select('project_id')
          .in('project_id', projectIdBatch)
          .in('status', ['submitted', 'revised', 'revision_requested']);
        if (requestId !== loadRequestId.current) return;
        if (error) {
          setLoadError(error.message);
          setProjects([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
        proposedProjectIds.push(...(data || []).map(quote => quote.project_id));
      }

      const projectsWithQuotes = new Set(proposedProjectIds);
      matchingProjectIds = [...projectsWithQuotes];
      if (matchingProjectIds.length === 0) {
        setProjects([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
    }

    if (search !== '') {
      const searchPattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      const [titleResult, cityResult, contractorResult] = await Promise.all([
        fetchAllProjectIds((from, to) => {
          let query = supabase.from('projects').select('id').eq('homeowner_id', user.id).ilike('title', searchPattern).order('id');
          if (statusFilter) query = query.in('status', statusFilter);
          return query.range(from, to);
        }),
        fetchAllProjectIds((from, to) => {
          let query = supabase.from('projects').select('id').eq('homeowner_id', user.id).ilike('city', searchPattern).order('id');
          if (statusFilter) query = query.in('status', statusFilter);
          return query.range(from, to);
        }),
        (async () => {
          const awardedQuoteIds: string[] = [];
          for (let offset = 0; ; offset += PROJECT_IDS_PAGE_SIZE) {
            let query = supabase
              .from('projects')
              .select('awarded_quote_id')
              .eq('homeowner_id', user.id)
              .not('awarded_quote_id', 'is', null)
              .order('id');
            if (statusFilter) query = query.in('status', statusFilter);
            const { data, error } = await query.range(offset, offset + PROJECT_IDS_PAGE_SIZE - 1);
            if (error) return { ids: [], error };
            const rows = data || [];
            awardedQuoteIds.push(...rows.map(project => project.awarded_quote_id).filter((id): id is string => Boolean(id)));
            if (rows.length < PROJECT_IDS_PAGE_SIZE) break;
          }

          const projectIds: string[] = [];
          for (let offset = 0; offset < awardedQuoteIds.length; offset += PROJECT_IDS_PAGE_SIZE) {
            const quoteIds = awardedQuoteIds.slice(offset, offset + PROJECT_IDS_PAGE_SIZE);
            const { data, error } = await supabase
              .from('quotes')
              .select('project_id, contractor_profile:contractor_profiles(business_name)')
              .in('id', quoteIds)
              .ilike('contractor_profile.business_name', searchPattern);
            if (error) return { ids: [], error };
            projectIds.push(...(data || []).map(quote => quote.project_id));
          }
          return { ids: projectIds, error: null };
        })(),
      ]);
      if (requestId !== loadRequestId.current) return;
      const searchError = titleResult.error || cityResult.error || contractorResult.error;
      if (searchError) {
        setLoadError(searchError.message);
        setProjects([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const searchedProjectIds = [...new Set([
        ...titleResult.ids,
        ...cityResult.ids,
        ...contractorResult.ids,
      ])];
      matchingProjectIds = matchingProjectIds
        ? matchingProjectIds.filter(id => searchedProjectIds.includes(id))
        : searchedProjectIds;
      if (matchingProjectIds.length === 0) {
        setProjects([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
    }

    let projectsQuery = supabase
      .from('projects')
      .select('*', { count: 'exact' })
      .eq('homeowner_id', user.id)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(page * PROJECTS_PAGE_SIZE, (page + 1) * PROJECTS_PAGE_SIZE - 1);
    if (statusFilter) projectsQuery = projectsQuery.in('status', statusFilter);
    if (matchingProjectIds) projectsQuery = projectsQuery.in('id', matchingProjectIds);

    const { data: projectsData, error: projectsError, count } = await projectsQuery;

    if (requestId !== loadRequestId.current) return;
    if (projectsError) {
      setLoadError(projectsError.message);
      setProjects([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    const records = (projectsData || []) as Project[];
    setTotalCount(count ?? 0);
    if (count && page > Math.max(0, Math.ceil(count / PROJECTS_PAGE_SIZE) - 1)) {
      setPage(Math.max(0, Math.ceil(count / PROJECTS_PAGE_SIZE) - 1));
      return;
    }
    if (records.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const projectIds = records.map(project => project.id);
    const [quotesResult, milestonesResult, transactionsResult] = await Promise.all([
      supabase.from('quotes').select('*, contractor_profile:contractor_profiles(*)').in('project_id', projectIds),
      supabase.from('milestones').select('*, proofs:milestone_proofs(*)').in('project_id', projectIds).order('seq', { ascending: true }),
      supabase.from('payment_transactions').select('*').in('project_id', projectIds),
    ]);

    if (requestId !== loadRequestId.current) return;
    const relationError = quotesResult.error || milestonesResult.error || transactionsResult.error;
    if (relationError) {
      setLoadError(relationError.message);
      setProjects([]);
      setLoading(false);
      return;
    }

    const quotes = (quotesResult.data || []) as (Quote & { contractor_profile: ContractorProfile | null })[];
    const allMilestones = (milestonesResult.data || []) as Milestone[];
    const transactions = transactionsResult.data || [];
    const quotesById = new Map(quotes.map(quote => [quote.id, quote]));
    const proposalQuotesByProjectId = new Map<string, (Quote & { contractor_profile: ContractorProfile | null })[]>();
    for (const quote of quotes) {
      if (!['submitted', 'revised', 'revision_requested'].includes(quote.status)) continue;
      const projectQuotes = proposalQuotesByProjectId.get(quote.project_id) || [];
      projectQuotes.push(quote);
      proposalQuotesByProjectId.set(quote.project_id, projectQuotes);
    }
    const milestonesByProjectId = new Map<string, Milestone[]>();
    const transactionsByProjectId = new Map<string, typeof transactions>();

    for (const milestone of allMilestones) {
      const projectMilestones = milestonesByProjectId.get(milestone.project_id) || [];
      projectMilestones.push(milestone);
      milestonesByProjectId.set(milestone.project_id, projectMilestones);
    }

    for (const transaction of transactions) {
      const projectTransactions = transactionsByProjectId.get(transaction.project_id) || [];
      projectTransactions.push(transaction);
      transactionsByProjectId.set(transaction.project_id, projectTransactions);
    }

    const enriched = records.map(p => {
      const awardedQuote = p.awarded_quote_id
        ? quotesById.get(p.awarded_quote_id) || null
        : null;
      const proposalQuotes = proposalQuotesByProjectId.get(p.id) || [];
      const contractor = awardedQuote?.contractor_profile || null;
      const projectMilestones = milestonesByProjectId.get(p.id) || [];
      const projectTx = transactionsByProjectId.get(p.id) || [];

      const sysEstMid = Number(p.est_mid) || 0;

      // 1. Agreed Cost (or System Baseline Estimate if not awarded)
      const contractorQuoteAmount = Number(awardedQuote?.price) || null;
      const commissionPercent = 0;
      const platformCommissionAmount = 0;
      const agreedAmount = awardedQuote
        ? Number(p.homeowner_total_amount ?? Number(awardedQuote.price))
        : sysEstMid || null;

      // 2. Money Released (sum of paid milestones)
      const paidMilestones = projectMilestones.filter(m => m.status === 'paid');
      const moneyReleased = paidMilestones.reduce((sum, m) => sum + Number(m.homeowner_total_amount ?? m.amount ?? 0), 0);

      // 3. Money in Escrow (verified deposits minus released funds)
      const verifiedDeposits = projectTx
        .filter(t => t.payment_status === 'PAID' || t.payment_status === 'SUCCEEDED')
        .reduce((sum, t) => sum + (Number(t.amount_centavos || 0) / 100), 0);

      const heldMilestones = projectMilestones.filter(m => ['proof_submitted', 'disputed'].includes(m.status));
      const heldSum = heldMilestones.reduce((sum, m) => sum + Number(m.homeowner_total_amount ?? m.amount ?? 0), 0);

      const moneyInEscrow = verifiedDeposits > 0
        ? Math.max(0, verifiedDeposits - moneyReleased)
        : heldSum;

      // 4. Remaining Balance (Agreed Amount - Money Released)
      const remainingBalance = agreedAmount == null ? null : Math.max(0, agreedAmount - moneyReleased);

      // 5. Current Milestone of Contractor
      const currentMilestone = projectMilestones.find(m => ['in_progress', 'proof_submitted', 'disputed'].includes(m.status))
        || projectMilestones.find(m => m.status === 'locked')
        || null;

      // Completion percentage
      const completedCount = paidMilestones.length;
      const totalCount = projectMilestones.length;
      const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
      const isComplete = totalCount > 0 &&
        projectMilestones.every(milestone => milestone.status === 'approved' || milestone.status === 'paid');

      const isBuildActive = ['awarded', 'project_planning', 'in_progress', 'disputed', 'completed'].includes(p.status) &&
        projectMilestones.length > 0;

      return {
        ...p,
        awardedQuote,
        proposalQuotes: proposalQuotes ?? [],
        contractor: contractor ?? null,
        contractorQuoteAmount,
        platformCommissionAmount,
        commissionPercent,
        agreedAmount,
        moneyReleased,
        moneyInEscrow,
        remainingBalance,
        completionPercentage,
        displayStatus: isComplete ? 'Completed' : projectMilestones.length > 0 ? 'In Progress' : 'Planning',
        currentMilestone: currentMilestone ?? null,
        milestones: projectMilestones ?? [],
        transactions: projectTx ?? [],
        isBuildActive: Boolean(isBuildActive),
      };
    });

    setProjects(enriched);
    setLoading(false);
  }, [filter, page, search]);

  React.useEffect(() => {
    loadData();
    return () => { loadRequestId.current += 1; };
  }, [loadData]);

  const handleExportProject = (project: any) => {
    exportProjectToExcel({
      project: {
        id: project.id,
        title: project.title,
        house_type: project.house_type,
        work_type: project.work_type,
        floor_area_sqm: project.floor_area_sqm,
        floors: project.floors,
        finish_level: project.finish_level,
        city: project.city || undefined,
        province: project.province || undefined,
        status: project.status,
        created_at: project.created_at,
        budget: project.budget || undefined,
        est_mid: project.est_mid || undefined
      },
      contractor: project.contractor ? {
        business_name: project.contractor.business_name,
        trade_name: project.contractor.trade_name || undefined,
        authorized_representative: project.contractor.authorized_representative || undefined,
        license_no: project.contractor.license_no || project.contractor.pcab_license_no || undefined,
        business_email: project.contractor.business_email || undefined,
        business_phone: project.contractor.business_phone || undefined
      } : null,
      quote: project.awardedQuote ? {
        price: project.awardedQuote.price,
        duration_months: project.awardedQuote.duration_months,
        status: project.awardedQuote.status
      } : null,
      milestones: project.milestones?.map((m: any) => ({
        seq: m.seq,
        name: m.name,
        percent: m.percent,
        amount: m.amount,
        status: m.status,
        proof_submitted_at: m.proof_submitted_at || undefined,
        paid_at: m.paid_at || undefined,
        proofs: m.proofs?.map((pr: any) => ({
          note: pr.note || undefined,
          created_at: pr.created_at || undefined
        }))
      })),
      transactions: project.transactions?.map((t: any) => ({
        transaction_ref: t.transaction_ref,
        provider_tx_ref: t.provider_tx_ref,
        provider: t.provider,
        payment_method: t.payment_method,
        amount_centavos: t.amount_centavos,
        payment_status: t.payment_status,
        created_at: t.created_at,
        verified_at: t.verified_at
      })),
      financials: {
        agreedAmount: project.agreedAmount,
        moneyReleased: project.moneyReleased,
        moneyInEscrow: project.moneyInEscrow,
        remainingBalance: project.remainingBalance
      },
      lineItems: (project.awardedQuote as any)?.line_items || []
    });
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to delete projects.');
      const { error: deleteError } = await supabase.rpc('delete_homeowner_project', {
        p_project_id: projectToDelete.id,
      });
      if (deleteError) throw deleteError;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Project could not be deleted.', 'error', 'Delete Failed');
      setIsDeleting(false);
      return;
    }

    setTotalCount(prev => Math.max(0, prev - 1));
    showToast(`Project "${projectToDelete.title}" has been permanently deleted.`, 'success', 'Project Deleted');
    setProjectToDelete(null);
    setIsDeleting(false);
    if (projects.length === 1 && page > 0) setPage(prev => prev - 1);
    else loadData();
  };

  return (
    <AppLayout
      userRole="homeowner"
      userName="Homeowner"
      title="My Projects"
      subtitle="Supervise awarded residential builds, inspect contractor milestones, and release milestone funds"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {loadError && (
          <div className="p-4 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold">
            Project records could not be loaded: {loadError}
          </div>
        )}
        {/* Top Filter & Search Action Bar (No Status Count Boxes) */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'projects' as const, label: 'Projects' },
              { key: 'active' as const, label: 'Active Builds' },
              { key: 'quotes' as const, label: 'Reviewing Quotes' },
              { key: 'completed' as const, label: 'Completed' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setFilter(tab.key);
                  setPage(0);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${filter === tab.key
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search project, builder, city..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <Link
              href="/homeowner/projects/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Project</span>
            </Link>
          </div>
        </div>

        {/* Project List */}
        {loading ? (
          <div className="p-16 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
            Loading your projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white p-14 rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">No construction projects found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Create a new residential build project to receive verified contractor proposals, or adjust your filter selection above.
            </p>
            <div className="pt-2">
              <Link
                href="/homeowner/projects/create"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Project</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {projects.map((p) => {
              const currentMilestone = p.currentMilestone;
              const cleanMilestoneName = currentMilestone
                ? cleanMilestoneTitle(currentMilestone.name)
                : 'No milestone scheduled';
              const isDisputed = currentMilestone?.status === 'disputed' || p.status === 'disputed';
              const isProofSubmitted = currentMilestone?.status === 'proof_submitted';
              const currentMilestoneLabel = currentMilestone
                ? (currentMilestone.seq == null ? cleanMilestoneName : `Stage ${currentMilestone.seq}: ${cleanMilestoneName}`)
                : cleanMilestoneName;
              const currentMilestoneStatus = currentMilestone?.status ?? 'in_progress';

              if (p.isBuildActive) {
                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="font-bold text-slate-900 text-lg">{p.title}</h2>
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            p.displayStatus === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.displayStatus === 'In Progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {p.displayStatus}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {p.city}{p.province ? `, ${p.province}` : ''}
                          </span>
                          {p.contractor?.business_name && (
                            <span className="flex items-center gap-1">
                              <HardHat className="w-3.5 h-3.5 text-blue-600" />
                              Builder: <strong className="text-slate-800">{p.contractor.business_name}</strong>
                            </span>
                          )}
                          {p.currentMilestone && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-indigo-600" />
                              Milestone: <strong className="text-slate-800">{cleanMilestoneName}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/homeowner/projects/${p.id}`}
                        className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-[#136F48] hover:bg-[#0f5738] text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Manage</span>
                      </Link>
                    </div>
                  </div>
                );
              }

              // Legacy active card retained below for reference while older cached builds refresh.
              if (false && p.isBuildActive) {
                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all overflow-hidden"
                  >
                    {/* Top Bar with Project Name, Location, Status, and Export */}
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="font-bold text-slate-900 text-lg">{p.title}</h2>
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isDisputed ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            p.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                              p.status === 'awarded' ? 'bg-indigo-100 text-indigo-800' :
                                'bg-emerald-100 text-emerald-800'
                            }`}>
                            {removeUnderscore(p.status)}
                          </span>
                          {isDisputed && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Dispute Under Mediation
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1 text-slate-400">
                            <MapPin className="w-3.5 h-3.5" />
                            {p.city}{p.province ? `, ${p.province}` : ''}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <HardHat className="w-3.5 h-3.5 text-blue-600" />
                            Contractor: <strong className="text-slate-800 font-semibold">{p.contractor?.business_name ?? 'Pending Contractor Selection'}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleExportProject(p)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                          title="Export complete project data, milestones, and payment logs to Excel"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          <span>Export to Excel</span>
                        </button>
                      </div>
                    </div>

                    {/* 8 Required Fields Display Grid */}
                    <div className="p-6 space-y-6">
                      {/* Financial Metrics Row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* 1. Agreed Cost */}
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Agreed Cost</div>
                          <div className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                            {p.agreedAmount == null ? 'Unavailable' : formatCurrency(p.agreedAmount)}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Agreed contract cost</div>
                        </div>

                        {/* 2. Money Released */}
                        <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
                          <div className="text-[11px] text-emerald-700 font-medium uppercase tracking-wider">Money Released</div>
                          <div className="text-base sm:text-lg font-bold text-emerald-700 mt-1">
                            {formatCurrency(p.moneyReleased)}
                          </div>
                          <div className="text-[10px] text-emerald-600 mt-0.5">Paid out to builder</div>
                        </div>

                        {/* 3. Remaining Balance */}
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Remaining Balance</div>
                          <div className="text-base sm:text-lg font-bold text-slate-800 mt-1">
                            {p.remainingBalance == null ? 'Unavailable' : formatCurrency(p.remainingBalance)}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Balance yet to complete</div>
                        </div>

                        {/* 4. Money in Escrow */}
                        <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100">
                          <div className="text-[11px] text-blue-700 font-medium uppercase tracking-wider">Money in Escrow</div>
                          <div className="text-base sm:text-lg font-bold text-blue-700 mt-1">
                            {formatCurrency(p.moneyInEscrow)}
                          </div>
                          <div className="text-[10px] text-blue-600 mt-0.5">Safeguarded vault funds</div>
                        </div>
                      </div>

                      {/* Current Milestone of the Contractor Box with Pay & Inspect Milestone Buttons */}
                      <div className="p-4 sm:p-5 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/60 via-slate-50/60 to-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-1">
                          <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            Current Milestone of the Contractor
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm sm:text-base">
                              {currentMilestoneLabel}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isDisputed ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              isProofSubmitted ? 'bg-indigo-100 text-indigo-800' :
                                currentMilestoneStatus === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                  currentMilestoneStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                                    'bg-slate-100 text-slate-600'
                              }`}>
                              {removeUnderscore(currentMilestoneStatus)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {isProofSubmitted
                              ? 'Contractor has submitted completion proof. Awaiting your inspection and release.'
                              : isDisputed
                                ? 'Escrow is temporarily contested pending dispute rectification.'
                                : 'Contractor is actively executing construction work for this milestone stage.'}
                          </p>
                        </div>

                        {/* The Two Required Buttons: Pay & Inspect Milestone */}
                        <div className="flex items-center gap-2.5 w-full md:w-auto">
                          {/* 1. Pay Button */}
                          <Link
                            href={`/homeowner/projects/${p.id}?tab=milestones&action=pay`}
                            className="flex-1 md:flex-initial px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <CreditCard className="w-4 h-4" />
                            <span>Pay</span>
                          </Link>

                          {/* 2. Inspect Milestone Button */}
                          <Link
                            href={`/homeowner/projects/${p.id}?tab=milestones`}
                            className="flex-1 md:flex-initial px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Eye className="w-4 h-4 text-slate-500" />
                            <span>Inspect Milestone</span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Project Planning Card
              if (
                ['awarded', 'project_planning', 'in_progress', 'disputed', 'completed'].includes(p.status) &&
                p.milestones.length === 0
              ) {
                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-indigo-200/90 shadow-xs hover:shadow-md transition-all p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-white via-indigo-50/20 to-blue-50/20"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="font-bold text-slate-900 text-base">{p.title}</h2>
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Planning
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                        <span className="flex items-center gap-1 font-semibold text-indigo-700">
                          <HardHat className="w-3.5 h-3.5" />
                          Builder: <strong className="text-slate-900 ml-0.5">{p.contractor ? p.contractor.business_name : 'Assigned Contractor'}</strong>
                        </span>
                        <span>•</span>
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.city}{p.province ? `, ${p.province}` : ''}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <Link
                        href={`/homeowner/projects/${p.id}`}
                        className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Clock className="w-4 h-4" />
                        <span>View Project</span>
                      </Link>
                    </div>
                  </div>
                );
              }

              // Open / Draft / Quoted Projects Card
              const canDeleteProject = ['open', 'draft', 'quoted'].includes(p.status) && !p.awarded_quote_id;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="font-bold text-slate-900 text-base">{p.title}</h2>
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                        {p.proposalQuotes?.length || p.status === 'quoted' ? 'Quotes Received' : removeUnderscore(p.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{p.city}{p.province ? `, ${p.province}` : ''}</span>
                      {p.contractor?.business_name && (
                        <span className="flex items-center gap-1">
                          <HardHat className="w-3.5 h-3.5 text-blue-600" />
                          Builder: <strong className="text-slate-800">{p.contractor.business_name}</strong>
                        </span>
                      )}
                      {p.proposalQuotes?.length > 0 && (
                        <span className="font-semibold text-emerald-700">
                          {p.proposalQuotes.length} contractor {p.proposalQuotes.length === 1 ? 'quote' : 'quotes'} received
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto">
                    {canDeleteProject && (
                      <button
                        type="button"
                        onClick={() => setProjectToDelete(p)}
                        className="px-3.5 py-2.5 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                        <span>Delete</span>
                      </button>
                    )}

                    <Link
                      href={`/homeowner/projects/${p.id}`}
                      className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-[#136F48] hover:bg-[#0f5738] text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Manage</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500" aria-live="polite">
              {totalCount === 0
                ? 'Showing 0 of 0 projects'
                : `Showing ${page * PROJECTS_PAGE_SIZE + 1}–${Math.min((page + 1) * PROJECTS_PAGE_SIZE, totalCount)} of ${totalCount} projects`}
            </p>
            {totalCount > PROJECTS_PAGE_SIZE && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage => Math.max(0, currentPage - 1))}
                  disabled={page === 0 || loading}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <span className="px-2 text-xs text-slate-500">
                  Page {page + 1} of {Math.ceil(totalCount / PROJECTS_PAGE_SIZE)}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage => currentPage + 1)}
                  disabled={loading || (page + 1) * PROJECTS_PAGE_SIZE >= totalCount}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {projectToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5 text-red-600 font-bold text-base">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </div>
                  <span>Delete Project</span>
                </div>
                <button
                  type="button"
                  onClick={() => setProjectToDelete(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                <p>
                  Are you sure you want to permanently delete <strong className="text-slate-900">"{projectToDelete.title}"</strong>?
                </p>
                <p className="text-slate-500">
                  This project has not been awarded yet. Deleting it will cancel all open contractor bids and remove its estimation records. This action cannot be undone.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setProjectToDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold transition shadow-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Deleting...' : 'Delete Project'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
