'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import {
  Building2,
  MapPin,
  HardHat,
  Clock,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Trash2,
  X,
  CalendarDays,
  CheckCircle2,
  MoreVertical
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile, Project, Quote, Milestone } from '@/types/database';
import { formatCurrency, cleanMilestoneTitle } from '@/lib/utils/formatters';
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

  function projectStatusLabel(project: ProjectListRow) {
    if (project.status === 'completed' || project.displayStatus === 'Completed') return 'Completed';
    if (project.status === 'in_progress') return 'In Progress';
    if (project.status === 'project_planning' || project.status === 'awarded') return 'Planning';
    if (project.proposalQuotes.length > 0 || project.status === 'quoted') return 'Reviewing Quotes';
    if (project.status === 'open') return 'Awaiting Contractor';
    return 'Draft';
  }

  function projectStatusClasses(project: ProjectListRow) {
    const label = projectStatusLabel(project);
    if (label === 'Completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
    if (label === 'In Progress') return 'bg-blue-50 text-blue-700 ring-blue-100';
    if (label === 'Reviewing Quotes') return 'bg-amber-50 text-amber-700 ring-amber-100';
    return 'bg-slate-100 text-slate-600 ring-slate-200';
  }

  function projectNextStep(project: ProjectListRow) {
    const current = project.currentMilestone;
    if (current?.status === 'proof_submitted') return 'Awaiting Homeowner Verification';
    if (current?.status === 'disputed' || project.status === 'disputed') return 'Reviewing milestone dispute';
    if (current?.status === 'in_progress') return `${cleanMilestoneTitle(current.name)} in progress`;
    if (project.status === 'quoted' || project.proposalQuotes.length > 0) return 'Reviewing Contractor Quotations';
    if (project.status === 'open') return 'Waiting for Contractor Proposals';
    if (project.status === 'project_planning') return 'Waiting for Project Plan';
    if (project.status === 'completed') return 'Project Completed';
    if (project.status === 'awarded') return 'Contractor is preparing the project plan';
    return 'Continue setting up your project';
  }

  function ProjectCards({
    projects,
    onDelete,
  }: {
    projects: ProjectListRow[];
    onDelete: (project: ProjectListRow) => void;
  }) {

    return (
      <div className="grid gap-5 xl:grid-cols-2">
        {projects.map(project => {
          const completedMilestones = project.milestones.filter(milestone => milestone.status === 'approved' || milestone.status === 'paid').length;
          const upcomingMilestone = project.milestones.find(milestone => milestone.status === 'locked');
          const canDelete = ['open', 'draft', 'quoted'].includes(project.status) && !project.awarded_quote_id;
          const status = projectStatusLabel(project);
          return (
            <article key={project.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                <div
                  className="h-40 shrink-0 rounded-xl bg-gradient-to-br from-blue-100 via-slate-100 to-blue-50 bg-cover bg-center sm:w-40"
                  style={project.plan_file_path ? { backgroundImage: `url("${project.plan_file_path}")` } : undefined}
                >
                  {!project.plan_file_path && <Building2 className="mx-auto mt-14 h-9 w-9 text-blue-200" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/homeowner/projects/${project.id}`} className="truncate text-base font-bold text-slate-900 hover:text-blue-600">{project.title}</Link>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${projectStatusClasses(project)}`}>{status}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.city}{project.province ? `, ${project.province}` : ''}</span>
                        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Created {new Date(project.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button type="button" aria-label={`Actions for ${project.title}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreVertical className="h-4 w-4" /></button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">Project type</span><p className="mt-1 font-semibold capitalize text-slate-700">{project.work_type.replace('_', ' ')}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">Contractor</span><p className="mt-1 truncate font-semibold text-slate-700">{project.contractor?.business_name || (project.proposalQuotes.length > 0 ? 'Reviewing proposals' : 'Awaiting contractor')}</p></div>
                  </div>
                </div>
              </div>

              {project.awardedQuote && (
                <div className="grid grid-cols-2 gap-3 border-y border-slate-100 bg-slate-50/60 px-4 py-4 text-xs sm:grid-cols-4 sm:px-5">
                  <div><span className="text-slate-400">Agreed amount</span><p className="mt-1 font-bold text-slate-900">{project.agreedAmount == null ? 'Unavailable' : formatCurrency(project.agreedAmount)}</p></div>
                  <div><span className="text-slate-400">Released</span><p className="mt-1 font-bold text-emerald-700">{formatCurrency(project.moneyReleased)}</p></div>
                  <div><span className="text-slate-400">In escrow</span><p className="mt-1 font-bold text-amber-700">{formatCurrency(project.moneyInEscrow)}</p></div>
                  <div><span className="text-slate-400">Remaining</span><p className="mt-1 font-bold text-slate-900">{project.remainingBalance == null ? 'Unavailable' : formatCurrency(project.remainingBalance)}</p></div>
                </div>
              )}

              {project.isBuildActive && (
                <div className="px-4 pb-4 pt-4 sm:px-5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>Project progress</span><span className="text-blue-700">{project.completionPercentage}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${project.completionPercentage}%` }} /></div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{completedMilestones} of {project.milestones.length} milestones complete</span>
                    {upcomingMilestone && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-blue-600" />Next: {cleanMilestoneTitle(upcomingMilestone.name)}</span>}
                  </div>
                </div>
              )}

              {!project.isBuildActive && project.proposalQuotes.length > 0 && (
                <div className="flex items-center justify-between border-t border-blue-100 bg-blue-50/60 px-4 py-3 text-xs sm:px-5">
                  <span className="font-semibold text-blue-800">{project.proposalQuotes.length} quotation{project.proposalQuotes.length === 1 ? '' : 's'} received</span>
                  <Link href={`/homeowner/projects/${project.id}`} className="font-bold text-blue-700 hover:text-blue-900">Review Quotations <ChevronRight className="inline h-3.5 w-3.5" /></Link>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Next required action</span><p className="mt-1 truncate text-sm font-semibold text-slate-700">{projectNextStep(project)}</p></div>
                <div className="flex shrink-0 gap-2">
                  {canDelete && <button type="button" onClick={() => onDelete(project)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>}
                  <Link href={`/homeowner/projects/${project.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700">{project.isBuildActive ? 'Manage Project' : 'View Project'} <ChevronRight className="h-3.5 w-3.5" /></Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

function ProjectsDashboard({
  loading,
  loadError,
  projects,
  filter,
  setFilter,
  categoryCounts,
  search,
  setSearch,
  page,
  setPage,
  totalCount,
  isPending,
  startTransition,
  projectToDelete,
  setProjectToDeleteClosed,
  handleConfirmDelete,
  isDeleting,
}: {
  loading: boolean;
  loadError: string;
  projects: ProjectListRow[];
  filter: 'projects' | 'active' | 'quotes' | 'completed';
  setFilter: React.Dispatch<React.SetStateAction<'projects' | 'active' | 'quotes' | 'completed'>>;
  categoryCounts: { all: number; active: number; quotes: number; completed: number };
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  totalCount: number;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  projectToDelete: ProjectListRow | null;
  setProjectToDeleteClosed: (project: ProjectListRow | null) => void;
  handleConfirmDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <AppLayout userRole="homeowner" userName="Homeowner" title="My Projects" subtitle="Manage your residential projects, review contractor proposals, and monitor construction progress." showBackButton={false}>
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        {loadError && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">Project records could not be loaded: {loadError}</div>}
        <section className="relative overflow-hidden rounded-3xl bg-[#083b72] px-6 py-7 text-white shadow-sm sm:px-9" style={{ backgroundImage: 'linear-gradient(90deg, rgba(4,38,81,.96), rgba(7,62,121,.7), rgba(7,62,121,.15)), url("https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1600&q=85")', backgroundPosition: 'center', backgroundSize: 'cover' }}>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><Building2 className="h-7 w-7" /> Your Projects, Our Priority</h1>
          <p className="mt-2 text-sm text-blue-100">Track progress, stay updated, and build your dream home.</p>
        </section>
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {[
              { key: 'projects' as const, label: 'All Projects', count: categoryCounts.all, icon: Building2 },
              { key: 'active' as const, label: 'Active Builds', count: categoryCounts.active, icon: HardHat },
              { key: 'quotes' as const, label: 'Reviewing Quotes', count: categoryCounts.quotes, icon: FileText },
              { key: 'completed' as const, label: 'Completed', count: categoryCounts.completed, icon: CheckCircle2 },
            ].map(tab => {
              const Icon = tab.icon;
              return <button key={tab.key} type="button" onClick={() => startTransition(() => { setFilter(tab.key); setPage(0); })} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${filter === tab.key ? 'bg-blue-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'} ${isPending ? 'cursor-wait' : ''}`}><Icon className="h-4 w-4" />{tab.label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${filter === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span></button>;
            })}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 sm:w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search project, contractor, or location..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10" /></div>
            <Link href="/homeowner/projects/create" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> Create Project</Link>
          </div>
        </section>
        {loading && projects.length === 0 ? <div className="grid gap-5 xl:grid-cols-2">{[1, 2, 3, 4].map(item => <div key={item} className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div> : projects.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm"><Building2 className="mx-auto h-12 w-12 text-slate-300" /><h2 className="mt-4 text-lg font-bold text-slate-900">{filter === 'active' ? "You don't have any active construction projects." : filter === 'quotes' ? 'No contractor quotations are awaiting review.' : filter === 'completed' ? 'No completed projects yet.' : search ? 'No projects match your search.' : "You haven't created any projects yet."}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{search ? 'Try another project name, contractor, or location.' : 'Create a project to estimate costs and connect with verified contractors.'}</p>{!search && filter !== 'completed' && <Link href="/homeowner/projects/create" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Create Project</Link>}</div>
        ) : <div className={`transition-opacity duration-200 ${loading || isPending ? 'opacity-60' : 'opacity-100'}`} aria-busy={loading || isPending}><ProjectCards projects={projects} onDelete={setProjectToDeleteClosed} /></div>}
        {!loading && <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row"><p className="text-xs text-slate-500" aria-live="polite">{totalCount === 0 ? 'Showing 0 of 0 projects' : `Showing ${page * PROJECTS_PAGE_SIZE + 1}–${Math.min((page + 1) * PROJECTS_PAGE_SIZE, totalCount)} of ${totalCount} projects`}</p>{totalCount > PROJECTS_PAGE_SIZE && <div className="flex items-center gap-2"><button type="button" onClick={() => startTransition(() => setPage(current => Math.max(0, current - 1)))} disabled={page === 0 || loading || isPending} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="px-2 text-xs text-slate-500">Page {page + 1} of {Math.ceil(totalCount / PROJECTS_PAGE_SIZE)}</span><button type="button" onClick={() => startTransition(() => setPage(current => current + 1))} disabled={loading || isPending || (page + 1) * PROJECTS_PAGE_SIZE >= totalCount} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Next <ChevronRight className="h-4 w-4" /></button></div>}</div>}
        {projectToDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-bold text-rose-600"><Trash2 className="h-5 w-5" /> Delete Project</h2><button type="button" onClick={() => setProjectToDeleteClosed(null)} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><p className="text-sm text-slate-600">Are you sure you want to permanently delete <strong>{projectToDelete.title}</strong>? This action cannot be undone.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setProjectToDeleteClosed(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button><button type="button" onClick={handleConfirmDelete} disabled={isDeleting} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{isDeleting ? 'Deleting...' : 'Delete Project'}</button></div></div></div>}
      </div>
    </AppLayout>
  );
}

export default function HomeownerProjectsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [projects, setProjects] = React.useState<ProjectListRow[]>([]);
  const [filter, setFilter] = React.useState<'projects' | 'active' | 'quotes' | 'completed'>('projects');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [totalCount, setTotalCount] = React.useState(0);
  const [categoryCounts, setCategoryCounts] = React.useState({ all: 0, active: 0, quotes: 0, completed: 0 });
  const [projectToDelete, setProjectToDelete] = React.useState<ProjectListRow | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const loadRequestId = React.useRef(0);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

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
      setCategoryCounts({ all: 0, active: 0, quotes: 0, completed: 0 });
      setLoading(false);
      return;
    }

    const ownerProjectsResult = await supabase
      .from('projects')
      .select('id, status')
      .eq('homeowner_id', user.id);
    if (requestId !== loadRequestId.current) return;
    if (ownerProjectsResult.error) {
      setLoadError(ownerProjectsResult.error.message);
      setProjects([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    const ownerProjectRows = ownerProjectsResult.data || [];
    const ownerProjectIds = ownerProjectRows.map(project => project.id);
    let quoteCount = 0;
    if (ownerProjectIds.length > 0) {
      const quoteCountResult = await supabase
        .from('quotes')
        .select('project_id')
        .in('project_id', ownerProjectIds)
        .in('status', ['submitted', 'revised', 'revision_requested']);
      if (quoteCountResult.error) {
        setLoadError(quoteCountResult.error.message);
        setProjects([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
      quoteCount = new Set((quoteCountResult.data || []).map(quote => quote.project_id)).size;
    }
    setCategoryCounts({
      all: ownerProjectRows.length,
      active: ownerProjectRows.filter(project => ['awarded', 'project_planning', 'in_progress', 'disputed'].includes(project.status)).length,
      quotes: new Set(ownerProjectRows.filter(project => ['draft', 'open', 'quoted'].includes(project.status)).map(project => project.id)).size > 0
        ? quoteCount
        : 0,
      completed: ownerProjectRows.filter(project => project.status === 'completed').length,
    });

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

    if (debouncedSearch !== '') {
      const searchPattern = `%${debouncedSearch.replace(/[\\%_]/g, '\\$&')}%`;
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
  }, [filter, page, debouncedSearch]);

  React.useEffect(() => {
    const request = window.setTimeout(() => { void loadData(); }, 0);
    return () => {
      window.clearTimeout(request);
      loadRequestId.current += 1;
    };
  }, [loadData]);

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

  return <ProjectsDashboard
    loading={loading}
    loadError={loadError}
    projects={projects}
    filter={filter}
    setFilter={setFilter}
    categoryCounts={categoryCounts}
    search={search}
    setSearch={setSearch}
    page={page}
    setPage={setPage}
    totalCount={totalCount}
    isPending={isPending}
    startTransition={startTransition}
    projectToDelete={projectToDelete}
    setProjectToDeleteClosed={setProjectToDelete}
    handleConfirmDelete={handleConfirmDelete}
    isDeleting={isDeleting}
  />;
}
