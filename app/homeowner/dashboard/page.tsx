'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Building2, 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  ChevronRight, 
  TrendingUp, 
  MapPin, 
  Calendar 
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MilestoneStatus, Project, Profile } from '@/types/database';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils/formatters';

type RecentProject = Pick<Project, 'id' | 'title' | 'status' | 'city' | 'floor_area_sqm' | 'floors' | 'created_at' | 'est_mid'> & {
  awarded_quote_id: string | null;
};
type RecentProjectWithDisplayStatus = RecentProject & {
  displayStatus: 'Planning' | 'In Progress' | 'Completed';
};
type DashboardProfile = Pick<Profile, 'full_name'>;
type DashboardQuote = { id: string; price: number };

export default function HomeownerDashboard() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [profile, setProfile] = React.useState<DashboardProfile | null>(null);
  const [projects, setProjects] = React.useState<RecentProjectWithDisplayStatus[]>([]);
  const [agreedAmounts, setAgreedAmounts] = React.useState<Record<string, number>>({});
  const [stats, setStats] = React.useState({
    total: 0,
    open: 0,
    inProgress: 0,
    completed: 0,
  });

  React.useEffect(() => {
    async function loadData() {
      setLoadError('');
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          setProfile(null);
          setProjects([]);
          setStats({ total: 0, open: 0, inProgress: 0, completed: 0 });
          return;
        }

        const { data: profData, error: profileError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        setProfile((profData as DashboardProfile | null) || null);

        const [
          { count: projectCount, error: projectCountError },
          { data: activeProjects, error: activeProjectsError },
          { count: openCount, error: openProjectsError },
          { count: inProgressCount, error: inProgressProjectsError },
          { count: completedCount, error: completedProjectsError },
        ] = await Promise.all([
          supabase
            .from('projects')
            .select('id', { count: 'exact', head: true })
            .eq('homeowner_id', user.id),
          supabase
            .from('projects')
            .select('id, title, status, city, floor_area_sqm, floors, created_at, est_mid, awarded_quote_id')
            .eq('homeowner_id', user.id)
            .in('status', ['awarded', 'project_planning', 'in_progress', 'disputed'])
            .order('updated_at', { ascending: false })
            .limit(4),
          supabase
            .from('projects')
            .select('id', { count: 'exact', head: true })
            .eq('homeowner_id', user.id)
            .in('status', ['draft', 'open', 'quoted']),
          supabase
            .from('projects')
            .select('id', { count: 'exact', head: true })
            .eq('homeowner_id', user.id)
            .in('status', ['awarded', 'project_planning', 'in_progress', 'disputed']),
          supabase
            .from('projects')
            .select('id', { count: 'exact', head: true })
            .eq('homeowner_id', user.id)
            .eq('status', 'completed'),
        ]);
        const queryError = projectCountError || activeProjectsError || openProjectsError || inProgressProjectsError || completedProjectsError;
        if (queryError) throw queryError;

        const activeProjectRows = (activeProjects || []) as RecentProject[];
        const activeProjectIds = activeProjectRows.map(project => project.id);
        const milestoneStatusesByProjectId = new Map<string, MilestoneStatus[]>();
        if (activeProjectIds.length > 0) {
          const { data: milestones, error: milestonesError } = await supabase
            .from('milestones')
            .select('project_id, status')
            .in('project_id', activeProjectIds);
          if (milestonesError) throw milestonesError;
          for (const milestone of (milestones || []) as { project_id: string; status: MilestoneStatus }[]) {
            const statuses = milestoneStatusesByProjectId.get(milestone.project_id) || [];
            statuses.push(milestone.status);
            milestoneStatusesByProjectId.set(milestone.project_id, statuses);
          }
        }
        const projectsWithDisplayStatus = activeProjectRows.map(project => {
          const milestoneStatuses = milestoneStatusesByProjectId.get(project.id) || [];
          const isComplete = milestoneStatuses.length > 0 &&
            milestoneStatuses.every(status => status === 'approved' || status === 'paid');
          return {
            ...project,
            displayStatus: milestoneStatuses.length === 0
              ? 'Planning' as const
              : isComplete
                ? 'Completed' as const
                : 'In Progress' as const,
          };
        });
        const awardedQuoteIds = [...new Set(activeProjectRows
          .map(project => project.awarded_quote_id)
          .filter((quoteId): quoteId is string => Boolean(quoteId)))];
        let nextAgreedAmounts: Record<string, number> = {};

        if (awardedQuoteIds.length > 0) {
          const { data: awardedQuotes, error: awardedQuotesError } = await supabase
            .from('quotes')
            .select('id, price')
            .in('id', awardedQuoteIds);
          if (awardedQuotesError) throw awardedQuotesError;
          const quotePriceById = new Map(
            ((awardedQuotes || []) as DashboardQuote[]).map(quote => [quote.id, Number(quote.price)])
          );
          nextAgreedAmounts = Object.fromEntries(
            activeProjectRows.flatMap(project => {
              const agreedAmount = project.awarded_quote_id
                ? quotePriceById.get(project.awarded_quote_id)
                : undefined;
              return agreedAmount !== undefined ? [[project.id, agreedAmount]] : [];
            })
          );
        }

        setProjects(projectsWithDisplayStatus);
        setAgreedAmounts(nextAgreedAmounts);
        setStats({
          total: projectCount ?? 0,
          open: openCount ?? 0,
          inProgress: inProgressCount ?? 0,
          completed: completedCount ?? 0,
        });
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Dashboard records could not be loaded.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <AppLayout
      userRole="homeowner"
      userName={profile?.full_name || 'Homeowner'}
      title="Homeowner Dashboard"
      subtitle="Overview of your residential construction activities, proposals, and progress"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {loadError && (
          <div className="p-4 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold">
            Dashboard records could not be loaded: {loadError}
          </div>
        )}
        {/* Welcome Banner */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back, {profile?.full_name || 'Homeowner'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage your residential builds, compare contractor bids, and inspect milestone approvals.
            </p>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/homeowner/projects" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all group">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium group-hover:text-blue-600">
              <span>Total Projects</span>
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats.total}</div>
            <div className="text-xs text-blue-600 mt-1 font-medium">View all projects →</div>
          </Link>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Open / In Bidding</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats.open}</div>
            <div className="text-xs text-slate-400 mt-1">Receiving contractor proposals</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Active Projects</span>
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats.inProgress}</div>
            <div className="text-xs text-slate-400 mt-1">Awarded, planning, and construction</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Completed Projects</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats.completed}</div>
            <div className="text-xs text-slate-400 mt-1">100% turnover completed</div>
          </div>
        </div>

        {/* Recent Projects Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Active Projects</h2>
              <p className="text-xs text-slate-500">Projects with an accepted contractor</p>
            </div>
            <Link
              href="/homeowner/projects"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View Active Projects
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading recent projects...</div>
          ) : stats.total === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-900">No projects yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                Calculate building costs and post your residential project to receive bids from verified contractors.
              </p>
              <Link
                href="/homeowner/cost-calculator"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Estimate Project
              </Link>
            </div>
          ) : projects.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-900">No active projects yet</h3>
              <p className="text-xs text-slate-500 mt-1">Projects appear here after you accept a contractor proposal.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {projects.slice(0, 4).map((p) => (
                <div key={p.id} className="p-4 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/homeowner/projects/${p.id}`} className="font-bold text-slate-900 hover:text-blue-600 text-sm">
                        {p.title}
                      </Link>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        p.displayStatus === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                        p.displayStatus === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-indigo-100 text-indigo-700'
                      }`}>
                        {p.displayStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{p.city} • {p.floor_area_sqm} sq.m ({p.floors} flr)</span>
                      <span>•</span>
                      <span>{formatDate(p.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="sm:text-right">
                      <div className="text-[10px] text-slate-400 font-medium">
                        {agreedAmounts[p.id] !== undefined ? 'Agreed Amount' : 'Estimated Budget'}
                      </div>
                      <div className="text-xs font-bold text-slate-900">
                        {agreedAmounts[p.id] !== undefined
                          ? formatCurrency(agreedAmounts[p.id])
                          : p.est_mid ? formatCurrency(p.est_mid) : 'Custom'}
                      </div>
                    </div>
                    <Link
                      href={`/homeowner/projects/${p.id}`}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium flex items-center gap-1 transition-colors"
                    >
                      <span>Details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
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
