'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  HardHat,
  Search,
  ChevronRight,
  ShieldCheck,
  Camera
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Project, Quote } from '@/types/database';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils/formatters';

export default function ContractorProjectsPage() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [userName, setUserName] = React.useState<string | null>(null);
  const [projects, setProjects] = React.useState<(Project & { awarded_quote?: Quote })[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'project_planning' | 'in_progress' | 'completed' | 'disputed'>('all');
  const [search, setSearch] = React.useState('');

  const loadData = React.useCallback(async () => {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoadError(authError.message);
      setLoading(false);
      return;
    }
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) {
        setLoadError(profileError.message);
        setLoading(false);
        return;
      }
      setUserName(
        profile?.full_name
        || user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email?.split('@')[0]
        || 'Contractor'
      );
    }

    let enriched: (Project & { awarded_quote?: Quote })[] = [];
    if (user) {
      // 1. Fetch contractor's accepted project quotes
      const { data: quotes, error: quotesError } = await supabase
        .from('quotes')
        .select('*')
        .eq('contractor_id', user.id)
        .eq('status', 'accepted');
      if (quotesError) {
        setLoadError(quotesError.message);
        setLoading(false);
        return;
      }

      if (quotes && quotes.length > 0) {
        const projectIds = quotes.map(q => q.project_id);
        const { data: projs, error: projectsError } = await supabase
          .from('projects')
          .select('*')
          .in('id', projectIds)
          .order('updated_at', { ascending: false });
        if (projectsError) {
          setLoadError(projectsError.message);
          setLoading(false);
          return;
        }

        if (projs) {
          enriched = projs.map(p => ({
            ...p,
            awarded_quote: quotes.find(q => q.id === p.awarded_quote_id || q.project_id === p.id),
          })) as any;
        }
      }
    }

    setProjects(enriched);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProjects = React.useMemo(() => {
    return projects.filter(p => {
      const matchesFilter = statusFilter === 'all' || 
        (statusFilter === 'project_planning' && p.status === 'project_planning') ||
        (statusFilter === 'in_progress' && ['awarded', 'in_progress'].includes(p.status)) ||
        p.status === statusFilter;
      const matchesSearch = search === '' ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.city.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [projects, statusFilter, search]);

  return (
    <AppLayout
      userRole="contractor"
      userName={userName}
      title="Active Construction Projects"
      subtitle="Manage your contracted builds, milestones progress, photo proofs, and escrow releases"
    >
      <div className="w-full space-y-6">
        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all', label: 'All Contracts' },
              { key: 'project_planning', label: 'Project Planning' },
              { key: 'in_progress', label: 'Active Builds' },
              { key: 'completed', label: 'Completed' },
              { key: 'disputed', label: 'Under Dispute' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by project name, city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>

        {/* Project Cards Grid */}
        {loading ? (
          <div className="p-16 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">
            Loading contracted projects...
          </div>
        ) : loadError ? (
          <div className="p-12 text-center text-xs text-red-600 bg-white rounded-2xl border border-red-200">{loadError}</div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-2">
            <HardHat className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-800 text-sm">No active construction projects</div>
            <p className="text-slate-400">Once a homeowner accepts your quotation, your project will appear here for milestone execution.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredProjects.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">{p.title}</h3>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.city}</span>
                      </div>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      p.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : p.status === 'project_planning'
                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        : p.status === 'disputed'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Contract Value:</span>
                      <strong className="text-slate-900 text-sm font-bold">
                        {p.awarded_quote ? formatCurrency(p.awarded_quote.price) : 'Contract Pending'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Floor Area:</span>
                      <strong className="text-slate-900">{p.floor_area_sqm} sq.m ({p.floors} flr)</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Quality: <strong className="capitalize text-slate-800">{p.finish_level}</strong></span>
                    <span>Started: {formatDate(p.created_at)}</span>
                  </div>
                </div>

                <div className="pt-5 border-t border-slate-100 mt-5 flex items-center justify-between">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    {p.status === 'project_planning' ? (
                      <>
                        <Clock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Formulate Schedule</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5 text-blue-600" />
                        <span>Milestones & Proofs</span>
                      </>
                    )}
                  </span>

                  <Link
                    href={`/contractor/projects/${p.id}`}
                    className={`py-2 px-4 rounded-xl text-white text-xs font-semibold shadow-xs flex items-center gap-1 transition-colors ${
                      p.status === 'project_planning'
                        ? 'bg-indigo-600 hover:bg-indigo-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    <span>{p.status === 'project_planning' ? 'Plan Milestones' : 'Manage Milestones'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
