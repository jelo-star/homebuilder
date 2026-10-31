'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import {
  HardHat,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Upload,
  Camera,
  Image as ImageIcon,
  FileCheck,
  AlertTriangle,
  Eye,
  X,
  ArrowRight,
  FileSpreadsheet,
  Info
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Project, Milestone, MilestoneProof, Quote, Dispute, ContractorProfile } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

interface CompressedImage {
  dataUrl: string;
  name: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  savingsPercent: number;
}

const compressImage = async (file: File): Promise<CompressedImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const maxDimension = 1280;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not supported'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);

        const originalSizeKB = Math.round(file.size / 1024);
        const head = 'data:image/jpeg;base64,';
        const compressedSizeKB = Math.round(((compressedDataUrl.length - head.length) * 3) / 4 / 1024);
        const savingsPercent = Math.max(0, Math.round(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100));

        resolve({
          dataUrl: compressedDataUrl,
          name: file.name.replace(/\.[^/.]+$/, "") + ".jpg",
          originalSizeKB,
          compressedSizeKB,
          savingsPercent
        });
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function ContractorMilestonesPage() {
  return (
    <React.Suspense fallback={<div className="p-12 text-center text-slate-400">Loading milestones...</div>}>
      <ContractorMilestonesContent />
    </React.Suspense>
  );
}

