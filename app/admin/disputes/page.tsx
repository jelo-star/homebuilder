'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldAlert,
  ShieldCheck,
  Scale,
  Building2,
  Search,
  RefreshCw,
  MapPin,
  Eye,
  FileText,
  X,
  Plus,
  ArrowRight,
  Check,
  RotateCcw,
  DollarSign,
  User,
  Wrench,
  AlertCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Dispute, DisputeStatus, Milestone } from '@/types/database';
import { formatDate, formatCurrency, formatNumberInput, parseNumberInput, capitalize } from '@/lib/utils/formatters';

interface ProjectDisputeSummary {
  id: string;
  homeownerId: string;
  title: string;
  location: string;
  homeownerName: string;
  contractorName: string;
  status: string;
  contractPrice: number;
}

const PROJECTS_PER_PAGE = 20;
const QUERY_PAGE_SIZE = 500;

// Clean helper to remove underscores and format nicely
function removeUnderscore(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export default function AdminDisputesPage() {
  const [loading, setLoading] = useState(true);
  const [projectDataLoaded, setProjectDataLoaded] = useState(false);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [disputeCounts, setDisputeCounts] = useState({ all: 0, open: 0, resolved: 0 });
  const [projects, setProjects] = useState<ProjectDisputeSummary[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [projectPage, setProjectPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Modals
  const [viewingDispute, setViewingDispute] = useState<Dispute | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [updatingFixDispute, setUpdatingFixDispute] = useState<Dispute | null>(null);
  const [fixStatusInput, setFixStatusInput] = useState<'fixed' | 'in_progress' | 'not_fixed'>('in_progress');
  const [fixNoteInput, setFixNoteInput] = useState('');

  const [logForm, setLogForm] = useState({
    projectId: '',
    milestoneId: '',
    milestoneName: '',
    milestoneAmount: '' as string,
    openedBy: '',
    reason: '',
    contractorFixStatus: 'in_progress' as const
  });

  const projectsById = useMemo(() => {
    const projectMap = new Map<string, ProjectDisputeSummary>();
    for (const project of projects) {
      if (!projectMap.has(project.id)) projectMap.set(project.id, project);
    }
    return projectMap;
  }, [projects]);
  const milestonesById = useMemo(() => {
    const milestoneMap = new Map<string, Milestone>();
    for (const milestone of milestones) {
      if (!milestoneMap.has(milestone.id)) milestoneMap.set(milestone.id, milestone);
    }
    return milestoneMap;
  }, [milestones]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setProjectDataLoaded(false);
    setError(null);
    const supabase = createClient();

    try {
      const [
        { data: pData, error: projectsError },
        { data: qData, error: quotesError },
        { data: mData, error: milestonesError },
        { count: totalDisputes, error: totalDisputesError },
        { count: openDisputes, error: openDisputesError },
        { count: resolvedDisputes, error: resolvedDisputesError },
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('*, profiles:homeowner_id(full_name)'),
        supabase
          .from('quotes')
          .select('*, contractor_profiles(*)'),
        supabase
          .from('milestones')
          .select('*')
          .order('seq', { ascending: true }),
        supabase
          .from('disputes')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('disputes')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from('disputes')
          .select('id', { count: 'exact', head: true })
          .like('status', 'resolved%'),
      ]);

      const queryErrors = [
        projectsError,
        quotesError,
        milestonesError,
        totalDisputesError,
        openDisputesError,
        resolvedDisputesError,
      ].filter(Boolean);
      if (queryErrors.length) setError(queryErrors.map(queryError => queryError!.message).join('; '));
      setDisputeCounts({
        all: totalDisputes || 0,
        open: openDisputes || 0,
        resolved: resolvedDisputes || 0,
      });

      type QuoteRecord = NonNullable<typeof qData>[number];
      const firstQuoteByProject = new Map<QuoteRecord['project_id'], QuoteRecord>();
      const acceptedQuoteByProject = new Map<QuoteRecord['project_id'], QuoteRecord>();
      for (const quote of qData || []) {
        if (!firstQuoteByProject.has(quote.project_id)) {
          firstQuoteByProject.set(quote.project_id, quote);
        }
        if (quote.status === 'accepted' && !acceptedQuoteByProject.has(quote.project_id)) {
          acceptedQuoteByProject.set(quote.project_id, quote);
        }
      }

      const projList: ProjectDisputeSummary[] = (pData || []).map((p: any) => {
        const acceptedQuote = acceptedQuoteByProject.get(p.id) || firstQuoteByProject.get(p.id);

        const contractorName = acceptedQuote?.contractor_profiles?.business_name || '—';

        const contractPrice = acceptedQuote?.price 
          ? Number(acceptedQuote.price) 
          : (Number(p.budget) || Number(p.est_mid) || 0);

        return {
          id: p.id,
          homeownerId: p.homeowner_id,
          title: p.title || 'Untitled project',
          location: [p.city, p.province].filter(Boolean).join(', ') || 'Location unavailable',
          homeownerName: p.profiles?.full_name || '—',
          contractorName,
          status: p.status || 'in_progress',
          contractPrice
        };
      });

      setProjects(projList);
      setMilestones((mData || []) as Milestone[]);
      setProjectDataLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dispute records.');
      setProjectDataLoaded(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Execute Dispute Resolution
  const handleResolveDispute = async (
    dispute: Dispute, 
    resolutionType: 'pay_contractor' | 'refund_homeowner' | 'split'
  ) => {
    setActionLoading(dispute.id);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id || null;
      const now = new Date().toISOString();

      const totalContested = Number(milestonesById.get(dispute.milestone_id)?.amount)
        || Number(dispute.contractor_amount)
        || Number(dispute.homeowner_amount)
        || 0;
      if (totalContested <= 0) throw new Error('The dispute has no contested amount to settle.');
      let newStatus: DisputeStatus = 'resolved_paid';
      let resolutionNote = 'Resolved by Administrator: Released 100% of milestone escrow to Contractor.';
      let contractorShare = totalContested;
      let homeownerShare = 0;

      if (resolutionType === 'refund_homeowner') {
        newStatus = 'resolved_refund';
        resolutionNote = 'Resolved by Administrator: Refunded 100% of milestone escrow to Homeowner.';
        contractorShare = 0;
        homeownerShare = totalContested;
      } else if (resolutionType === 'split') {
        newStatus = 'resolved_split';
        resolutionNote = 'Resolved by Administrator: 50/50 Compromise split between Contractor & Homeowner.';
        contractorShare = Math.round(totalContested / 2);
        homeownerShare = totalContested - contractorShare;
      }

      const updatedDispute: Dispute = {
        ...dispute,
        status: newStatus,
        resolution: resolutionNote,
        contractor_amount: contractorShare,
        homeowner_amount: homeownerShare,
        resolved_by: adminId,
        resolved_at: now,
        updated_at: now
      };

      const { error: resolutionError } = await supabase.rpc('resolve_dispute', {
        p_dispute_id: dispute.id,
        p_resolution: newStatus,
        p_contractor_amount: contractorShare,
        p_homeowner_amount: homeownerShare,
      });
      if (resolutionError) throw resolutionError;

      // Update Local React State
      setDisputes(prev => prev.map(d => d.id === dispute.id ? updatedDispute : d));
      if (dispute.status === 'open') {
        setDisputeCounts(prev => ({
          ...prev,
          open: Math.max(0, prev.open - 1),
          resolved: prev.resolved + 1,
        }));
      }
      if (viewingDispute && viewingDispute.id === dispute.id) {
        setViewingDispute(updatedDispute);
      }

      setSuccessMsg(`Dispute successfully resolved (${removeUnderscore(resolutionType)})!`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to resolve dispute.');
    } finally {
      setActionLoading(null);
    }
  };

  // Update Contractor Fix Status
  const handleUpdateFixStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingFixDispute) return;

    const now = new Date().toISOString();
    const updated: Dispute = {
      ...updatingFixDispute,
      contractor_fix_status: fixStatusInput,
      contractor_fix_note: fixNoteInput.trim() || updatingFixDispute.contractor_fix_note,
      contractor_fixed_at: fixStatusInput === 'fixed' ? now : updatingFixDispute.contractor_fixed_at,
      updated_at: now
    };

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('disputes')
        .update({
          contractor_fix_status: fixStatusInput,
          contractor_fix_note: updated.contractor_fix_note,
          contractor_fixed_at: updated.contractor_fixed_at,
          updated_at: now
        })
        .eq('id', updatingFixDispute.id);
      if (error) throw error;

      setDisputes(prev => prev.map(d => d.id === updated.id ? updated : d));
      if (viewingDispute && viewingDispute.id === updated.id) setViewingDispute(updated);
      setUpdatingFixDispute(null);
      setSuccessMsg(`Contractor fix status updated to "${removeUnderscore(fixStatusInput)}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update contractor fix status.');
    }
  };

  // Submit New Milestone Dispute
  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logForm.reason.trim()) return;

    const targetProjId = logForm.projectId;
    if (!targetProjId) {
      setError('Select a project before creating a dispute.');
      return;
    }
    if (!logForm.milestoneId) {
      setError('Select a milestone before creating a dispute.');
      return;
    }
    const targetProj = projectsById.get(targetProjId);
    if (!targetProj?.homeownerId) {
      setError('The selected project does not have a homeowner profile.');
      return;
    }
    const parsedAmount = parseNumberInput(logForm.milestoneAmount);
    if (parsedAmount <= 0) {
      setError('Enter a contested milestone amount greater than zero.');
      return;
    }
    const newDispute = {
      project_id: targetProjId,
      milestone_id: logForm.milestoneId,
      opened_by: targetProj.homeownerId,
      reason: logForm.reason.trim(),
      status: 'open',
      contractor_amount: parsedAmount,
      homeowner_amount: parsedAmount,
      contractor_fix_status: logForm.contractorFixStatus,
      contractor_fix_note: 'Contractor notified to rectify the reported complaint.',
    };

    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase.from('disputes').insert(newDispute).select('*').single();
      if (insertError) throw insertError;
      const { error: projectError } = await supabase.from('projects').update({ status: 'disputed' }).eq('id', targetProjId);
      if (projectError) throw projectError;
      if (!data) throw new Error('Supabase did not return the created dispute.');
      setDisputes(prev => [data as Dispute, ...prev]);
      setDisputeCounts(prev => ({ ...prev, all: prev.all + 1, open: prev.open + 1 }));
      setIsLogModalOpen(false);
      setLogForm({
        projectId: '',
        milestoneId: '',
        milestoneName: '',
        milestoneAmount: '',
        openedBy: '',
        reason: '',
        contractorFixStatus: 'in_progress'
      });
      setSuccessMsg('New milestone complaint recorded successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create dispute.');
    }
  };

  // Filtered Projects List
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesProject = selectedProjectId === 'all' || p.id === selectedProjectId;
      const matchesSearch = searchTerm === '' ||
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.homeownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.contractorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.location.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesProject && matchesSearch;
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
  const disputesByProject = useMemo(() => {
    const disputeMap = new Map<string, Dispute[]>();
    for (const dispute of disputes) {
      const projectId = dispute.project_id || projects[0]?.id;
      if (!projectId) continue;
      const projectDisputes = disputeMap.get(projectId) || [];
      projectDisputes.push(dispute);
      disputeMap.set(projectId, projectDisputes);
    }
    return disputeMap;
  }, [disputes, projects]);

  useEffect(() => {
    if (!projectDataLoaded) return;
    if (pagedProjectIds.length === 0) return;

    let cancelled = false;
    async function loadPageDisputes() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const pageDisputes: Dispute[] = [];
        const includeUnassigned = pagedProjectIds.includes(projects[0]?.id);
        for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
          let query = supabase
            .from('disputes')
            .select('*')
            .order('created_at', { ascending: false })
            .order('id', { ascending: true });
          query = includeUnassigned
            ? query.or(`project_id.in.(${pagedProjectIds.join(',')}),project_id.is.null`)
            : query.in('project_id', pagedProjectIds);
          const { data, error: queryError } = await query.range(offset, offset + QUERY_PAGE_SIZE - 1);
          if (queryError) throw queryError;
          const rows = (data || []) as Dispute[];
          pageDisputes.push(...rows);
          if (rows.length < QUERY_PAGE_SIZE) break;
        }
        if (!cancelled) setDisputes(pageDisputes);
      } catch (err) {
        if (!cancelled) {
          setDisputes([]);
          setError(err instanceof Error ? err.message : 'Unable to load dispute records.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPageDisputes();
    return () => {
      cancelled = true;
    };
  }, [pagedProjectIds, projectDataLoaded, projects]);

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Dispute Settlement & Mediation"
      subtitle="Neutral escrow adjudication, milestone reviews, and contractor rectification tracking by project"
      backHref="/admin/dashboard"
      showBackButton={true}
    >
      {/* Floating Action Notice Toast */}
      {successMsg && (
        <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-xl text-emerald-800 flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="font-semibold leading-relaxed">{successMsg}</div>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg('')}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {error && <div role="alert" className="mx-4 mt-4 p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}

      <div className="w-full space-y-5">
        {/* TOP BAR: PROJECT SELECTOR, STATUS TABS, SEARCH & ACTIONS */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          {/* Left: Project Selector & Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
              <Building2 className="w-4 h-4 text-blue-600" />
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setProjectPage(0);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">📁 All Projects ({projects.length})</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Pills without underscores */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All ({disputeCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setFilter('open')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                  filter === 'open'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Open / Escrow Frozen ({disputeCounts.open})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilter('resolved')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                  filter === 'resolved'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Resolved ({disputeCounts.resolved})</span>
              </button>
            </div>
          </div>

          {/* Right: Search, Refresh & Log Complaint */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search complaint, project..."
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
              onClick={() => {
                loadData();
                setSuccessMsg('Dispute records refreshed.');
              }}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition shrink-0"
              title="Refresh Records"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setLogForm(prev => ({
                  ...prev,
                  projectId: selectedProjectId !== 'all' ? selectedProjectId : (projects[0]?.id || '')
                }));
                setIsLogModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Milestone Complaint</span>
            </button>
          </div>
        </div>

        {/* PROJECTS DISPUTE LIST: ORGANIZED STRICTLY BY PROJECT */}
        {loading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">
            Loading project disputes and escrow claims...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">
            No projects found matching the selected criteria.
          </div>
        ) : (
          pagedProjects.map((proj) => {
            // All disputes for this specific project
            const projDisputes = disputesByProject.get(proj.id) || [];

            // Filtered disputes according to active filter tab
            const visibleDisputes = projDisputes.filter(d => {
              if (filter === 'all') return true;
              if (filter === 'open') return d.status === 'open';
              return d.status.startsWith('resolved');
            });

            const openCount = projDisputes.filter(d => d.status === 'open').length;
            const disputedEscrowAmount = projDisputes
              .filter(d => d.status === 'open')
              .reduce((sum, d) => sum + (Number(d.contractor_amount) || Number(d.homeowner_amount) || 0), 0);

            return (
              <div key={proj.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                {/* 1. PROJECT HEADER BAR */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                      openCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {openCount > 0 ? <AlertTriangle className="w-5 h-5 text-amber-600" /> : <Building2 className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link 
                          href={`/admin/projects/${proj.id}`}
                          className="font-bold text-slate-900 text-sm hover:text-blue-600 transition"
                        >
                          {proj.title}
                        </Link>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          openCount > 0
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {openCount > 0 ? `${openCount} Active Dispute${openCount > 1 ? 's' : ''}` : 'No Contested Escrow'}
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

                  {/* RIGHT: MINI FINANCIAL & OVERVIEW PILLS */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className={`px-3 py-1.5 rounded-xl border ${
                      openCount > 0
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}>
                      <span className="text-[10px] uppercase font-bold block opacity-75">
                        Contested Escrow
                      </span>
                      <strong className="font-mono text-xs">
                        ₱{disputedEscrowAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </strong>
                    </div>

                    <Link
                      href={`/admin/projects/${proj.id}`}
                      className="px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Project Overview</span>
                    </Link>
                  </div>
                </div>

                {/* 2. DISPUTES TABLE: COLUMNS REQUESTED BY USER */}
                {/* PROJECT NAME | HOME OWNER | CONTRACTOR | COMPLAINT | STATUS | IF CONTRACTOR FIX IT OR NOT | ACTIONS */}
                {visibleDisputes.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50/30">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-slate-800 text-xs">No Contested Milestones for this Project</h4>
                      <p className="text-[11px] text-slate-500 mt-1">
                        All escrow deposits and construction progressions for this project are currently undisputed and in good standing.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setLogForm(prev => ({ ...prev, projectId: proj.id }));
                          setIsLogModalOpen(true);
                        }}
                        className="mt-3 px-3 py-1.5 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:bg-white transition"
                      >
                        + Log Milestone Dispute for this Project
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3">Project Name</th>
                          <th className="px-4 py-3">Home Owner</th>
                          <th className="px-4 py-3">Contractor</th>
                          <th className="px-4 py-3">Complaint</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">If Contractor Fix It or Not</th>
                          <th className="px-4 py-3 text-right">Arbitration Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleDisputes.map((d) => {
                          const isOpen = d.status === 'open';
                          const isPaid = d.status === 'resolved_paid';
                          const isRefund = d.status === 'resolved_refund';
                          const isSplit = d.status === 'resolved_split';
                          const isFixAccepted = d.status === 'resolved_fix';

                          const milestone = milestonesById.get(d.milestone_id);
                          const milestoneName = milestone
                            ? `Stage ${milestone.seq}: ${removeUnderscore(milestone.name)}`
                            : (d.milestone_id ? removeUnderscore(d.milestone_id) : 'Contested Milestone');
                          const amount = Number(d.contractor_amount) || Number(d.homeowner_amount) || 0;

                          // Clean fix status (no underscores)
                          const fixStatus = d.contractor_fix_status || 'in_progress';
                          const isFixed = fixStatus === 'fixed';
                          const isFixInProgress = fixStatus === 'in_progress';
                          const isNotFixed = fixStatus === 'not_fixed';

                          return (
                            <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                              {/* 1. PROJECT NAME (NO Case ID underneath!) */}
                              <td className="px-4 py-3.5">
                                <Link 
                                  href={`/admin/projects/${proj.id}`}
                                  className="font-bold text-slate-900 hover:text-blue-600 transition text-xs block"
                                >
                                  {proj.title}
                                </Link>
                                <span className="text-[11px] text-blue-700 font-semibold block mt-0.5">
                                  {milestoneName}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  ₱{amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} in Vault
                                </span>
                              </td>

                              {/* 2. HOME OWNER */}
                              <td className="px-4 py-3.5">
                                <div className="font-semibold text-slate-900">
                                  {d.opened_by || proj.homeownerName || '—'}
                                </div>
                                <span className="text-[10px] text-slate-400 block">
                                  Homeowner
                                </span>
                              </td>

                              {/* 3. CONTRACTOR */}
                              <td className="px-4 py-3.5">
                                <div className="font-semibold text-slate-900">
                                  {proj.contractorName}
                                </div>
                                <span className="text-[10px] text-slate-400 block">
                                  Lead Contractor
                                </span>
                              </td>

                              {/* 4. COMPLAINT */}
                              <td className="px-4 py-3.5 max-w-xs">
                                <p className="text-xs text-slate-800 leading-snug line-clamp-2 italic bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                                  "{d.reason}"
                                </p>
                                {d.resolution && (
                                  <div className="text-[10px] text-emerald-800 bg-emerald-50/80 p-1.5 rounded-lg border border-emerald-100 mt-1 font-medium">
                                    ✓ {d.resolution}
                                  </div>
                                )}
                              </td>

                              {/* 5. STATUS (Clean, NO UNDERSCORES) */}
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                  isOpen
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : isPaid
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : isRefund
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : isFixAccepted
                                    ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                    : 'bg-purple-50 text-purple-800 border border-purple-200'
                                }`}>
                                  {isOpen && <Clock className="w-3 h-3 text-amber-600" />}
                                  {isPaid && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                  {isRefund && <RotateCcw className="w-3 h-3 text-blue-600" />}
                                  {isSplit && <Scale className="w-3 h-3 text-purple-600" />}
                                  {isFixAccepted && <CheckCircle2 className="w-3 h-3 text-teal-600" />}
                                  <span>
                                    {isOpen ? 'Open Escrow Frozen' : isFixAccepted ? 'Fix Accepted — In Progress' : removeUnderscore(d.status)}
                                  </span>
                                </span>
                              </td>

                              {/* 6. IF CONTRACTOR FIX IT OR NOT */}
                              <td className="px-4 py-3.5">
                                <div className="flex flex-col gap-1 items-start">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUpdatingFixDispute(d);
                                      setFixStatusInput((d.contractor_fix_status as any) || 'in_progress');
                                      setFixNoteInput(d.contractor_fix_note || '');
                                    }}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition shadow-2xs hover:scale-102 ${
                                      isFixed
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                        : isFixInProgress
                                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                                        : 'bg-red-50 text-red-800 border-red-300'
                                    }`}
                                    title="Click to update fix status"
                                  >
                                    {isFixed ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : isFixInProgress ? (
                                      <Wrench className="w-3.5 h-3.5 text-amber-600" />
                                    ) : (
                                      <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                    )}
                                    <span>
                                      {isFixed
                                        ? 'Fixed (Ready for Sign-off)'
                                        : isFixInProgress
                                        ? 'Fix in Progress'
                                        : 'Not Fixed Yet'}
                                    </span>
                                  </button>

                                  {d.contractor_fix_note && (
                                    <div className="text-[10px] text-slate-500 max-w-[180px] line-clamp-1 italic">
                                      {d.contractor_fix_note}
                                    </div>
                                  )}

                                  {d.contractor_fix_proof_url && (
                                    <button
                                      type="button"
                                      onClick={() => setViewingDispute(d)}
                                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 mt-0.5 hover:underline"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>View Fix Photo Proof</span>
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* 7. ARBITRATION ACTIONS */}
                              <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                {isOpen ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    {/* Action: Release to Contractor */}
                                    <button
                                      type="button"
                                      disabled={actionLoading === d.id}
                                      onClick={() => handleResolveDispute(d, 'pay_contractor')}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold shadow-2xs transition inline-flex items-center gap-1 disabled:opacity-50"
                                      title="Release milestone escrow to contractor"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Pay Contractor</span>
                                    </button>

                                    {/* Action: Refund to Homeowner */}
                                    <button
                                      type="button"
                                      disabled={actionLoading === d.id}
                                      onClick={() => handleResolveDispute(d, 'refund_homeowner')}
                                      className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[11px] font-bold shadow-2xs transition inline-flex items-center gap-1 disabled:opacity-50"
                                      title="Refund milestone escrow back to homeowner"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      <span>Refund Homeowner</span>
                                    </button>

                                    {/* Action: 50/50 Split */}
                                    <button
                                      type="button"
                                      disabled={actionLoading === d.id}
                                      onClick={() => handleResolveDispute(d, 'split')}
                                      className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[11px] font-bold shadow-2xs transition inline-flex items-center gap-1 disabled:opacity-50"
                                      title="Split contested escrow 50/50"
                                    >
                                      <Scale className="w-3 h-3" />
                                      <span>50/50 Split</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setViewingDispute(d)}
                                      className="p-1.5 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                                      title="Inspect full details"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setViewingDispute(d)}
                                      className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition inline-flex items-center gap-1"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>View Decision</span>
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
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

      {/* MODAL: UPDATE IF CONTRACTOR FIX IT OR NOT */}
      {updatingFixDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form onSubmit={handleUpdateFixStatus} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-600" />
                  Contractor Fix & Rectification Status
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record whether the contractor has repaired the reported issue
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpdatingFixDispute(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Has the Contractor Fixed It?</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFixStatusInput('fixed')}
                    className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                      fixStatusInput === 'fixed'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Fixed</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFixStatusInput('in_progress')}
                    className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                      fixStatusInput === 'in_progress'
                        ? 'bg-amber-50 border-amber-500 text-amber-800 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Wrench className="w-4 h-4 text-amber-600" />
                    <span>In Progress</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFixStatusInput('not_fixed')}
                    className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                      fixStatusInput === 'not_fixed'
                        ? 'bg-red-50 border-red-500 text-red-800 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span>Not Fixed</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Rectification & Repair Notes:</label>
                <textarea
                  value={fixNoteInput}
                  onChange={(e) => setFixNoteInput(e.target.value)}
                  placeholder="Detail the contractor's repair actions, inspection results, or structural re-test proof..."
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setUpdatingFixDispute(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition"
              >
                Save Fix Status
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: VIEW DISPUTE CLAIM & ARBITRATION DETAIL */}
      {viewingDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Dispute & Rectification Adjudication
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Platform Escrow Arbitration Record
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingDispute(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Contested Milestone:</span>
                  <span className="font-bold text-slate-800">
                    {(() => {
                      const milestone = milestonesById.get(viewingDispute.milestone_id);
                      return milestone
                        ? `Stage ${milestone.seq}: ${removeUnderscore(milestone.name)}`
                        : (viewingDispute.milestone_id ? `Milestone (${removeUnderscore(viewingDispute.milestone_id)})` : 'Contested Milestone');
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Escrow Value at Stake:</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    ₱{(Number(viewingDispute.contractor_amount) || Number(viewingDispute.homeowner_amount) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Filed by:</span>
                  <span className="font-semibold text-slate-800">{viewingDispute.opened_by}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Filing Date:</span>
                  <span>{formatDate(viewingDispute.created_at)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500">Fix Status:</span>
                  <span className={`font-bold uppercase px-2 py-0.5 rounded text-[10px] ${
                    viewingDispute.contractor_fix_status === 'fixed'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    {viewingDispute.contractor_fix_status === 'fixed' ? 'Fixed (Ready for Sign-off)' : 'In Progress'}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Complainant Claim & Statement:</label>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 leading-relaxed italic">
                  "{viewingDispute.reason}"
                </div>
              </div>

              {viewingDispute.contractor_fix_note && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Contractor Repair & Rectification Proof:</label>
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 font-medium">
                    {viewingDispute.contractor_fix_note}
                  </div>
                </div>
              )}

              {viewingDispute.contractor_fix_proof_url && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Attached Rectification Photo Proof:</label>
                  <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 max-h-48 flex items-center justify-center">
                    <img
                      src={viewingDispute.contractor_fix_proof_url}
                      alt="Rectification Photo Proof"
                      className="max-h-48 max-w-full object-contain"
                    />
                  </div>
                </div>
              )}

              {viewingDispute.resolution && (
                <div>
                  <label className="font-bold text-emerald-800 block mb-1">Administrative Adjudication Ruling:</label>
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 font-medium">
                    ✓ {viewingDispute.resolution}
                  </div>
                  {viewingDispute.resolved_at && (
                    <div className="text-[10px] text-slate-400 mt-1">
                      Ruled on {formatDate(viewingDispute.resolved_at)} by Platform Administrator
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Arbitration Buttons in Modal */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              {viewingDispute.status === 'open' ? (
                <>
                  <button
                    type="button"
                    disabled={actionLoading === viewingDispute.id}
                    onClick={() => handleResolveDispute(viewingDispute, 'pay_contractor')}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Pay Contractor</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading === viewingDispute.id}
                    onClick={() => handleResolveDispute(viewingDispute, 'refund_homeowner')}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Refund Homeowner</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading === viewingDispute.id}
                    onClick={() => handleResolveDispute(viewingDispute, 'split')}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>50/50 Split</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setViewingDispute(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LOG NEW MILESTONE COMPLAINT */}
      {isLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form onSubmit={handleCreateDispute} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  Log Milestone Complaint by Project
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Freeze milestone escrow and record formal arbitration proceedings
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Project:</label>
                <select
                  value={logForm.projectId}
                  onChange={(e) => {
                    const projId = e.target.value;
                    const matchedProj = projectsById.get(projId);
                    const projMilestones = milestones.filter(m => m.project_id === projId);
                    const firstM = projMilestones[0];
                    setLogForm(prev => ({ 
                      ...prev, 
                      projectId: projId,
                      openedBy: matchedProj?.homeownerName || prev.openedBy,
                      milestoneId: firstM?.id || '',
                      milestoneName: firstM?.name || '',
                      milestoneAmount: firstM ? String(firstM.amount) : ''
                    }));
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select target project...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.homeownerName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Contested Milestone:</label>
                <select
                  value={logForm.milestoneName}
                  onChange={(e) => {
                    const name = e.target.value;
                    const projMilestones = milestones.filter(m => !logForm.projectId || m.project_id === logForm.projectId);
                    const matched = projMilestones.find(m => m.name === name);
                    const amt = matched ? String(matched.amount) : '';
                    setLogForm(prev => ({ 
                      ...prev, 
                      milestoneName: name, 
                      milestoneId: matched?.id || '',
                      milestoneAmount: amt 
                    }));
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select milestone to contest...</option>
                  {milestones.filter(m => !logForm.projectId || m.project_id === logForm.projectId).map(m => (
                    <option key={m.id} value={m.name}>
                      {m.name} (₱{Number(m.amount).toLocaleString('en-US', { maximumFractionDigits: 0 })})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Complainant Name:</label>
                  <input
                    type="text"
                    value={logForm.openedBy}
                    readOnly
                    placeholder="Complainant name"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Frozen Escrow Amount:</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">₱</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatNumberInput(logForm.milestoneAmount)}
                      onChange={(e) => setLogForm(prev => ({ ...prev, milestoneAmount: formatNumberInput(e.target.value) }))}
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Complaint & Alleged Issue:</label>
                <textarea
                  value={logForm.reason}
                  onChange={(e) => setLogForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Detail the alleged defect, missed specification, or reason milestone funds are contested..."
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition"
              >
                Submit & Freeze Escrow
              </button>
            </div>
          </form>
        </div>
      )}
    </AppLayout>
  );
}
