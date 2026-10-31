'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  ShieldCheck, 
  Users, 
  FileText, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Search,
  ExternalLink
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile, Project, Dispute, ContractorDocument } from '@/types/database';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils/formatters';

type PendingContractor = Pick<ContractorProfile, 'profile_id' | 'business_name' | 'years_experience' | 'service_cities'>;
type DashboardProject = Pick<Project, 'id' | 'title' | 'city' | 'floor_area_sqm' | 'status' | 'est_mid'>;
type OpenDispute = Pick<Dispute, 'id' | 'reason'>;

export default function AdminDashboard() {
  const [loading, setLoading] = React.useState(true);
  const [pendingContractors, setPendingContractors] = React.useState<PendingContractor[]>([]);
  const [contractorCount, setContractorCount] = React.useState(0);
  const [pendingContractorCount, setPendingContractorCount] = React.useState(0);
  const [projects, setProjects] = React.useState<DashboardProject[]>([]);
  const [projectCount, setProjectCount] = React.useState(0);
  const [activeProjectCount, setActiveProjectCount] = React.useState(0);
  const [openDisputes, setOpenDisputes] = React.useState<OpenDispute[]>([]);
  const [disputeCount, setDisputeCount] = React.useState(0);
  const [openDisputeCount, setOpenDisputeCount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [
      { data: pendingContractorsData, count: pendingCount, error: pendingContractorsError },
      { count: totalContractorCount, error: totalContractorsError },
      { data: projectData, count: totalProjectCount, error: projectsError },
      { count: activeCount, error: activeProjectsError },
      { data: disputeData, count: openCount, error: openDisputesError },
      { count: totalDisputeCount, error: disputesError },
    ] = await Promise.all([
      supabase
        .from('contractor_profiles')
        .select('profile_id, business_name, years_experience, service_cities', { count: 'exact' })
        .eq('verification_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(4),
      supabase
        .from('contractor_profiles')
        .select('profile_id', { count: 'exact', head: true }),
      supabase
        .from('projects')
        .select('id, title, city, floor_area_sqm, status, est_mid', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_progress'),
      supabase
        .from('disputes')
        .select('id, reason', { count: 'exact' })
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(4),
      supabase
        .from('disputes')
        .select('id', { count: 'exact', head: true }),
    ]);

    const queryErrors = [
      pendingContractorsError,
      totalContractorsError,
      projectsError,
      activeProjectsError,
      openDisputesError,
      disputesError,
    ];
    setError(queryErrors.filter(Boolean).map(queryError => queryError!.message).join('; ') || null);
    setPendingContractors((pendingContractorsData || []) as PendingContractor[]);
    setPendingContractorCount(pendingCount ?? 0);
    setContractorCount(totalContractorCount ?? 0);
    setProjects((projectData || []) as DashboardProject[]);
    setProjectCount(totalProjectCount ?? 0);
    setActiveProjectCount(activeCount ?? 0);
    setOpenDisputes((disputeData || []) as OpenDispute[]);
    setOpenDisputeCount(openCount ?? 0);
    setDisputeCount(totalDisputeCount ?? 0);

    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Admin Dashboard"
      subtitle="System overview, platform health metrics, and quick access to management workflows"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {/* Admin KPI Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/vetting" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all group">
            <div className="text-xs font-medium text-slate-500 group-hover:text-blue-600">Contractors Registered</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{contractorCount}</div>
            <div className="text-[11px] text-blue-600 mt-0.5 font-medium">
              {pendingContractorCount} pending review →
            </div>
          </Link>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Total Projects</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{projectCount}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {activeProjectCount} active construction
            </div>
          </div>

          <Link href="/admin/disputes" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-red-400 hover:shadow-md transition-all group">
            <div className="text-xs font-medium text-slate-500 group-hover:text-red-600">Open Disputes</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {openDisputeCount}
            </div>
            <div className="text-[11px] text-red-500 mt-0.5 font-medium">Requires settlement →</div>
          </Link>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Escrow Vault Security</div>
            <div className="text-2xl font-bold text-slate-600 mt-1">—</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Status unavailable</div>
          </div>
        </div>

        {/* 2-Column Dashboard Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Action Queue 1: Pending Contractor Vetting */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <h2 className="font-semibold text-slate-900 text-sm">Contractor Vetting Queue</h2>
              </div>
              <Link
                href="/admin/vetting"
                className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                View all ({contractorCount}) →
              </Link>
            </div>

            <div className="p-4 flex-1">
              {pendingContractorCount === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {contractorCount === 0 ? 'No contractors registered yet.' : 'No contractors pending review.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pendingContractors.slice(0, 4).map((c) => (
                    <div key={c.profile_id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                      <div>
                        <div className="font-semibold text-slate-900 text-xs">{c.business_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {c.years_experience} yrs exp • {c.service_cities?.join(', ') || '—'}
                        </div>
                      </div>
                      <Link
                        href="/admin/vetting"
                        className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        Review
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Action Queue 2: Open Disputes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="font-semibold text-slate-900 text-sm">Milestone Dispute Queue</h2>
              </div>
              <Link
                href="/admin/disputes"
                className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                View all ({disputeCount}) →
              </Link>
            </div>

            <div className="p-4 flex-1">
              {openDisputeCount === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No active disputes requiring adjudication.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {openDisputes.slice(0, 4).map((d) => (
                    <div key={d.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                      <div className="max-w-[70%]">
                        <div className="font-semibold text-slate-900 text-xs">Case #{d.id.slice(0, 8)}</div>
                        <div className="text-[11px] text-slate-500 truncate">"{d.reason}"</div>
                      </div>
                      <Link
                        href="/admin/disputes"
                        className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                      >
                        Resolve
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Platform Projects Overview */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Platform Projects Ledger</h2>
            <span className="text-xs text-slate-500">{projectCount} total projects</span>
          </div>

          {projectCount === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No construction projects submitted yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {projects.slice(0, 5).map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{p.title}</div>
                    <div className="text-slate-400">{p.city} • {p.floor_area_sqm} sq.m • <span className="capitalize text-slate-600">{p.status.replace('_', ' ')}</span></div>
                  </div>
                  <div className="font-bold text-slate-900">
                    {p.est_mid ? formatCurrency(p.est_mid) : '—'}
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
