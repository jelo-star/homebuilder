'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Save,
  Send,
  Calendar,
  DollarSign,
  MessageSquare,
  Clock,
  Sparkles,
  Info,
  Check,
  ChevronRight,
  User,
  HardHat
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  Project,
  Quote,
  Profile,
  ContractorProfile,
  ProjectPlan,
  ProjectPlanComment,
  Milestone
} from '@/types/database';
import { formatCurrency, formatDate, formatNumberInput, parseNumberInput, capitalize } from '@/lib/utils/formatters';

export interface PlanMilestoneRow {
  id: string;
  seq: number;
  name: string;
  description: string;
  amount: number;
  start_date: string;
  end_date: string;
}

const isPersistedUuid = (value: string | null | undefined): value is string =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

export default function ContractorProjectPlanPage() {
  return (
    <React.Suspense fallback={<div className="p-12 text-center text-slate-400">Loading project plan spreadsheet...</div>}>
      <ContractorProjectPlanContent />
    </React.Suspense>
  );
}

function ContractorProjectPlanContent() {
  const params = useParams();
  const projectId = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [project, setProject] = React.useState<Project | null>(null);
  const [contractor, setContractor] = React.useState<ContractorProfile | null>(null);
  const [homeowner, setHomeowner] = React.useState<Profile | null>(null);
  const [awardedQuote, setAwardedQuote] = React.useState<Quote | null>(null);
  const [existingPlanId, setExistingPlanId] = React.useState<string | null>(null);

  // Milestone Rows (Spreadsheet state)
  const [rows, setRows] = React.useState<PlanMilestoneRow[]>([]);
  const [planStatus, setPlanStatus] = React.useState<'draft' | 'submitted' | 'approved' | 'revision_requested'>('draft');
  const [revisionNotes, setRevisionNotes] = React.useState<string | null>(null);

  // Discussion Comments
  const [comments, setComments] = React.useState<ProjectPlanComment[]>([]);
  const [newCommentText, setNewCommentText] = React.useState('');
  const [submittingComment, setSubmittingComment] = React.useState(false);

  // Actions state
  const [isSavingDraft, setIsSavingDraft] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  React.useEffect(() => {
    async function loadData() {
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
          if (hData) {
            const profile = hData as Profile;
            ho = {
              ...profile,
              full_name: profile.full_name?.trim() || `Homeowner ${currentProj.homeowner_id.slice(0, 8)}`,
            };
          }
        }
      }
      setHomeowner(ho);

      if (!ho?.full_name?.trim() && user) {
        const { data: homeownerName, error: homeownerNameError } = await supabase.rpc(
          'get_project_homeowner_name',
          { p_project_id: currentProj.id }
        );
        if (homeownerNameError) {
          setLoadError(homeownerNameError.message);
          setLoading(false);
          return;
        }
        if (typeof homeownerName === 'string' && homeownerName.trim()) {
          setHomeowner({
            id: currentProj.homeowner_id,
            role: 'homeowner',
            full_name: homeownerName.trim(),
            created_at: '',
            updated_at: '',
          });
        }
      }

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

      // 5. Fetch Existing Plan or Milestones
      let existingPlan: ProjectPlan | null = null;
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
        if (planData) existingPlan = planData as ProjectPlan;
      }
      if (existingPlan) {
        setExistingPlanId(existingPlan.id);
        setPlanStatus(existingPlan.status);
        setRevisionNotes(existingPlan.revision_notes || null);
      }

      // Fetch Milestones
      let existingMs: Milestone[] = [];
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
        if (msData) existingMs = msData as Milestone[];
      }

      if (existingMs.length > 0) {
        const loadedRows: PlanMilestoneRow[] = existingMs.map((m, index) => ({
          id: m.id,
          seq: index + 1,
          name: m.name || '',
          description: m.description || '',
          amount: Number(m.amount) || 0,
          start_date: m.start_date || '',
          end_date: m.end_date || '',
        }));
        setRows(loadedRows);
      }

      // 6. Fetch Comments
      let loadedComments: ProjectPlanComment[] = [];
      if (user) {
        const { data: cData, error: commentsError } = await supabase
          .from('project_plan_comments')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });
        if (commentsError) {
          setLoadError(commentsError.message);
          setLoading(false);
          return;
        }
        if (cData) loadedComments = cData as ProjectPlanComment[];
      }
      setComments(loadedComments);

      setLoading(false);
    }

    loadData();
  }, [projectId]);

  // Calculations
  const agreedContractAmount = awardedQuote?.price || project?.budget || project?.est_mid || 0;
  const totalAllocatedAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const remainingUnallocated = agreedContractAmount - totalAllocatedAmount;
  const isFullyAllocated = Math.abs(remainingUnallocated) < 1; // within 1 peso tolerance
  const isExceeded = remainingUnallocated < -0.01;
  const isPlanApproved = planStatus === 'approved';

  // Row Manipulation
  const handleAddRow = () => {
    if (isPlanApproved) return;
    const nextSeq = rows.length + 1;
    const newRow: PlanMilestoneRow = {
      id: `new-${crypto.randomUUID()}`,
      seq: nextSeq,
      name: '',
      description: '',
      amount: 0,
      start_date: '',
      end_date: '',
    };
    setRows(prev => [...prev, newRow]);
  };

  const handleUpdateRow = (id: string, field: keyof PlanMilestoneRow, value: string | number) => {
    if (isPlanApproved) return;
    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        if (field === 'amount') {
          const num = Math.max(0, parseNumberInput(String(value)));
          return { ...r, amount: num };
        }
        if (field === 'name') return { ...r, name: String(value) };
        if (field === 'description') return { ...r, description: String(value) };
        if (field === 'start_date') return { ...r, start_date: String(value) };
        return { ...r, end_date: String(value) };
      })
    );
  };

  const handleRemoveRow = (id: string) => {
    if (isPlanApproved) return;
    if (rows.length <= 1) {
      showToast('A project plan must contain at least 1 milestone.', 'error');
      return;
    }
    const filtered = rows.filter(r => r.id !== id);
    const resequenced = filtered.map((r, idx) => ({ ...r, seq: idx + 1 }));
    setRows(resequenced);
  };

  const persistMilestones = async (
    supabase: ReturnType<typeof createClient>,
    quoteId: string
  ) => {
    const { error } = await supabase.rpc('phase_one_replace_project_plan_milestones', {
      p_project_id: project!.id,
      p_quote_id: quoteId,
      p_milestones: rows.map((row, index) => ({
        seq: index + 1,
        name: row.name.trim(),
        description: row.description.trim(),
        amount: row.amount,
        percent: Math.round((row.amount / agreedContractAmount) * 100),
        start_date: row.start_date || '',
        end_date: row.end_date || '',
      })),
    });
    if (error) throw error;
  };

  const handleMoveRow = (index: number, direction: 'up' | 'down') => {
    if (isPlanApproved) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === rows.length - 1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const nextRows = [...rows];
    const temp = nextRows[index];
    nextRows[index] = nextRows[targetIdx];
    nextRows[targetIdx] = temp;
    const resequenced = nextRows.map((r, idx) => ({ ...r, seq: idx + 1 }));
    setRows(resequenced);
  };

  // Validation
  const validatePlan = (): string | null => {
    if (rows.length === 0) return 'Please add at least one milestone.';
    for (const r of rows) {
      if (!r.name.trim()) return `Milestone #${r.seq} requires a name.`;
      if (!r.amount || r.amount <= 0) return `Milestone #${r.seq} (${r.name || 'Unnamed'}) must have an amount greater than ₱0.`;
      if (!r.start_date) return `Milestone #${r.seq} requires a start date.`;
      if (!r.end_date) return `Milestone #${r.seq} requires an end date.`;
      if (new Date(r.end_date) < new Date(r.start_date)) {
        return `Milestone #${r.seq}: End date cannot be earlier than start date.`;
      }
    }
    if (!isFullyAllocated) {
      if (isExceeded) {
        return `Milestone allocation exceeds agreed contract amount by ${formatCurrency(Math.abs(remainingUnallocated))}.`;
      }
      return `Milestone allocation is incomplete. Remaining unallocated amount: ${formatCurrency(remainingUnallocated)}.`;
    }
    return null;
  };

  // Save Draft
  const handleSaveDraft = async () => {
    if (!project) return;
    if (isPlanApproved) {
      showToast('This project plan has already been approved and cannot be edited.', 'error');
      return;
    }
    setIsSavingDraft(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !contractor) throw new Error('Sign in and complete your contractor profile to save a project plan.');
      const planPayload = {
        project_id: project.id,
        quote_id: awardedQuote?.id,
        contractor_id: user.id,
        homeowner_id: project.homeowner_id,
        agreed_amount: agreedContractAmount,
        status: planStatus === 'revision_requested' ? 'revision_requested' : 'draft',
        revision_notes: revisionNotes,
        updated_at: new Date().toISOString(),
      };
      const { data: insertedPlan, error } = existingPlanId
        ? await supabase.from('project_plans').update(planPayload).eq('id', existingPlanId).select('id').maybeSingle()
        : await supabase.from('project_plans').insert(planPayload).select('id').single();
      if (error) throw error;
      if (!existingPlanId && insertedPlan) setExistingPlanId(insertedPlan.id);
      if (awardedQuote) await persistMilestones(supabase, awardedQuote.id);
      setPlanStatus(planStatus === 'revision_requested' ? 'revision_requested' : 'draft');
      showToast('Project plan draft saved successfully!');
    } catch (err: any) {
      showToast(err.message || 'Failed to save draft', 'error');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Submit For Homeowner Approval
  const handleSubmitPlan = async () => {
    if (!project) return;
    if (isPlanApproved) {
      showToast('This project plan has already been approved and cannot be edited.', 'error');
      return;
    }
    const validationError = validatePlan();
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const now = new Date().toISOString();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !contractor) throw new Error('Sign in and complete your contractor profile to submit a project plan.');
      if (!awardedQuote) throw new Error('An awarded quotation is required before submitting a project plan.');

      const planPayload = {
        project_id: project.id,
        quote_id: awardedQuote.id,
        contractor_id: user.id,
        homeowner_id: project.homeowner_id,
        agreed_amount: agreedContractAmount,
        status: 'submitted',
        submitted_at: now,
        revision_notes: revisionNotes,
        updated_at: now,
      };
      const { data: savedPlan, error: planError } = existingPlanId
        ? await supabase.from('project_plans').update(planPayload).eq('id', existingPlanId).select().single()
        : await supabase.from('project_plans').insert(planPayload).select().single();
      if (planError) throw planError;
      if (!savedPlan) throw new Error('Project plan could not be saved.');
      setExistingPlanId(savedPlan.id);

      const { data: latestVersion, error: versionQueryError } = await supabase
        .from('project_plan_versions')
        .select('version_num')
        .eq('project_plan_id', savedPlan.id)
        .order('version_num', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (versionQueryError) throw versionQueryError;
      const { error: versionError } = await supabase.from('project_plan_versions')      .insert({
        project_plan_id: savedPlan.id,
        version_num: (latestVersion?.version_num || 0) + 1,
        stages_data: rows,
          total_amount: totalAllocatedAmount,
          submitted_by: user.id,
          submitted_at: now,
        });
      if (versionError) throw versionError;

      await persistMilestones(supabase, awardedQuote.id);
      const { error: projectError } = await supabase
        .from('projects')
        .update({ status: 'project_planning', updated_at: now })
        .eq('id', project.id);
      if (projectError) throw projectError;

      setPlanStatus('submitted');
      showToast('Project Plan submitted for homeowner review & approval!');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit project plan', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add Comment
  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !project) return;
    setSubmittingComment(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    try {
      if (!user || !contractor) throw new Error('Sign in with a contractor account to post a comment.');
      const { data: comment, error } = await supabase.from('project_plan_comments').insert({
        project_id: project.id,
        author_id: user.id,
        author_name: contractor.business_name,
        author_role: 'contractor',
        message: newCommentText.trim(),
      }).select().single();
      if (error) throw error;
      if (!comment) throw new Error('Comment could not be posted.');
      setComments(prev => [...prev, comment as ProjectPlanComment]);
      setNewCommentText('');
      showToast('Comment posted.');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to post comment', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <AppLayout
        userRole="contractor"
        title="Project Plan"
        subtitle="Loading..."
        workspace={{
          projectId,
          projectTitle: 'Loading...',
          projectRef: `PRJ-${projectId.slice(-6).toUpperCase()}`,
        }}
      >
        <div className="p-12 text-center text-slate-400">Loading project plan spreadsheet...</div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout userRole="contractor" title="Project Plan Unavailable" backHref="/contractor/projects">
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

  const projectRef = `PRJ-${project.id.slice(-6).toUpperCase()}`;

  return (
    <AppLayout
      userRole="contractor"
      userName={contractor?.business_name || 'Contractor'}
      title="PROJECT PLAN"
      subtitle={project.title}
      workspace={{
        projectId: project.id,
        projectTitle: project.title,
        projectRef,
      }}
    >
      <div className="w-full space-y-6 pb-12">
        {/* Toast Notification */}
        {toastMessage && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 text-[#136F48] border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {toastMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* Page Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono font-bold text-[#136F48] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {projectRef}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                planStatus === 'approved'
                  ? 'bg-emerald-50 text-[#136F48] border border-emerald-200'
                  : planStatus === 'submitted'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : planStatus === 'revision_requested'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                Plan Status: {planStatus.replace('_', ' ')}
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">PROJECT PLAN</h1>
            <p className="text-xs text-slate-500 mt-0.5">{project.title}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isPlanApproved}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-4 h-4 text-slate-500" />
              <span>{isSavingDraft ? 'Saving...' : 'Save Draft'}</span>
            </button>
            <button
              onClick={handleSubmitPlan}
              disabled={isSubmitting || isPlanApproved}
              className="px-5 py-2 rounded-xl bg-[#136F48] hover:bg-[#0f5939] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Submitting...' : 'Submit for Approval'}</span>
            </button>
          </div>
        </div>

        {/* Revision Requested Notice if any */}
        {planStatus === 'revision_requested' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-red-900 block mb-0.5">Homeowner Requested Schedule Revisions</span>
              <p className="text-red-800 mb-1">
                {revisionNotes || 'No revision notes provided.'}
              </p>
              <span className="text-[11px] text-red-600 font-medium">
                Make the required adjustments in the table below, then resubmit for approval.
              </span>
            </div>
          </div>
        )}

        {isPlanApproved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900">
              <span className="font-bold block mb-0.5">Project Plan Approved and Locked</span>
              The homeowner approved this schedule. Milestone details and allocations can no longer be edited.
            </div>
          </div>
        )}

        {/* Two-Column Responsive Layout: Left 70% | Right 30% */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* ======================================================================= */}
          {/* LEFT SIDE: 70% WIDTH (7 COLS) — EXCEL SPREADSHEET & COMMENTS            */}
          {/* ======================================================================= */}
          <div className="lg:col-span-7 space-y-6">
            {/* Excel-Type Spreadsheet Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Spreadsheet Header Bar */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-[#136F48]" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Milestone Schedule Spreadsheet</h2>
                    <p className="text-[11px] text-slate-500">
                      Configure construction stages. Sum of amounts must match agreed contract value.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddRow}
                  disabled={isPlanApproved}
                  className="px-3 py-1.5 rounded-lg bg-[#136F48] hover:bg-[#0f5939] text-white text-xs font-bold flex items-center gap-1 transition-colors self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Milestone</span>
                </button>
              </div>

              {/* Small-screen milestone editor */}
              <div className="space-y-3 p-3 lg:hidden">
                {rows.map((row, index) => (
                  <section key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-800">Milestone {row.seq}</h3>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveRow(index, 'up')}
                          disabled={isPlanApproved || index === 0}
                          className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                          title="Move Up"
                          aria-label={`Move milestone ${row.seq} up`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveRow(index, 'down')}
                          disabled={isPlanApproved || index === rows.length - 1}
                          className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                          title="Move Down"
                          aria-label={`Move milestone ${row.seq} down`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          disabled={isPlanApproved}
                          className="rounded p-2 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                          title="Delete Milestone"
                          aria-label={`Delete milestone ${row.seq}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-slate-600">
                        Milestone Name
                        <input
                          type="text"
                          value={row.name}
                          onChange={e => handleUpdateRow(row.id, 'name', e.target.value)}
                          disabled={isPlanApproved}
                          placeholder="Enter milestone name"
                          className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-hidden focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48]"
                        />
                      </label>

                      <label className="block text-xs font-semibold text-slate-600">
                        Description
                        <input
                          type="text"
                          value={row.description}
                          onChange={e => handleUpdateRow(row.id, 'description', e.target.value)}
                          disabled={isPlanApproved}
                          placeholder="Scope of works in this stage"
                          className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-hidden focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48]"
                        />
                      </label>

                      <label className="block text-xs font-semibold text-slate-600">
                        Amount (PHP)
                        <div className="relative mt-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₱</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.amount ? formatNumberInput(String(row.amount)) : ''}
                            onChange={e => handleUpdateRow(row.id, 'amount', formatNumberInput(e.target.value))}
                            disabled={isPlanApproved}
                            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 font-mono text-sm font-bold text-slate-900 outline-hidden focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48]"
                          />
                        </div>
                      </label>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-semibold text-slate-600">
                          Start Date
                          <input
                            type="date"
                            value={row.start_date}
                            onChange={e => handleUpdateRow(row.id, 'start_date', e.target.value)}
                            disabled={isPlanApproved}
                            className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 outline-hidden focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48]"
                          />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          End Date
                          <input
                            type="date"
                            value={row.end_date}
                            onChange={e => handleUpdateRow(row.id, 'end_date', e.target.value)}
                            disabled={isPlanApproved}
                            className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 outline-hidden focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48]"
                          />
                        </label>
                      </div>
                    </div>
                  </section>
                ))}
              </div>

              {/* Spreadsheet for larger screens */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                      <th className="py-3 px-3 w-12 text-center">No.</th>
                      <th className="py-3 px-3 min-w-[180px]">Milestone Name</th>
                      <th className="py-3 px-3 min-w-[200px]">Description</th>
                      <th className="py-3 px-3 w-36">Amount (PHP)</th>
                      <th className="py-3 px-3 w-32">Start Date</th>
                      <th className="py-3 px-3 w-32">End Date</th>
                      <th className="py-3 px-3 w-20 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, index) => (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* No. (Auto-sequenced) */}
                        <td className="py-2.5 px-3 text-center font-bold text-slate-500">
                          {row.seq}
                        </td>

                        {/* Milestone Name */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={row.name}
                            onChange={e => handleUpdateRow(row.id, 'name', e.target.value)}
                            disabled={isPlanApproved}
                            placeholder="Enter milestone name"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 font-semibold focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48] outline-hidden bg-white"
                          />
                        </td>

                        {/* Description */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={row.description}
                            onChange={e => handleUpdateRow(row.id, 'description', e.target.value)}
                            disabled={isPlanApproved}
                            placeholder="Scope of works in this stage"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48] outline-hidden bg-white"
                          />
                        </td>

                        {/* Amount */}
                        <td className="py-2.5 px-3">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₱</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.amount ? formatNumberInput(String(row.amount)) : ''}
                              onChange={e => handleUpdateRow(row.id, 'amount', formatNumberInput(e.target.value))}
                              disabled={isPlanApproved}
                              className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48] outline-hidden bg-white font-mono"
                            />
                          </div>
                        </td>

                        {/* Start Date */}
                        <td className="py-2.5 px-3">
                          <input
                            type="date"
                            value={row.start_date}
                            onChange={e => handleUpdateRow(row.id, 'start_date', e.target.value)}
                            disabled={isPlanApproved}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48] outline-hidden bg-white"
                          />
                        </td>

                        {/* End Date */}
                        <td className="py-2.5 px-3">
                          <input
                            type="date"
                            value={row.end_date}
                            onChange={e => handleUpdateRow(row.id, 'end_date', e.target.value)}
                            disabled={isPlanApproved}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48] outline-hidden bg-white"
                          />
                        </td>

                        {/* Actions (Reorder Up/Down & Remove) */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveRow(index, 'up')}
                              disabled={isPlanApproved || index === 0}
                              className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveRow(index, 'down')}
                              disabled={isPlanApproved || index === rows.length - 1}
                              className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.id)}
                              disabled={isPlanApproved}
                              className="p-1 rounded hover:bg-red-50 text-red-500"
                              title="Delete Milestone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table Footer: Dynamic Allocation Status & Math */}
              <div className="p-4 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-600">
                    Formula: <span className="font-mono text-slate-900">TOTAL MILESTONE AMOUNTS = AGREED CONTRACT AMOUNT</span>
                  </div>
                  {isFullyAllocated ? (
                    <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Fully Allocated (100% of Agreed Contract Price)</span>
                    </div>
                  ) : isExceeded ? (
                    <div className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span>Warning: Milestone allocation exceeds the agreed contract amount by {formatCurrency(Math.abs(remainingUnallocated))}.</span>
                    </div>
                  ) : (
                    <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Remaining Unallocated Amount: {formatCurrency(remainingUnallocated)}</span>
                    </div>
                  )}
                </div>

                <div className="text-right sm:self-center">
                  <span className="text-[11px] text-slate-400 block uppercase font-bold tracking-wider">Total Allocated</span>
                  <span className="text-base font-extrabold text-[#136F48] font-mono">
                    {formatCurrency(totalAllocatedAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Discussion & Comments Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Project Plan Comments & Discussion</h3>
                </div>
                <span className="text-xs text-slate-400">{comments.length} Messages</span>
              </div>

              {/* Messages History */}
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                    No comments yet. Start a discussion with the homeowner regarding milestones, dates, or scope.
                  </div>
                ) : (
                  comments.map(c => {
                    const isContractor = c.author_role === 'contractor';
                    return (
                      <div
                        key={c.id}
                        className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                          isContractor
                            ? 'bg-blue-50/60 border-blue-200/80 mr-4'
                            : 'bg-emerald-50/60 border-emerald-200/80 ml-4'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-bold text-slate-900 flex items-center gap-1.5">
                            {isContractor ? <HardHat className="w-3.5 h-3.5 text-blue-600" /> : <User className="w-3.5 h-3.5 text-[#136F48]" />}
                            <span>{c.author_name}</span>
                            <span className="text-[10px] font-semibold text-slate-400 uppercase capitalize">
                              ({c.author_role})
                            </span>
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDate(c.created_at)}
                          </span>
                        </div>
                        <p className="text-slate-700 whitespace-pre-wrap">{c.message}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Comment Input Box */}
              <form onSubmit={handleSendComment} className="pt-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCommentText}
                    onChange={e => setNewCommentText(e.target.value)}
                    placeholder="Write a comment or suggest a milestone timeline adjustment..."
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48] outline-hidden bg-white"
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !newCommentText.trim()}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold transition-colors shrink-0"
                  >
                    {submittingComment ? 'Posting...' : 'Comment'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ======================================================================= */}
          {/* RIGHT SIDE: 30% WIDTH (3 COLS) — STICKY PROJECT SUMMARY & APPROVAL       */}
          {/* ======================================================================= */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sticky top-20 space-y-5">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  PROJECT SUMMARY
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-snug">{project.title}</h3>
              </div>

              {/* Summary Metadata */}
              <div className="space-y-2 text-xs border-y border-slate-100 py-3 text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Homeowner:</span>
                  <span className="font-semibold text-slate-800">
                    {homeowner?.full_name || (project.homeowner_id ? `Homeowner ${project.homeowner_id.slice(0, 8)}` : 'Homeowner')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Contractor:</span>
                  <span className="font-semibold text-slate-800">{contractor?.business_name || 'Contractor'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Agreed Contract:</span>
                  <span className="font-extrabold text-[#136F48]">{formatCurrency(agreedContractAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Number of Milestones:</span>
                  <span className="font-bold text-slate-800">{rows.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Allocation:</span>
                  <span className="font-mono font-bold text-slate-800">{formatCurrency(totalAllocatedAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Unallocated:</span>
                  <span className={`font-mono font-bold ${remainingUnallocated === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {formatCurrency(remainingUnallocated)}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">Plan Status:</span>
                  <span className="font-bold text-slate-900 capitalize">{planStatus.replace('_', ' ')}</span>
                </div>
              </div>

              {/* Milestone Breakdown Summary */}
              <div>
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2">
                  MILESTONE BREAKDOWN
                </span>
                <div className="space-y-1.5 text-xs">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600 truncate max-w-[150px]" title={r.name || 'Unnamed'}>
                        {r.seq}. {r.name || 'Unnamed'}
                      </span>
                      <span className="font-bold font-mono text-slate-900">{formatCurrency(r.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 font-bold text-slate-900">
                    <span>Total</span>
                    <span className="text-[#136F48] font-mono text-sm">{formatCurrency(totalAllocatedAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={handleSubmitPlan}
                  disabled={isSubmitting || !isFullyAllocated || isPlanApproved}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#136F48] hover:bg-[#0f5939] disabled:bg-slate-300 disabled:cursor-not-allowed shadow-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {planStatus === 'approved'
                      ? 'Plan Approved by Homeowner'
                      : isSubmitting
                      ? 'Submitting...'
                      : 'Submit for Homeowner Approval'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isPlanApproved}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5 text-slate-500" />
                  <span>{isSavingDraft ? 'Saving Draft...' : 'Save Draft'}</span>
                </button>

                {!isFullyAllocated && (
                  <p className="text-[11px] text-amber-700 text-center leading-tight">
                    * Total milestone allocation must match the agreed contract amount exactly before submission.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
