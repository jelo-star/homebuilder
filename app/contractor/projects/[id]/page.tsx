'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import {
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  HardHat,
  ShieldCheck,
  FileSpreadsheet,
  ArrowRight,
  TrendingUp,
  User,
  Phone,
  FileText,
  AlertCircle,
  CreditCard,
  Landmark,
  Layers,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Project, Milestone, Quote, Profile, ContractorProfile, ProjectPlan } from '@/types/database';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils/formatters';

function formatProjectLocation(city?: string | null, province?: string | null): string {
  const parts = [city, province].filter(Boolean) as string[];
  if (parts.length === 0) return 'Location not provided';
  if (parts.length === 2 && parts[0].toLowerCase().includes(parts[1].toLowerCase())) {
    return parts[0];
  }
  return parts.join(', ');
}

export default function ContractorProjectOverviewPage() {
  return (
    <React.Suspense fallback={<div className="p-12 text-center text-slate-400">Loading project overview...</div>}>
      <ContractorProjectOverviewContent />
    </React.Suspense>
  );
}

function ContractorProjectOverviewContent() {
  const params = useParams();
  const projectId = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [project, setProject] = React.useState<Project | null>(null);
  const [homeowner, setHomeowner] = React.useState<Profile | null>(null);
  const [contractor, setContractor] = React.useState<ContractorProfile | null>(null);
  const [awardedQuote, setAwardedQuote] = React.useState<Quote | null>(null);
  const [milestones, setMilestones] = React.useState<Milestone[]>([]);
  const [projectPlan, setProjectPlan] = React.useState<ProjectPlan | null>(null);

  React.useEffect(() => {
    async function loadOverview() {
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
          .select('*')
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

      // 2. Fetch Quote
      let quote: Quote | null = null;
      if (currentProj.awarded_quote_id) {
        if (user) {
          const { data: qData, error: quoteError } = await supabase
            .from('quotes')
            .select('*')
            .eq('id', currentProj.awarded_quote_id)
            .maybeSingle();
          if (quoteError) {
            setLoadError(quoteError.message);
            setLoading(false);
            return;
          }
          if (qData) quote = qData as Quote;
        }
      }
      setAwardedQuote(quote);

      // 3. Fetch Homeowner Profile
      let ho: Profile | null = null;
      if (currentProj.homeowner_id) {
        if (user) {
          const { data: hData, error: homeownerError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentProj.homeowner_id)
            .maybeSingle();
          if (homeownerError) {
            setLoadError(homeownerError.message);
            setLoading(false);
            return;
          }
          if (hData) ho = hData as Profile;
        }
      }
      setHomeowner(ho);

      // 4. Fetch Contractor Profile
      let ct: ContractorProfile | null = null;
      if (user) {
        const { data: cData, error: contractorError } = await supabase
          .from('contractor_profiles')
          .select('*')
          .eq('profile_id', user.id)
          .maybeSingle();
        if (contractorError) {
          setLoadError(contractorError.message);
          setLoading(false);
          return;
        }
        if (cData) ct = cData as ContractorProfile;
      }
      setContractor(ct);

      // 5. Fetch Milestones
      let ms: Milestone[] = [];
      if (user) {
        const { data: msData, error: milestonesError } = await supabase
          .from('milestones')
          .select('*')
          .eq('project_id', projectId)
          .order('seq', { ascending: true });
        if (milestonesError) {
          setLoadError(milestonesError.message);
          setLoading(false);
          return;
        }
        if (msData && msData.length > 0) ms = msData as Milestone[];
      }
      setMilestones(ms);

      // 6. Fetch Project Plan
      let plan: ProjectPlan | null = null;
      if (user) {
        const { data: planData, error: planError } = await supabase
          .from('project_plans')
          .select('*')
          .eq('project_id', projectId)
          .maybeSingle();
        if (planError) {
          setLoadError(planError.message);
          setLoading(false);
          return;
        }
        if (planData) plan = planData as ProjectPlan;
      }
      setProjectPlan(plan);

      setLoading(false);
    }

    loadOverview();
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
        if (active) console.error('Unable to refresh project milestone statuses:', error);
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

  if (loading) {
    return (
      <AppLayout
        userRole="contractor"
        title="Project Workspace"
        subtitle="Loading project details..."
        workspace={{
          projectId,
          projectTitle: 'Loading...',
          projectRef: `PRJ-${projectId.slice(-6).toUpperCase()}`,
        }}
      >
        <div className="p-12 text-center text-slate-400">Loading project overview...</div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout userRole="contractor" title="Project Unavailable" backHref="/contractor/projects">
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

  const agreedAmount = awardedQuote?.price || project.budget || project.est_mid || 0;
  const projectRef = `PRJ-${project.id.slice(-6).toUpperCase()}`;

  // Derive 3 official statuses: Planning, Building, Complete
  // Rule: Do not mark a project as Building until the required project plan has been approved and construction has officially started!
  let displayStatus: 'Planning' | 'Building' | 'Complete' = 'Planning';
  if (project.status === 'completed') {
    displayStatus = 'Complete';
  } else if (projectPlan?.status === 'approved' || (project.status === 'in_progress' && milestones.length > 0)) {
    displayStatus = 'Building';
  } else {
    displayStatus = 'Planning';
  }

  // Plan Status
  const planStatus = projectPlan?.status || 'not submitted';

  // Milestone Metrics
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'paid' || m.status === 'approved').length;
  const pendingMilestones = totalMilestones - completedMilestones;
  const totalAllocated = milestones.reduce((sum, m) => sum + Number(m.amount), 0);
  const totalPaid = milestones
    .filter(m => m.status === 'paid')
    .reduce((sum, m) => sum + Number(m.amount), 0);
  const remainingBalance = Math.max(0, agreedAmount - totalPaid);

  const progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  // Dates
  const startDate = awardedQuote?.created_at ? formatDate(awardedQuote.created_at) : formatDate(project.created_at);
  const targetEndDate = milestones[milestones.length - 1]?.end_date
    ? formatDate(milestones[milestones.length - 1].end_date!)
    : 'Not scheduled';

  return (
    <AppLayout
      userRole="contractor"
      userName={contractor?.business_name || 'Contractor'}
      title="Project Overview"
      subtitle={`${project.title} • ${formatProjectLocation(project.city, project.province)}`}
      workspace={{
        projectId: project.id,
        projectTitle: project.title,
        projectRef,
      }}
    >
      <div className="flex w-full flex-col space-y-6 pb-12">
        {/* Project details card */}
        <div className="order-2 bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6">
          <h2 className="mb-3 text-sm font-bold text-slate-900">Project Details</h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-[#136F48] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {projectRef}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-2">{project.title}</h1>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatProjectLocation(project.city, project.province)}</span>
            <span>•</span>
            <span>{project.floor_area_sqm} sq.m ({project.floors} flr)</span>
            <span>•</span>
            <span className="capitalize">{project.finish_level} Finish</span>
          </p>
        </div>

        {/* 4 Financial & Timeline KPI Cards */}
        <div className="order-1 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Agreed Contract Amount</span>
              <DollarSign className="w-4 h-4 text-[#136F48]" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-2">{formatCurrency(agreedAmount)}</div>
            <div className="text-xs text-slate-400 mt-1">Official contract total</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Payments Received</span>
              <Landmark className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-2">{formatCurrency(totalPaid)}</div>
            <div className="text-xs text-blue-600 mt-1 font-medium">Released to payout account</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Remaining Balance</span>
              <CreditCard className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-2">{formatCurrency(remainingBalance)}</div>
            <div className="text-xs text-slate-400 mt-1">Pending subsequent tranches</div>
          </div>

        </div>

        {/* 2-Column Overview Details */}
        <div className="order-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column (2 Cols): Project Details and Timeline */}
          <div className="lg:col-span-2 space-y-6">
            {/* Project Specifications Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Project Parameters & Timeline</h2>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {capitalize(project.status.replace('_', ' '))}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Contract Start Date</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    {startDate}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Target Completion</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    {targetEndDate}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Lot Area</span>
                  <span className="font-bold text-slate-800">{project.lot_area_sqm ? `${project.lot_area_sqm} sq.m` : 'Not provided'}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Floor Area</span>
                  <span className="font-bold text-slate-800">{project.floor_area_sqm} sq.m ({project.floors} flr)</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Work Type</span>
                  <span className="font-bold text-slate-800 capitalize">{project.work_type.replace('_', ' ')}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Finish Level</span>
                  <span className="font-bold text-slate-800 capitalize">{project.finish_level} Finish</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">House Type</span>
                  <span className="font-bold text-slate-800 capitalize">{project.house_type.replace('_', ' ')}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Bedrooms</span>
                  <span className="font-bold text-slate-800">{project.bedrooms ?? 'Not provided'}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Bathrooms</span>
                  <span className="font-bold text-slate-800">{project.bathrooms ?? 'Not provided'}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Desired Start</span>
                  <span className="font-bold text-slate-800 capitalize">{project.desired_start ? project.desired_start.replace(/_/g, ' ') : 'Not provided'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (1 Col): Parties, Verification, and Next Steps */}
          <div className="space-y-6">
            {/* Homeowner Information */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Homeowner Information</h3>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-[#136F48] font-bold flex items-center justify-center text-sm border border-emerald-200">
                  {homeowner?.full_name ? homeowner.full_name.charAt(0).toUpperCase() : 'H'}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">{homeowner?.full_name || 'Homeowner'}</div>
                  <div className="text-xs text-slate-400">Verified Client</div>
                </div>
              </div>
              <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">Phone:</span>
                  <span className="font-semibold text-slate-800">{homeowner?.phone || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Location:</span>
                  <span className="font-semibold text-slate-800">{homeowner?.city || project.city}</span>
                </div>
                {homeowner?.address && (
                  <div className="flex justify-between gap-3">
                    <span className="shrink-0 text-slate-400">Address:</span>
                    <span className="text-right font-semibold text-slate-800">{homeowner.address}</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppLayout>
  );
}
