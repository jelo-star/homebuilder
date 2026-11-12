'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  MapPin,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Profile, Project } from '@/types/database';

type DashboardProject = Pick<
  Project,
  | 'id'
  | 'title'
  | 'status'
  | 'city'
  | 'province'
  | 'floor_area_sqm'
  | 'floors'
  | 'created_at'
  | 'updated_at'
  | 'plan_file_path'
  | 'awarded_quote_id'
>;

type DashboardMilestone = Pick<
  import('@/types/database').Milestone,
  'id' | 'project_id' | 'seq' | 'name' | 'status' | 'updated_at'
>;

type DashboardPlan = Pick<
  import('@/types/database').ProjectPlan,
  'project_id' | 'status' | 'updated_at'
>;

type DashboardQuote = Pick<
  import('@/types/database').Quote,
  'project_id' | 'status' | 'submitted_at'
>;

type ProjectProgress = {
  percent: number;
  nextStep: string;
  stageStates: Array<'complete' | 'current' | 'pending'>;
  currentMilestone?: string;
};

const activeProjectStatuses = ['awarded', 'project_planning', 'in_progress', 'disputed'] as const;
const workflowStages = [
  'Project Created',
  'Quotation Approved',
  'Project Plan Approved',
  'Milestone In Progress',
  'Project Completed',
];

function getProjectProgress(
  project: DashboardProject,
  milestones: DashboardMilestone[],
  plan: DashboardPlan | undefined,
  hasSubmittedQuote: boolean,
): ProjectProgress {
  const sortedMilestones = [...milestones].sort((a, b) => a.seq - b.seq);
  const completedMilestones = sortedMilestones.filter(milestone =>
    milestone.status === 'approved' || milestone.status === 'paid'
  ).length;
  const activeMilestone = sortedMilestones.find(milestone =>
    milestone.status === 'in_progress' || milestone.status === 'proof_submitted' || milestone.status === 'disputed'
  );
  const isComplete = project.status === 'completed'
    || (sortedMilestones.length > 0 && completedMilestones === sortedMilestones.length);
  const quotationApproved = Boolean(project.awarded_quote_id)
    || activeProjectStatuses.includes(project.status as typeof activeProjectStatuses[number]);
  const planApproved = plan?.status === 'approved' || project.status === 'in_progress' || project.status === 'completed';
  const milestoneStarted = Boolean(activeMilestone || completedMilestones > 0);
  const completedStageCount = isComplete
    ? 5
    : milestoneStarted
      ? 3 + (completedMilestones > 0 ? 1 : 0)
      : planApproved
        ? 3
        : quotationApproved
          ? 2
          : 1;

  let nextStep = 'Waiting for Contractor Quotation';
  if (project.status === 'quoted' || hasSubmittedQuote) nextStep = 'Reviewing Contractor Quotation';
  else if (plan?.status === 'submitted') nextStep = 'Awaiting Project Plan Approval';
  else if (plan?.status === 'revision_requested') nextStep = 'Project Plan Needs Your Review';
  else if (activeMilestone?.status === 'proof_submitted') nextStep = 'Awaiting Homeowner Verification';
  else if (activeMilestone?.status === 'disputed') nextStep = 'Reviewing Milestone Dispute';
  else if (activeMilestone) nextStep = `${activeMilestone.name} In Progress`;
  else if (isComplete) nextStep = 'Project Completed';
  else if (project.status === 'project_planning') nextStep = 'Awaiting Project Plan Approval';
  else if (project.status === 'awarded' || project.status === 'in_progress') nextStep = 'Contractor Is Preparing the Next Step';

  const stageStates = workflowStages.map((_, index) =>
    index < completedStageCount ? 'complete' : index === completedStageCount ? 'current' : 'pending'
  ) as ProjectProgress['stageStates'];
  const percent = Math.round(
    (stageStates.filter(state => state === 'complete').length / workflowStages.length) * 100,
  );

  return {
    percent,
    nextStep,
    currentMilestone: activeMilestone?.name,
    stageStates,
  };
}

function statusLabel(status: DashboardProject['status'], hasSubmittedQuote: boolean): string {
  const labels: Record<DashboardProject['status'], string> = {
    draft: 'Draft',
    open: hasSubmittedQuote ? 'New Quotation' : 'Awaiting Contractor',
    quoted: 'Review Quotations',
    awarded: 'Contractor Selected',
    project_planning: 'Planning',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    disputed: 'Needs Attention',
  };
  return labels[status];
}

function statusClasses(status: DashboardProject['status'], hasSubmittedQuote: boolean): string {
  if (hasSubmittedQuote && status === 'open') return 'bg-blue-50 text-blue-700 ring-blue-100';
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  if (status === 'in_progress' || status === 'awarded') return 'bg-blue-50 text-blue-700 ring-blue-100';
  if (status === 'disputed') return 'bg-rose-50 text-rose-700 ring-rose-100';
  return 'bg-amber-50 text-amber-700 ring-amber-100';
}