function ContractorMilestonesContent() {
  const params = useParams();
  const projectId = params?.id as string;

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [project, setProject] = React.useState<Project | null>(null);
  const [contractor, setContractor] = React.useState<ContractorProfile | null>(null);
  const [milestones, setMilestones] = React.useState<Milestone[]>([]);
  const [disputesByMilestone, setDisputesByMilestone] = React.useState<Record<string, Dispute>>({});
  const [hasApprovedPlan, setHasApprovedPlan] = React.useState(false);

  // Proof Modal
  const [activeMilestone, setActiveMilestone] = React.useState<Milestone | null>(null);
  const [proofNote, setProofNote] = React.useState('');
  const [proofImages, setProofImages] = React.useState<CompressedImage[]>([]);
  const [isCompressing, setIsCompressing] = React.useState(false);
  const [submittingProof, setSubmittingProof] = React.useState(false);

  // Lightbox
  const [viewingFullImage, setViewingFullImage] = React.useState<string | null>(null);

  const [toastMsg, setToastMsg] = React.useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const loadData = React.useCallback(async () => {
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
      const { data: pData, error: projectError } = await supabase.from('projects').select('*').eq('id', projectId).single();
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

    // 2. Fetch Contractor
    let ct: ContractorProfile | null = null;
    if (user) {
      const { data: cData, error: contractorError } = await supabase.from('contractor_profiles').select('*').eq('profile_id', user.id).maybeSingle();
      if (contractorError) {
        setLoadError(contractorError.message);
        setLoading(false);
        return;
      }
      if (cData) ct = cData as ContractorProfile;
    }
    setContractor(ct);

    // Milestones are available only after the homeowner approves the project plan.
    const { data: projectPlan, error: projectPlanError } = await supabase
      .from('project_plans')
      .select('status')
      .eq('project_id', projectId)
      .maybeSingle();
    if (projectPlanError) {
      setLoadError(projectPlanError.message);
      setLoading(false);
      return;
    }

    const approvedPlan = projectPlan?.status === 'approved';
    setHasApprovedPlan(approvedPlan);

    // 3. Fetch Milestones
    let ms: Milestone[] = [];
    if (user && approvedPlan) {
      const { data: msData, error: milestonesError } = await supabase
        .from('milestones')
        .select('*, proofs:milestone_proofs(*)')
        .eq('project_id', projectId)
        .order('seq', { ascending: true });
      if (milestonesError) {
        setLoadError(milestonesError.message);
        setLoading(false);
        return;
      }
      if (msData) {
        ms = await Promise.all((msData as Milestone[]).map(async milestone => ({
          ...milestone,
          proofs: await Promise.all((milestone.proofs || []).map(async proof => {
            if (/^https?:\/\//i.test(proof.file_path)) {
              return proof;
            }

            const { data: signed, error: signedError } = await supabase.storage
              .from('milestone-proofs')
              .createSignedUrl(proof.file_path, 3600);
            if (signedError) {
              console.error(`Unable to load milestone proof image ${proof.id}: ${signedError.message}`);
              setLoadError(signedError.message);
            }
            return { ...proof, file_path: signed?.signedUrl || '' };
          })),
        })));
      }

      const milestoneIds = ms.map(milestone => milestone.id);
      if (milestoneIds.length > 0) {
        const { data: disputeData, error: disputesError } = await supabase
          .from('disputes')
          .select('*')
          .in('milestone_id', milestoneIds)
          .order('created_at', { ascending: false });
        if (disputesError) {
          setLoadError(disputesError.message);
          setLoading(false);
          return;
        }

        const activeDisputes: Record<string, Dispute> = {};
        for (const dispute of (disputeData || []) as Dispute[]) {
          if (!activeDisputes[dispute.milestone_id] && ['open', 'need_more_proof'].includes(dispute.status)) {
            activeDisputes[dispute.milestone_id] = dispute;
          }
        }
        setDisputesByMilestone(activeDisputes);
      } else {
        setDisputesByMilestone({});
      }
    }
    setMilestones(approvedPlan ? ms : []);

    setLoading(false);
  }, [projectId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  React.useEffect(() => {
    if (!projectId || loading || !hasApprovedPlan) return;

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
        setActiveMilestone(current => current && statuses.has(current.id)
          ? { ...current, status: statuses.get(current.id)! }
          : current);
      } catch (error) {
        if (active) console.error('Unable to refresh milestone statuses:', error);
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
  }, [hasApprovedPlan, loading, projectId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const availableSlots = 3 - proofImages.length;
    if (availableSlots <= 0) {
      showToast('Maximum 3 photos allowed per milestone proof.', 'error');
      e.target.value = '';
      return;
    }

    const filesToProcess = Array.from(files).slice(0, availableSlots);
    setIsCompressing(true);

    try {
      const list: CompressedImage[] = [];
      for (const file of filesToProcess) {
        const compressed = await compressImage(file);
        list.push(compressed);
      }
      setProofImages(prev => [...prev, ...list].slice(0, 3));
    } catch {
      showToast('Failed to process image. Please try another photo.', 'error');
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const removePhoto = (index: number) => {
    setProofImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMilestone || proofImages.length === 0) {
      showToast('Please attach at least 1 photo showing the completed work.', 'error');
      return;
    }

    setSubmittingProof(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const isFix = activeMilestone.status === 'disputed';
    const uploadedStoragePaths: string[] = [];
    let uploadedProofsPersisted = false;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !contractor) throw new Error('Sign in with a contractor account to submit milestone proof.');

      let oldStoragePaths: string[] = [];
      if (isFix) {
        const { data: oldProofs, error: oldProofsError } = await supabase
          .from('milestone_proofs')
          .select('file_path')
          .eq('milestone_id', activeMilestone.id);
        if (oldProofsError) throw oldProofsError;
        oldStoragePaths = (oldProofs || [])
          .map(proof => proof.file_path)
          .filter(path => !/^https?:\/\//i.test(path));
      }

      const proofRecords = [];
      for (const [index, image] of proofImages.entries()) {
        const storagePath = `${user.id}/${activeMilestone.id}/${Date.now()}_${index + 1}_${image.name}`;
        const imageBlob = await fetch(image.dataUrl).then(response => response.blob());
        const { error: uploadError } = await supabase.storage
          .from('milestone-proofs')
          .upload(storagePath, imageBlob, { contentType: 'image/jpeg' });
        if (uploadError) {
          if (uploadError.message.toLowerCase().includes('bucket not found')) {
            throw new Error('Milestone proof storage is not configured. Apply migration 63_restore_milestone_proofs_bucket.sql, then try again.');
          }
          throw uploadError;
        }
        uploadedStoragePaths.push(storagePath);
        proofRecords.push({
          milestone_id: activeMilestone.id,
          uploaded_by: user.id,
          file_path: storagePath,
          note: proofNote.trim() || null,
        });
      }

      if (isFix) {
        const { error: replaceError } = await supabase.rpc('replace_disputed_milestone_proofs', {
          p_milestone_id: activeMilestone.id,
          p_file_paths: uploadedStoragePaths,
          p_note: proofNote.trim() || null,
        });
        if (replaceError) throw replaceError;
        uploadedProofsPersisted = true;

        if (oldStoragePaths.length > 0) {
          const { error: cleanupError } = await supabase.storage
            .from('milestone-proofs')
            .remove(oldStoragePaths);
          if (cleanupError) {
            console.error('Fix was submitted, but previous proof files could not be removed:', cleanupError);
          }
        }
      } else {
        const { error: proofsError } = await supabase.from('milestone_proofs').insert(proofRecords);
        if (proofsError) throw proofsError;
        uploadedProofsPersisted = true;
        const { error: milestoneError } = await supabase
          .from('milestones')
          .update({
            status: 'proof_submitted',
            proof_submitted_at: now,
            contractor_update: proofNote.trim() || null,
            updated_at: now,
          })
          .eq('id', activeMilestone.id);
        if (milestoneError) throw milestoneError;
      }

      setActiveMilestone(null);
      setProofImages([]);
      setProofNote('');
      await loadData();
      showToast(isFix
        ? 'Fix submitted. The previous milestone proof has been replaced.'
        : 'Milestone inspection proof submitted for homeowner review!');
    } catch (err: unknown) {
      if (uploadedStoragePaths.length > 0 && !uploadedProofsPersisted) {
        const { error: cleanupError } = await supabase.storage
          .from('milestone-proofs')
          .remove(uploadedStoragePaths);
        if (cleanupError) {
          console.error('Unable to clean up uploaded milestone proof files after submission failed:', cleanupError);
        }
      }
      showToast(err instanceof Error ? err.message : 'Failed to submit inspection proof', 'error');
    } finally {
      setSubmittingProof(false);
    }
  };

  if (loading) {
    return (
      <AppLayout
        userRole="contractor"
        title="Milestones"
        subtitle="Loading..."
        workspace={{
          projectId,
          projectTitle: 'Loading...',
          projectRef: `PRJ-${projectId.slice(-6).toUpperCase()}`,
        }}
      >
        <div className="p-12 text-center text-slate-400">Loading milestones...</div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout userRole="contractor" title="Milestones Unavailable" backHref="/contractor/projects">
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
      title="Project Milestones"
      subtitle={`${project.title} • Official Approved Execution Schedule`}
      workspace={{
        projectId: project.id,
        projectTitle: project.title,
        projectRef,
      }}
    >
      <div className="w-full space-y-6 pb-12">
        {/* Toast */}
        {toastMsg && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 ${
              toastMsg.type === 'success' ? 'bg-emerald-50 text-[#136F48] border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            <span>{toastMsg.text}</span>
          </div>
        )}

        {/* Lightbox */}
        {viewingFullImage && (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-4xl flex items-center justify-between pb-3 text-white">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Inspection Photo Proof</span>
              <button
                type="button"
                onClick={() => setViewingFullImage(null)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img src={viewingFullImage} alt="Inspection Proof" className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl" />
          </div>
        )}

        {/* Milestone Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono font-bold text-[#136F48] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {projectRef}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                {milestones.length} Stages Configured
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Milestones & Inspections</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Submit proof of work with high-resolution site photos for homeowner review.
            </p>
          </div>

          <Link
            href={`/contractor/projects/${project.id}/plan`}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#136F48]" />
            <span>Edit Project Plan</span>
          </Link>
        </div>

        {/* Notice on Approval vs Release */}
        {!hasApprovedPlan && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <span className="font-bold block mb-0.5">Milestones are not active yet.</span>
              The homeowner must approve the Project Plan before milestone stages and photo-proof submissions become available.
            </div>
          </div>
        )}

        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900">
            <span className="font-bold block mb-0.5">Dual-Tier Protection Protocol:</span>
            Inspection approval verifies structural completion of the stage. Once approved, the homeowner authorizes escrow disbursement to your registered payout account in the <strong>Payments</strong> section.
          </div>
        </div>

        {/* Milestone Cards List */}
        {milestones.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <HardHat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">No milestones generated yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto mb-4">
              Open the Project Plan spreadsheet to formulate and submit your milestone schedule for homeowner approval.
            </p>
            <Link
              href={`/contractor/projects/${project.id}/plan`}
              className="px-4 py-2 rounded-xl bg-[#136F48] text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Go to Project Plan</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {milestones.map((m) => {
              const isLocked = m.status === 'locked';
              const isInProgress = m.status === 'in_progress';
              const isProofSubmitted = m.status === 'proof_submitted';
              const isApproved = m.status === 'approved';
              const isPaid = m.status === 'paid';
              const isDisputed = m.status === 'disputed';
              const dispute = disputesByMilestone[m.id];

              return (
                <div
                  key={m.id}
                  className={`bg-white rounded-2xl border transition-all p-5 ${
                    isInProgress
                      ? 'border-[#136F48] shadow-md ring-1 ring-[#136F48]/20'
                      : isPaid
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : 'border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          isPaid
                            ? 'bg-emerald-500 text-white'
                            : isInProgress
                            ? 'bg-[#136F48] text-white'
                            : isProofSubmitted
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isPaid ? <CheckCircle2 className="w-5 h-5" /> : m.seq}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900">{m.name}</h3>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isPaid
                                ? 'bg-emerald-100 text-emerald-800'
                                : isApproved
                                ? 'bg-teal-100 text-teal-800'
                                : isProofSubmitted
                                ? 'bg-blue-100 text-blue-800'
                                : isDisputed
                                ? 'bg-amber-100 text-amber-800'
                                : isInProgress
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {m.status.replace('_', ' ')}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                          {m.description?.trim() || 'No description provided'}
                        </p>

                        <div className="text-[11px] text-slate-400 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                          {m.start_date && (
                            <span>Start: <strong className="text-slate-600">{formatDate(m.start_date)}</strong></span>
                          )}
                          {m.end_date && (
                            <span>Target: <strong className="text-slate-600">{formatDate(m.end_date)}</strong></span>
                          )}
                          <span>Stage Allocation: <strong className="text-[#136F48]">{formatCurrency(m.amount)}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                      {(isInProgress || m.status === 'disputed') && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMilestone(m);
                            setProofImages([]);
                            setProofNote('');
                          }}
                          className="px-4 py-2 rounded-xl bg-[#136F48] hover:bg-[#0f5939] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Camera className="w-4 h-4" />
                          <span>{isDisputed ? 'Fix' : 'Submit Inspection Proof'}</span>
                        </button>
                      )}

                      {isProofSubmitted && (
                        <div className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>Awaiting Homeowner Inspection</span>
                        </div>
                      )}

                      {isApproved && (
                        <div className="px-3.5 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                          <span>Approved • Awaiting Payout Release</span>
                        </div>
                      )}

                      {isPaid && (
                        <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[#136F48] text-xs font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Completed & Paid</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {dispute && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                        <AlertTriangle className="h-4 w-4" />
                        Homeowner dispute
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-amber-950">
                        {dispute.reason}
                      </p>
                      <p className="mt-2 text-[10px] font-semibold uppercase text-amber-700">
                        Status: {dispute.status.replaceAll('_', ' ')}
                      </p>
                    </div>
                  )}

                  {/* Proof Photos Grid if any */}
                  {m.proofs && m.proofs.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                        Submitted Site Proof Photos ({m.proofs.length})
                      </span>
                      <div className="flex flex-wrap gap-2.5">
                        {m.proofs.map((p, idx) => (
                          <div
                            key={idx}
                            onClick={() => setViewingFullImage(p.file_path)}
                            className="relative group w-20 h-20 rounded-xl overflow-hidden border border-slate-200 cursor-pointer"
                          >
                            <img src={p.file_path} alt="Proof" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Proof Submission Modal */}
        {activeMilestone && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {activeMilestone.status === 'disputed' ? 'Submit Fix' : 'Submit Milestone Proof'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{activeMilestone.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMilestone(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Photo Upload Area */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  {activeMilestone.status === 'disputed'
                    ? 'Replacement Site Photos (Up to 3 photos; replaces the previous proof)'
                    : 'Site Photos (Up to 3 high-resolution photos)'}
                </label>
                <div className="grid grid-cols-3 gap-2.5 mb-2">
                  {proofImages.map((img, idx) => (
                    <div key={idx} className="relative w-full aspect-square rounded-xl overflow-hidden border border-slate-200 group">
                      <img src={img.dataUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white shadow-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {proofImages.length < 3 && (
                    <label className="w-full aspect-square rounded-xl border-2 border-dashed border-slate-300 hover:border-[#136F48] flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-[#136F48] transition-colors">
                      <Upload className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-bold">Add Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {isCompressing && <p className="text-[11px] text-blue-600 font-medium">Optimizing photo quality...</p>}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Contractor Progress Update
                </label>
                <textarea
                  value={proofNote}
                  onChange={e => setProofNote(e.target.value)}
                  placeholder={activeMilestone.status === 'disputed'
                    ? "Describe how you fixed the homeowner's concern..."
                    : 'Describe the work completed, site progress, inspections, or test results...'}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:border-[#136F48] focus:ring-1 focus:ring-[#136F48] outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveMilestone(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitProof}
                  disabled={submittingProof || proofImages.length === 0}
                  className="px-5 py-2 rounded-xl bg-[#136F48] hover:bg-[#0f5939] disabled:bg-slate-300 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>{submittingProof ? 'Submitting...' : activeMilestone.status === 'disputed' ? 'Submit Fix' : 'Submit for Review'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
