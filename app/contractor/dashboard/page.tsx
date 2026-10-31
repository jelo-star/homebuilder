'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import {
  Briefcase,
  ShieldCheck,
  FileText,
  Clock,
  DollarSign,
  Plus,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Building2,
  MapPin,
  Calendar,
  HardHat,
  Send,
  Eye,
  ArrowRight
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile, MilestoneStatus, Project, Quote, Profile } from '@/types/database';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils/formatters';

interface EnrichedActiveProject extends Project {
  homeowner_name: string;
  contractor_name: string;
  agreed_amount: number;
  display_status: 'Planning' | 'In Progress' | 'Complete';
  full_location: string;
}

interface EnrichedUnawardedProject extends Project {
  myQuote?: Quote | null;
  full_location: string;
}

function formatProjectLocation(city?: string | null, province?: string | null): string {
  const parts = [city, province].filter(Boolean) as string[];
  if (parts.length === 0) return 'Location not provided';
  if (parts.length === 2 && parts[0].toLowerCase().includes(parts[1].toLowerCase())) {
    return parts[0];
  }
  return parts.join(', ');
}

function getProjectDisplayStatus(status: string, milestoneStatuses: MilestoneStatus[]): 'Planning' | 'In Progress' | 'Complete' {
  if (milestoneStatuses.length === 0) return 'Planning';
  if (
    status === 'completed' ||
    milestoneStatuses.every(milestoneStatus => ['approved', 'paid'].includes(milestoneStatus))
  ) {
    return 'Complete';
  }
  return 'In Progress';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string') return message;
  }
  return 'Could not load contractor dashboard.';
}