export default function HomeownerDashboard() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [profile, setProfile] = React.useState<Pick<Profile, 'full_name'> | null>(null);
  const [projects, setProjects] = React.useState<DashboardProject[]>([]);
  const [milestones, setMilestones] = React.useState<DashboardMilestone[]>([]);
  const [plans, setPlans] = React.useState<DashboardPlan[]>([]);
  const [quotes, setQuotes] = React.useState<DashboardQuote[]>([]);

  React.useEffect(() => {
    async function loadData() {
      setLoading(true);
      setLoadError('');

      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('Your session has expired. Please sign in again.');

        const [
          profileResult,
          projectsResult,
        ] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
          supabase
            .from('projects')
            .select('id, title, status, city, province, floor_area_sqm, floors, created_at, updated_at, plan_file_path, awarded_quote_id')
            .eq('homeowner_id', user.id)
            .order('updated_at', { ascending: false }),
        ]);

        const firstError = profileResult.error || projectsResult.error;
        if (firstError) throw firstError;

        const projectRows = (projectsResult.data || []) as DashboardProject[];
        const projectIds = projectRows.map(project => project.id);
        const [milestonesResult, plansResult, quotesResult] = projectIds.length > 0
          ? await Promise.all([
              supabase
                .from('milestones')
                .select('id, project_id, seq, name, status, updated_at')
                .in('project_id', projectIds)
                .order('seq', { ascending: true }),
              supabase
                .from('project_plans')
                .select('project_id, status, updated_at')
                .in('project_id', projectIds),
              supabase
                .from('quotes')
                .select('project_id, status, submitted_at')
                .in('project_id', projectIds),
            ])
          : [
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
            ];

        if (milestonesResult.error) throw milestonesResult.error;
        if (plansResult.error) throw plansResult.error;
        if (quotesResult.error) throw quotesResult.error;

        setProfile((profileResult.data as Pick<Profile, 'full_name'> | null) || null);
        setProjects(projectRows);
        setMilestones((milestonesResult.data || []) as DashboardMilestone[]);
        setPlans((plansResult.data || []) as DashboardPlan[]);
        setQuotes((quotesResult.data || []) as DashboardQuote[]);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Dashboard records could not be loaded.');
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const activeProjects = projects.filter(project => activeProjectStatuses.includes(project.status as typeof activeProjectStatuses[number]));
  const submittedQuoteProjectIds = new Set(
    quotes
      .filter(quote =>
        (quote.status === 'submitted' || quote.status === 'revision_requested' || Boolean(quote.submitted_at))
        && !['accepted', 'declined', 'expired', 'withdrawn'].includes(quote.status)
      )
      .map(quote => quote.project_id),
  );
  const pendingQuotationCount = projects.filter(project =>
    project.status === 'quoted' || submittedQuoteProjectIds.has(project.id)
  ).length;
  const pendingMilestoneCount = milestones.filter(milestone => milestone.status === 'proof_submitted').length;
  const pendingPlanCount = plans.filter(plan => plan.status === 'submitted' || plan.status === 'revision_requested').length;
  const pendingActions = pendingQuotationCount + pendingMilestoneCount + pendingPlanCount;
  const planByProjectId = new Map(plans.map(plan => [plan.project_id, plan]));
  const visibleProjects = projects.slice(0, 3);
  const displayName = profile?.full_name?.trim() || 'Homeowner';

  return (
    <AppLayout
      userRole="homeowner"
      userName={displayName}
      title="Homeowner Dashboard"
      subtitle="Track your projects and stay updated."
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        {loadError && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>Dashboard records could not be loaded: {loadError}</span>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <Link href="/homeowner/projects" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Total Projects</span>
              <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><FileText className="h-5 w-5" /></span>
            </div>
            <div className="mt-4 text-3xl font-bold text-slate-900">{loading ? '—' : projects.length}</div>
            <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-blue-600">View all projects <ChevronRight className="h-3.5 w-3.5" /></div>
          </Link>
          <Link href="/homeowner/projects" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Active Projects</span>
              <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><TrendingUp className="h-5 w-5" /></span>
            </div>
            <div className="mt-4 text-3xl font-bold text-slate-900">{loading ? '—' : activeProjects.length}</div>
            <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600">Track progress <ChevronRight className="h-3.5 w-3.5" /></div>
          </Link>
          <Link href="/homeowner/projects" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Pending Actions</span>
              <span className="rounded-xl bg-amber-50 p-2.5 text-amber-600"><Clock3 className="h-5 w-5" /></span>
            </div>
            <div className="mt-4 text-3xl font-bold text-slate-900">{loading ? '—' : pendingActions}</div>
            <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-600">View details <ChevronRight className="h-3.5 w-3.5" /></div>
          </Link>
        </section>

        <div className="grid gap-6">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Building2 className="h-5 w-5 text-blue-600" /> My Projects</h2>
                <p className="mt-1 text-xs text-slate-500">Monitor your projects and the next step for each one.</p>
              </div>
              <Link href="/homeowner/projects" className="hidden items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 sm:flex">View All Projects <ChevronRight className="h-4 w-4" /></Link>
            </div>

            {loading ? (
              <div className="space-y-4 p-5 sm:p-6">
                {[1, 2].map(item => <div key={item} className="h-44 animate-pulse rounded-2xl bg-slate-100" />)}
              </div>
            ) : visibleProjects.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Building2 className="mx-auto h-10 w-10 text-slate-300" />
                <h3 className="mt-3 text-base font-bold text-slate-900">No projects yet</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Create your first project to estimate costs and connect with verified contractors.</p>
                <Link href="/homeowner/projects/create" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Create Project</Link>
              </div>
            ) : (
              <div className="space-y-4 p-5 sm:p-6">
                {visibleProjects.map(project => {
                  const projectMilestones = milestones.filter(milestone => milestone.project_id === project.id);
                  const hasSubmittedQuote = submittedQuoteProjectIds.has(project.id);
                  const progress = getProjectProgress(project, projectMilestones, planByProjectId.get(project.id), hasSubmittedQuote);
                  return (
                    <article key={project.id} className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:shadow-sm sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row">
                        <div
                          className="h-36 shrink-0 rounded-xl bg-gradient-to-br from-blue-100 via-slate-100 to-blue-50 bg-cover bg-center lg:w-44"
                          style={project.plan_file_path ? { backgroundImage: `url("${project.plan_file_path}")` } : undefined}
                          aria-label={project.plan_file_path ? `${project.title} project image` : undefined}
                        >
                          {!project.plan_file_path && <Building2 className="mx-auto mt-12 h-9 w-9 text-blue-200" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <Link href={`/homeowner/projects/${project.id}`} className="text-base font-bold text-slate-900 hover:text-blue-600">{project.title}</Link>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.city}{project.province ? `, ${project.province}` : ''}</span>
                                <span>•</span><span>{project.floor_area_sqm} sq.m · {project.floors} floor{project.floors === 1 ? '' : 's'}</span>
                              </div>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusClasses(project.status, hasSubmittedQuote)}`}>{statusLabel(project.status, hasSubmittedQuote)}</span>
                          </div>

                          {hasSubmittedQuote && (
                            <Link
                              href={`/homeowner/projects/${project.id}?tab=contractors`}
                              className="mt-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              <FileCheck2 className="h-4 w-4 shrink-0" />
                              New contractor quotation available. Review it now.
                            </Link>
                          )}

                          <div className="mt-5 flex items-center justify-between text-xs font-semibold text-slate-600">
                            <span>Project progress</span><span className="text-blue-700">{progress.percent}%</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress.percent}%` }} /></div>

                          <div className="mt-5 grid grid-cols-5 gap-1">
                            {workflowStages.map((stage, index) => (
                              <div key={stage} className="min-w-0 text-center">
                                <div className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full border-2 ${progress.stageStates[index] === 'complete' ? 'border-blue-600 bg-blue-600 text-white' : progress.stageStates[index] === 'current' ? 'border-blue-600 bg-white text-blue-600' : 'border-slate-300 bg-white text-transparent'}`}>
                                  {progress.stageStates[index] === 'complete' ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                                </div>
                                <span className={`mt-1 block text-[9px] leading-tight ${progress.stageStates[index] === 'complete' ? 'font-semibold text-blue-700' : progress.stageStates[index] === 'current' ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>{stage}</span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Next step</span><p className="mt-1 truncate text-sm font-semibold text-slate-700">{progress.nextStep}</p></div>
                            <Link href={`/homeowner/projects/${project.id}`} className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700">View Details <ChevronRight className="h-3.5 w-3.5" /></Link>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {projects.length > visibleProjects.length && <Link href="/homeowner/projects" className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 py-3 text-xs font-bold text-blue-600 hover:bg-blue-50 sm:hidden">View All Projects <ChevronRight className="h-4 w-4" /></Link>}
              </div>
            )}
          </section>

        </div>

        {!loading && pendingActions > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><FileCheck2 className="h-5 w-5 shrink-0 text-blue-600" /><span><strong>{pendingActions} action{pendingActions === 1 ? '' : 's'}</strong> may need your attention across quotations, plans, or milestone proofs.</span></div>
            <Link href="/homeowner/projects" className="inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900">Review projects <ChevronRight className="h-4 w-4" /></Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