export default function ContractorDashboard() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [contractor, setContractor] = React.useState<ContractorProfile | null>(null);
  const [activeProjects, setActiveProjects] = React.useState<EnrichedActiveProject[]>([]);
  const [unawardedProjects, setUnawardedProjects] = React.useState<EnrichedUnawardedProject[]>([]);
  const [stats, setStats] = React.useState({
    opportunitiesCount: 0,
    submittedQuotesCount: 0,
    activeCount: 0,
    totalEarnings: 0,
  });

  React.useEffect(() => {
    async function loadData() {
      try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      // 1. Fetch Contractor Profile
      let currentCont: ContractorProfile | null = null;
      if (user) {
        const { data: cData, error: contractorError } = await supabase
          .from('contractor_profiles')
          .select('business_name')
          .eq('profile_id', user.id)
          .maybeSingle();
        if (contractorError) throw contractorError;
        if (cData) currentCont = cData as ContractorProfile;
      }
      setContractor(currentCont);

      // 2. Fetch All Quotes by Contractor
      let quotes: Quote[] = [];
      let totalEarnings = 0;
      if (user) {
        const { data: qData, error: quotesError } = await supabase
          .from('quotes')
          .select('id, project_id, status, price')
          .eq('contractor_id', user.id)
          .order('created_at', { ascending: false });
        if (quotesError) throw quotesError;
        if (qData) quotes = qData as Quote[];

        const { data: payoutData, error: payoutsError } = await supabase
          .from('payouts')
          .select('net_amount')
          .eq('contractor_id', user.id)
          .eq('status', 'sent');
        if (payoutsError) throw payoutsError;
        totalEarnings = (payoutData || []).reduce((sum, payout) => sum + (Number(payout.net_amount) || 0), 0);
      }

      // 3. Fetch All Projects
      let allProjects: Project[] = [];
      if (user) {
        const { data: pData, error: projectsError } = await supabase
          .from('projects')
          .select('id, title, status, awarded_quote_id, homeowner_id, budget, est_mid, city, province')
          .order('created_at', { ascending: false });
        if (projectsError) throw projectsError;
          if (pData) allProjects = pData as Project[];
      }

        // Read profiles to resolve homeowner names
        let profiles: Profile[] = [];
        if (user) {
          const homeownerIds = [...new Set(allProjects.map(project => project.homeowner_id))];
          if (homeownerIds.length > 0) {
            const { data: profData, error: profilesError } = await supabase.from('profiles').select('id, full_name').in('id', homeownerIds);
            if (profilesError) throw profilesError;
            if (profData) profiles = profData as Profile[];
          }
      }

      const acceptedQuoteProjectIds = new Set<string>();
      const contractorQuoteIds = new Set<string>();
      const quoteByProject = new Map<string, Quote>();
      const acceptedQuoteByProject = new Map<string, Quote>();
      for (const quote of quotes) {
        contractorQuoteIds.add(quote.id);
        if (!quoteByProject.has(quote.project_id)) quoteByProject.set(quote.project_id, quote);
        if (quote.status === 'accepted') {
          acceptedQuoteProjectIds.add(quote.project_id);
          if (!acceptedQuoteByProject.has(quote.project_id)) {
            acceptedQuoteByProject.set(quote.project_id, quote);
          }
        }
      }
      const profileById = new Map(profiles.map(profile => [profile.id, profile]));

      // SECTION 1: Active Projects
      // Only projects that have been officially awarded to this contractor
      const awardedRaw = allProjects.filter(p => {
        const isAwardedQuoteOurs = Boolean(p.awarded_quote_id && contractorQuoteIds.has(p.awarded_quote_id));
        return isAwardedQuoteOurs || acceptedQuoteProjectIds.has(p.id);
      });

      const activeList = awardedRaw;
      const awardedProjectIds = activeList.map(project => project.id);
      const milestoneStatusesByProjectId = new Map<string, MilestoneStatus[]>();
      if (awardedProjectIds.length > 0) {
        const { data: milestoneData, error: milestonesError } = await supabase
          .from('milestones')
          .select('project_id, status')
          .in('project_id', awardedProjectIds);
        if (milestonesError) throw milestonesError;
        for (const milestone of (milestoneData || []) as { project_id: string; status: MilestoneStatus }[]) {
          const statuses = milestoneStatusesByProjectId.get(milestone.project_id) || [];
          statuses.push(milestone.status);
          milestoneStatusesByProjectId.set(milestone.project_id, statuses);
        }
      }

      const enrichedActive: EnrichedActiveProject[] = activeList.map(p => {
        const matchingQuote = (p.awarded_quote_id
          ? quotes.find(quote => quote.id === p.awarded_quote_id)
          : null) || acceptedQuoteByProject.get(p.id) || quoteByProject.get(p.id);
        const hoProfile = profileById.get(p.homeowner_id);
        const agreedAmt = matchingQuote?.price || p.budget || p.est_mid || 0;

        return {
          ...p,
          homeowner_name: hoProfile?.full_name || 'Homeowner',
          contractor_name: currentCont?.business_name || 'Contractor',
          agreed_amount: agreedAmt,
          display_status: getProjectDisplayStatus(p.status, milestoneStatusesByProjectId.get(p.id) || []),
          full_location: formatProjectLocation(p.city, p.province),
        };
      });

      // SECTION 2: Unawarded Projects
      // Projects that are still accepting quotations, under homeowner review, or awaiting contractor selection
      const activeProjectIds = new Set(enrichedActive.map(p => p.id));
      const unawardedRaw = allProjects.filter(p => !activeProjectIds.has(p.id) && !['completed', 'cancelled'].includes(p.status));

      const enrichedUnawarded: EnrichedUnawardedProject[] = unawardedRaw.map(p => {
        const myQuote = quoteByProject.get(p.id);
        return {
          ...p,
          myQuote,
          full_location: formatProjectLocation(p.city, p.province),
        };
      });

      setActiveProjects(enrichedActive);
      setUnawardedProjects(enrichedUnawarded);

      const submittedQuotes = quotes.filter(q => ['submitted', 'revision_requested', 'revised'].includes(q.status));
      setStats({
        opportunitiesCount: enrichedUnawarded.length,
        submittedQuotesCount: submittedQuotes.length,
        activeCount: enrichedActive.length,
        totalEarnings,
      });

      } catch (error) {
        setLoadError(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <AppLayout
      userRole="contractor"
      userName={contractor?.business_name || 'Contractor'}
      title="Contractor Dashboard"
      subtitle="Manage active construction contracts and review unawarded project opportunities"
      showBackButton={false}
    >
      <div className="w-full space-y-8 pb-12">
        {loadError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{loadError}</div>}
        {/* Status Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Active Projects</span>
              <HardHat className="w-4 h-4 text-[#136F48]" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats.activeCount}</div>
            <div className="text-xs text-slate-400 mt-1">Awarded & in execution</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Unawarded Opportunities</span>
              <Building2 className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats.opportunitiesCount}</div>
            <div className="text-xs text-slate-400 mt-1">Accepting quotations</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Quotes Under Review</span>
              <FileText className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats.submittedQuotesCount}</div>
            <div className="text-xs text-slate-400 mt-1">Pending homeowner decision</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Trust Rating</span>
              <ShieldCheck className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">5.0 ★</div>
            <div className="text-xs text-slate-400 mt-1">Verified Licensed Builder</div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 1: ACTIVE PROJECTS (OFFICIALLY AWARDED)                          */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#136F48]" />
                Active Projects
              </h2>
              <p className="text-xs text-slate-500">
                Officially awarded contracts with agreed terms. Click View Project to enter the dedicated project workspace.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 w-fit">
              {activeProjects.length} Active {activeProjects.length === 1 ? 'Project' : 'Projects'}
            </span>
          </div>

          {activeProjects.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <HardHat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No active awarded projects</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                When a homeowner accepts your proposal and officially awards the project, it will appear here in your Active Projects workspace.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {activeProjects.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-[#136F48]/40 hover:shadow-md transition-all p-5 flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Name and Status */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PROJECT</span>
                        <h3 className="text-base font-bold text-slate-900 leading-snug mt-0.5">{p.title}</h3>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                        p.display_status === 'Planning'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : p.display_status === 'In Progress'
                          ? 'bg-emerald-50 text-[#136F48] border border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {p.display_status}
                      </span>
                    </div>

                    {/* Project Metadata Fields */}
                    <div className="space-y-2 text-xs border-y border-slate-100 py-3 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Homeowner:</span>
                        <span className="font-semibold text-slate-800">{p.homeowner_name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Location:</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={p.full_location}>
                          {p.full_location}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Contractor:</span>
                        <span className="font-semibold text-slate-800">{p.contractor_name}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-400 font-medium">Agreed Amount:</span>
                        <span className="font-extrabold text-[#136F48] text-sm">
                          {formatCurrency(p.agreed_amount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* View Project Button */}
                  <Link
                    href={`/contractor/projects/${p.id}`}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#136F48] hover:bg-[#0f5939] shadow-xs transition-colors group"
                  >
                    <span>View Project</span>
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </AppLayout>
  );
}
