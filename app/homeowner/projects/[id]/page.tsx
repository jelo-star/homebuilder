'use client';

import React from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import {
  Building2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  ArrowLeft,
  Upload,
  CreditCard,
  AlertTriangle,
  FileCheck,
  Star,
  Eye,
  X,
  FileSpreadsheet,
  Layers,
  HardHat,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Phone,
  Mail,
  Camera,
  Check,
  Copy,
  Receipt,
  ShieldAlert,
  Scale,
  MessageSquare,
  FileText,
  FolderKanban,
  Plus,
  Lock,
  ChevronDown,
  ChevronUp,
  Trash2,
  Send
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Project, Quote, Milestone, ContractorProfile, ConfiguredPaymentMethod, MilestoneProof, Dispute, ProjectPlan, ProjectPlanComment } from '@/types/database';
import { formatCurrency, formatDate, formatNumberInput, parseNumberInput, capitalize, cleanMilestoneTitle, removeUnderscore } from '@/lib/utils/formatters';
import { calculateEstimate } from '@/lib/utils/estimator';
import { useToast } from '@/components/ui/ToastProvider';
import QuotationComparisonModal from '@/components/homeowner/QuotationComparisonModal';
import RequestRevisionModal from '@/components/homeowner/RequestRevisionModal';
import QuoteCostBreakdown from '@/components/quotes/QuoteCostBreakdown';

type QuoteDisplayItem = {
  id: string;
  category: string;
  item_name: string;
  specifications?: string;
  quantity: number | string;
  unit: string;
  unit_price: number | string;
  delivery_cost?: number | string;
  line_total?: number;
  supplier?: string;
};

type SavedDetailedProposal = {
  items?: Array<{
    id?: string;
    code?: string;
    category?: string;
    item_name: string;
    brand_spec?: string;
    division?: string;
    quantity: number | string;
    unit: string;
    unit_price: number | string;
    delivery_cost?: number | string;
    supplier?: string;
    line_total?: number;
  }>;
  materials?: Array<{ name: string; quantity: string; unit: string; unitPrice: string }>;
  labor?: Array<{ position: string; workers: string; dailyRate: string; days: string }>;
  equipment?: Array<{ name: string; quantity: string; rate: string; duration: string; arrangement: string; fuel: string; maintenance: string }>;
  overhead?: Array<{ name: string; description: string; amount: string }>;
  profit?: { amount?: number };
  contingency?: { amount?: number };
  taxes?: { amount?: number };
  materials_subtotal?: number;
  operations_subtotal?: number;
  labor_cost?: number;
  equipment_cost?: number;
  logistics_cost?: number;
  taxes_cost?: number;
};

export default function ProjectDetailsPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-slate-500">Loading project...</div>}>
      <ProjectDetailsContent />
    </React.Suspense>
  );
}

function ProjectDetailsContent() {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const returnTo = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const { showToast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [homeownerName, setHomeownerName] = React.useState<string | null>(null);
  const [project, setProject] = React.useState<Project | null>(null);
  const [quotes, setQuotes] = React.useState<(Quote & { contractor_profile: ContractorProfile | null })[]>([]);
  const [contractorPreviewImages, setContractorPreviewImages] = React.useState<Record<string, string>>({});
  const [milestones, setMilestones] = React.useState<Milestone[]>([]);
  const [loadingProofMilestones, setLoadingProofMilestones] = React.useState<Record<string, boolean>>({});
  const [projectTransactions, setProjectTransactions] = React.useState<any[]>([]);
  const [disputes, setDisputes] = React.useState<Dispute[]>([]);
  const [projectPlan, setProjectPlan] = React.useState<ProjectPlan | null>(null);
  const [planComments, setPlanComments] = React.useState<ProjectPlanComment[]>([]);
  const [planRevisionModalOpen, setPlanRevisionModalOpen] = React.useState(false);
  const [planRevisionNotes, setPlanRevisionNotes] = React.useState('');
  const [approvingPlan, setApprovingPlan] = React.useState(false);
  const [submittingPlanRevision, setSubmittingPlanRevision] = React.useState(false);
  const [newPlanComment, setNewPlanComment] = React.useState('');
  const [postingPlanComment, setPostingPlanComment] = React.useState(false);

  // The simplified tabs: 'overview' | 'milestones' | 'payments' | 'disputes'
  const [activeTab, setActiveTab] = React.useState<'overview' | 'contractors' | 'project_plan' | 'milestones' | 'payments' | 'disputes'>('overview');

  // Action states & modals
  const [processingPayment, setProcessingPayment] = React.useState(false);
  const [approvingMilestoneId, setApprovingMilestoneId] = React.useState<string | null>(null);
  const [disputeModalMilestone, setDisputeModalMilestone] = React.useState<Milestone | null>(null);
  const [disputeReason, setDisputeReason] = React.useState('');
  const [disputeSubmitting, setDisputeSubmitting] = React.useState(false);
  const [milestoneToApprove, setMilestoneToApprove] = React.useState<Milestone | null>(null);
  const [selectedMilestoneForPayment, setSelectedMilestoneForPayment] = React.useState<Milestone | null>(null);
  const [acceptingQuoteId, setAcceptingQuoteId] = React.useState<string | null>(null);
  const [confirmQuoteToAccept, setConfirmQuoteToAccept] = React.useState<(Quote & { contractor_profile: ContractorProfile }) | null>(null);

  // Dropdown / Accordion state for each milestone stage
  const [expandedStages, setExpandedStages] = React.useState<Record<string, boolean>>({});

  const toggleStage = (stageId: string) => {
    setExpandedStages(prev => {
      const current = prev[stageId];
      const targetM = milestones.find(m => m.id === stageId);
      const defaultState = targetM ? (targetM.status !== 'locked' && (targetM.seq === 1 || targetM.status === 'in_progress' || targetM.status === 'proof_submitted' || targetM.status === 'disputed')) : false;
      const isCurrentlyOpen = current !== undefined ? current : defaultState;
      return { ...prev, [stageId]: !isCurrentlyOpen };
    });
  };

  const handleExpandAllStages = () => {
    const all: Record<string, boolean> = {};
    milestones.forEach(m => { all[m.id] = true; });
    setExpandedStages(all);
  };

  const handleCollapseAllStages = () => {
    const all: Record<string, boolean> = {};
    milestones.forEach(m => { all[m.id] = false; });
    setExpandedStages(all);
  };

  // Modals for viewer
  const [viewingContractorPortfolio, setViewingContractorPortfolio] = React.useState<{ contractor: ContractorProfile; items: any[] } | null>(null);
  const [viewingMaterialQuote, setViewingMaterialQuote] = React.useState<(Quote & { contractor_profile: ContractorProfile | null }) | null>(null);
  const [viewingSlipTx, setViewingSlipTx] = React.useState<any | null>(null);
  const [viewingZoomPhoto, setViewingZoomPhoto] = React.useState<{ url: string; caption?: string } | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = React.useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = React.useState(false);
  const [revisionModalQuote, setRevisionModalQuote] = React.useState<Quote | null>(null);

  // Feedback notifications
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');

  // Payment proof form
  const [configuredMethods, setConfiguredMethods] = React.useState<ConfiguredPaymentMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = React.useState<string>('');
  const selectedPaymentMethod = configuredMethods.find(method => method.id === selectedMethodId) || null;
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const [proofForm, setProofForm] = React.useState({
    customPaymentAmount: '',
    senderName: '',
    senderAccount: '',
    transactionRef: '',
    transferDate: new Date().toISOString().split('T')[0],
    proofFileUrl: '',
    proofFileName: '',
    notes: '',
  });

  const loadedPreviewContractorsRef = React.useRef(new Set<string>());
  const loadedProofMilestonesRef = React.useRef(new Set<string>());
  const paymentSlipInputRef = React.useRef<HTMLInputElement>(null);
  const paymentCameraInputRef = React.useRef<HTMLInputElement>(null);

  const handlePaymentSlipSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDimension = 1280;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
          const sizeKb = Math.round((compressedBase64.length * 3) / 4 / 1024);
          setProofForm(prev => ({
            ...prev,
            proofFileUrl: compressedBase64,
            proofFileName: `${file.name.replace(/\.[^/.]+$/, '')}_slip.jpg (${sizeKb} KB)`
          }));
          showToast(`Deposit receipt optimized & attached (${sizeKb} KB)`, 'success', 'Photo Attached');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Load Data
  const loadData = React.useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    loadedPreviewContractorsRef.current.clear();
    loadedProofMilestonesRef.current.clear();
    setContractorPreviewImages({});
    setLoadingProofMilestones({});
    const supabase = createClient();
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        setProject(null);
        setQuotes([]);
        setMilestones([]);
        setProjectTransactions([]);
        setDisputes([]);
        setConfiguredMethods([]);
        setProjectPlan(null);
        setPlanComments([]);
        return;
      }
      const [profileResult, projectResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .eq('homeowner_id', user.id)
          .maybeSingle(),
      ]);
      const { data: profileData, error: profileError } = profileResult;
      if (profileError) throw profileError;
      setHomeownerName(
        profileData?.full_name
        || user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email?.split('@')[0]
        || 'Homeowner'
      );

      const { data: projectData, error: projectError } = projectResult;
      if (projectError) {
        throw new Error(`Could not load this project (${projectError.code}): ${projectError.message}`);
      }
      if (!projectData) {
        setErrorMsg('This project was not found or your account is not authorized to view it.');
        setProject(null);
        setQuotes([]);
        setMilestones([]);
        setProjectTransactions([]);
        setDisputes([]);
        setConfiguredMethods([]);
        setProjectPlan(null);
        setPlanComments([]);
        return;
      }
      setProject(projectData as Project);

      const quotesPromise = supabase.from('quotes').select('*').eq('project_id', projectId);
      const relatedDataPromise = Promise.all([
        supabase.from('milestones').select('*').eq('project_id', projectId).order('seq', { ascending: true }),
        supabase.from('payment_transactions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('disputes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('payment_methods').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('project_plans').select('*').eq('project_id', projectId).maybeSingle(),
        supabase.from('project_plan_comments').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
      ]);

      const quotesResult = await quotesPromise;
      const loadedQuotes = (quotesResult.data || []) as Quote[];
      const contractorIds = [...new Set(loadedQuotes.map(quote => quote.contractor_id))];
      const profilesPromise = contractorIds.length > 0
        ? supabase
          .from('homeowner_contractor_profiles')
          .select('profile_id, business_name, trade_name, authorized_representative, business_email, business_phone, business_address, license_no, pcab_license_no, pcab_category, verification_status, rating_avg, rating_count, years_experience, service_cities, province')
          .in('profile_id', contractorIds)
        : Promise.resolve({ data: null, error: null });
      const [
        [milestonesResult, transactionsResult, disputesResult, methodsResult, planResult, commentsResult],
        profilesResult,
      ] = await Promise.all([relatedDataPromise, profilesPromise]);

      const queryError = quotesResult.error || milestonesResult.error || transactionsResult.error ||
        disputesResult.error || methodsResult.error || planResult.error || commentsResult.error;
      if (queryError) throw queryError;

      const loadedMethods = (methodsResult.data || []) as ConfiguredPaymentMethod[];
      let contractorProfiles: ContractorProfile[] = [];
      if (!profilesResult.error) {
        contractorProfiles = (profilesResult.data || []) as ContractorProfile[];
      }
      const contractorById = new Map(contractorProfiles.map(profile => [profile.profile_id, profile]));
      setQuotes(loadedQuotes.map(quote => ({
        ...quote,
        contractor_profile: contractorById.get(quote.contractor_id) || null
      })));
      const loadedPlan = (planResult.data || null) as ProjectPlan | null;
      setMilestones(
        loadedPlan && ['submitted', 'approved', 'revision_requested'].includes(loadedPlan.status)
          ? (milestonesResult.data || []) as Milestone[]
          : []
      );
      setProjectTransactions(transactionsResult.data || []);
      setDisputes((disputesResult.data || []) as Dispute[]);
      setConfiguredMethods(loadedMethods);
      setSelectedMethodId(current =>
        loadedMethods.some(method => method.id === current) ? current : loadedMethods[0]?.id || ''
      );
      setProjectPlan(loadedPlan);
      setPlanComments((commentsResult.data || []) as ProjectPlanComment[]);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Project records could not be loaded.');
      setQuotes([]);
      setMilestones([]);
      setProjectTransactions([]);
      setDisputes([]);
      setConfiguredMethods([]);
      setProjectPlan(null);
      setPlanComments([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshMilestoneUpdates = React.useCallback(async () => {
    if (
      !projectId ||
      !projectPlan ||
      !['submitted', 'approved', 'revision_requested'].includes(projectPlan.status)
    ) return;

    const supabase = createClient();
    const { data: freshMilestones, error: milestonesError } = await supabase
      .from('milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('seq', { ascending: true });
    if (milestonesError) throw milestonesError;

    const currentMilestones = (freshMilestones || []) as Milestone[];
    const milestoneIds = currentMilestones.map(milestone => milestone.id);
    const { data: freshProofs, error: proofsError } = milestoneIds.length > 0
      ? await supabase
        .from('milestone_proofs')
        .select('*')
        .in('milestone_id', milestoneIds)
        .order('created_at', { ascending: false })
      : { data: [], error: null };
    if (proofsError) throw proofsError;

    const { data: freshDisputes, error: disputesError } = await supabase
      .from('disputes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (disputesError) throw disputesError;

    const { data: freshTransactions, error: transactionsError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (transactionsError) throw transactionsError;

    const proofsByMilestone = new Map<string, MilestoneProof[]>();
    for (const proof of (freshProofs || []) as MilestoneProof[]) {
      const proofs = proofsByMilestone.get(proof.milestone_id) || [];
      proofs.push(proof);
      proofsByMilestone.set(proof.milestone_id, proofs);
    }

    const allProofs = [...proofsByMilestone.values()].flat();
    const storedProofs = allProofs.filter(proof => !/^https?:\/\//i.test(proof.file_path));
    const signedByPath = new Map<string, string>();
    if (storedProofs.length > 0) {
      const { data: signedUrls, error: signedUrlsError } = await supabase.storage
        .from('milestone-proofs')
        .createSignedUrls(storedProofs.map(proof => proof.file_path), 3600);

      if (!signedUrlsError && signedUrls) {
        signedUrls.forEach(item => {
          if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
        });
      } else if (signedUrlsError) {
        console.error('Unable to create signed URLs for contractor proof images:', signedUrlsError.message);
      }

      const unsignedProofs = storedProofs.filter(proof => !signedByPath.has(proof.file_path));
      if (unsignedProofs.length > 0) {
        const individualSignedUrls = await Promise.all(unsignedProofs.map(async proof => {
          const { data, error } = await supabase.storage
            .from('milestone-proofs')
            .createSignedUrl(proof.file_path, 3600);
          if (error) {
            console.error(`Unable to load milestone proof image ${proof.id}: ${error.message}`);
            return [proof.file_path, ''] as const;
          }
          return [proof.file_path, data.signedUrl] as const;
        }));
        individualSignedUrls.forEach(([path, url]) => {
          if (url) signedByPath.set(path, url);
        });
      }
    }

    const signedProofsByMilestone = new Map<string, MilestoneProof[]>();
    for (const proof of allProofs) {
      const signedProof = /^https?:\/\//i.test(proof.file_path)
        ? proof
        : { ...proof, file_path: signedByPath.get(proof.file_path) || '' };
      const proofs = signedProofsByMilestone.get(proof.milestone_id) || [];
      proofs.push(signedProof);
      signedProofsByMilestone.set(proof.milestone_id, proofs);
    }

    setMilestones(currentMilestones.map(milestone => ({
      ...milestone,
      proofs: signedProofsByMilestone.get(milestone.id) || [],
    })));
    setDisputes((freshDisputes || []) as Dispute[]);
    setProjectTransactions(freshTransactions || []);
  }, [projectId, projectPlan]);

  React.useEffect(() => {
    if (activeTab !== 'milestones' || loading) return;

    let active = true;
    const refresh = () => {
      void refreshMilestoneUpdates().catch(error => {
        if (active) {
          console.error('Unable to refresh contractor milestone updates:', error);
        }
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    const intervalId = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab, loading, refreshMilestoneUpdates]);

  React.useEffect(() => {
    if (activeTab !== 'contractors' || loading) return;

    const contractorIds = [...new Set(quotes.map(quote => quote.contractor_id))]
      .filter(id => !loadedPreviewContractorsRef.current.has(`${projectId}:${id}`));
    if (contractorIds.length === 0) return;
    contractorIds.forEach(id => loadedPreviewContractorsRef.current.add(`${projectId}:${id}`));

    const loadPreviews = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('portfolio_items')
        .select('contractor_id, portfolio_images(file_path, sort_order)')
        .in('contractor_id', contractorIds)
        .order('created_at', { ascending: false })
        .order('sort_order', { foreignTable: 'portfolio_images', ascending: true })
        .limit(1, { foreignTable: 'portfolio_images' });
      if (error) {
        contractorIds.forEach(id => loadedPreviewContractorsRef.current.delete(`${projectId}:${id}`));
        return;
      }

      const previews: Record<string, string> = {};
      for (const item of (data || []) as Array<{
        contractor_id: string;
        portfolio_images?: Array<{ file_path: string; sort_order: number }>;
      }>) {
        const firstImage = [...(item.portfolio_images || [])]
          .sort((left, right) => left.sort_order - right.sort_order)[0];
        if (firstImage?.file_path && !previews[item.contractor_id]) {
          previews[item.contractor_id] = firstImage.file_path;
        }
      }
      setContractorPreviewImages(previous => ({ ...previous, ...previews }));
    };

    void loadPreviews();
  }, [activeTab, loading, projectId, quotes]);

  React.useEffect(() => {
    if (activeTab !== 'milestones' || loading) return;

    const visibleMilestones = milestones.filter(milestone => {
      if (milestone.status === 'locked') return false;
      const defaultExpanded = milestone.seq === 1 ||
        milestone.status === 'in_progress' ||
        milestone.status === 'proof_submitted' ||
        milestone.status === 'disputed';
      return expandedStages[milestone.id] ?? defaultExpanded;
    });
    const milestoneIds = visibleMilestones
      .map(milestone => milestone.id)
      .filter(id => !loadedProofMilestonesRef.current.has(`${projectId}:${id}`));
    if (milestoneIds.length === 0) return;

    milestoneIds.forEach(id => loadedProofMilestonesRef.current.add(`${projectId}:${id}`));
    setLoadingProofMilestones(previous => ({
      ...previous,
      ...Object.fromEntries(milestoneIds.map(id => [id, true])),
    }));

    const loadProofs = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('milestone_proofs')
        .select('*')
        .in('milestone_id', milestoneIds);
      if (error) {
        milestoneIds.forEach(id => loadedProofMilestonesRef.current.delete(`${projectId}:${id}`));
        setLoadingProofMilestones(previous => {
          const next = { ...previous };
          milestoneIds.forEach(id => delete next[id]);
          return next;
        });
        return;
      }

      const proofsByMilestone = new Map<string, MilestoneProof[]>();
      for (const proof of (data || []) as MilestoneProof[]) {
        const proofs = proofsByMilestone.get(proof.milestone_id) || [];
        proofs.push(proof);
        proofsByMilestone.set(proof.milestone_id, proofs);
      }
      const allProofs = [...proofsByMilestone.values()].flat();
      const storedProofs = allProofs.filter(proof => !/^https?:\/\//i.test(proof.file_path));
      const signedByPath = new Map<string, string>();
      if (storedProofs.length > 0) {
        const { data: signed, error: signedError } = await supabase.storage
          .from('milestone-proofs')
          .createSignedUrls(storedProofs.map(proof => proof.file_path), 3600);
        if (!signedError && signed) {
          signed.forEach(item => {
            if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
          });
        } else {
          const individualSigned = await Promise.all(storedProofs.map(async proof => {
            const { data: result } = await supabase.storage
              .from('milestone-proofs')
              .createSignedUrl(proof.file_path, 3600);
            return [proof.file_path, result?.signedUrl || ''] as const;
          }));
          individualSigned.forEach(([path, url]) => {
            if (url) signedByPath.set(path, url);
          });
        }
      }

      const signedProofs = new Map<string, MilestoneProof[]>();
      for (const proof of allProofs) {
        const signedProof = /^https?:\/\//i.test(proof.file_path)
          ? proof
          : { ...proof, file_path: signedByPath.get(proof.file_path) || '' };
        const proofs = signedProofs.get(proof.milestone_id) || [];
        proofs.push(signedProof);
        signedProofs.set(proof.milestone_id, proofs);
      }
      setMilestones(previous => previous.map(milestone => milestoneIds.includes(milestone.id)
        ? { ...milestone, proofs: signedProofs.get(milestone.id) || [] }
        : milestone));
      setLoadingProofMilestones(previous => {
        const next = { ...previous };
        milestoneIds.forEach(id => delete next[id]);
        return next;
      });
    };

    void loadProofs();
  }, [activeTab, expandedStages, loading, milestones, projectId]);

  // Handle URL query parameters for direct tab navigation or action
  React.useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam === 'milestones' || tabParam === 'payments' || tabParam === 'overview' || tabParam === 'disputes' || tabParam === 'contractors' || tabParam === 'project_plan') {
      setActiveTab(tabParam);
    } else {
      setActiveTab('overview');
    }
    const actionParam = searchParams?.get('action');
    if (actionParam === 'pay') {
      setIsPaymentModalOpen(true);
    }
  }, [searchParams]);

  // Financial Calculations
  const awardedQuote = project?.awarded_quote_id
    ? (quotes.find(q => q.id === project.awarded_quote_id) || null)
    : null;
  const contractor = awardedQuote?.contractor_profile || null;
  const submittedQuotes = quotes.filter(quote =>
    !['requested', 'draft', 'withdrawn'].includes(quote.status)
  );

  // The project award is authoritative even when Supabase cannot embed the contractor profile.
  const isContractAccepted = Boolean(
    project?.awarded_quote_id
    || ['awarded', 'project_planning', 'in_progress', 'completed'].includes(project?.status ?? '')
  );

  // Dynamic System Cost Estimation using the official Cost Estimator
  const [systemEstimate, setSystemEstimate] = React.useState<Awaited<ReturnType<typeof calculateEstimate>> | null>(null);
  const [systemEstimateError, setSystemEstimateError] = React.useState('');

  React.useEffect(() => {
    if (!project || Number(project.est_mid) > 0 || Number(awardedQuote?.price) > 0) {
      setSystemEstimate(null);
      setSystemEstimateError('');
      return;
    }

    let active = true;
    setSystemEstimate(null);
    setSystemEstimateError('');
    calculateEstimate(
      Number(project.floor_area_sqm),
      Number(project.floors),
      project.finish_level,
      project.work_type,
      undefined,
      project.province || undefined
    )
      .then(result => { if (active) setSystemEstimate(result); })
      .catch(error => {
        if (active) setSystemEstimateError(error instanceof Error ? error.message : 'No active benchmark is available.');
      });

    return () => { active = false; };
  }, [project, awardedQuote?.price]);

  const systemEstimatedCost = React.useMemo(() => {
    if (Number(project?.est_mid) > 0) return Number(project?.est_mid);
    return systemEstimate?.mid ?? null;
  }, [project?.est_mid, project?.budget, systemEstimate]);

  const agreedCost = isContractAccepted ? Number(awardedQuote?.price || 0) : 0;
  const projectCommissionPercent = Number(project?.platform_commission_percent ?? 0);
  const calculatedCommission = Math.round((agreedCost * projectCommissionPercent / 100 + Number.EPSILON) * 100) / 100;
  const platformCommissionAmount = isContractAccepted
    ? Number(project?.platform_commission_amount ?? calculatedCommission)
    : 0;
  const homeownerTotalAmount = isContractAccepted
    ? Number(project?.homeowner_total_amount || agreedCost + platformCommissionAmount)
    : systemEstimatedCost;
  const displayCostAmount = homeownerTotalAmount;
  const totalContractAmount = displayCostAmount ?? 0;

  const paidMilestones = milestones.filter(m => m.status === 'paid');
  const fundsReleasedTotal = paidMilestones.reduce(
    (sum, m) => sum + Number(m.homeowner_total_amount ?? m.amount ?? 0),
    0
  );

  const txPaidTotal = projectTransactions
    .filter(tx => tx.payment_status === 'SUCCEEDED' || tx.payment_status === 'PAID')
    .reduce((sum, tx) => sum + Number(tx.verified_amount ?? Number(tx.amount_centavos || 0) / 100), 0);

  const pendingPaymentTotal = projectTransactions
    .filter(tx => ['CREATED', 'PENDING', 'PENDING_VERIFICATION', 'PROCESSING'].includes(tx.payment_status))
    .reduce((sum, tx) => sum + (Number(tx.amount_centavos || 0) / 100), 0);

  const heldMilestones = milestones.filter(m => ['proof_submitted', 'disputed'].includes(m.status));
  const heldSum = heldMilestones.reduce(
    (sum, m) => sum + Number(m.homeowner_total_amount ?? m.amount ?? 0),
    0
  );

  const escrowBalance = txPaidTotal > 0
    ? Math.max(0, txPaidTotal - fundsReleasedTotal)
    : heldSum;
  const verifiedEscrowBalance = Math.max(0, txPaidTotal - fundsReleasedTotal);

  const confirmedPaidTotal = Math.max(txPaidTotal, fundsReleasedTotal);
  const remainingBalanceToPay = Math.max(0, totalContractAmount - confirmedPaidTotal);
  const availablePaymentBalance = Math.max(0, remainingBalanceToPay - pendingPaymentTotal);
  const approvalMilestoneAmount = milestoneToApprove
    ? Number(milestoneToApprove.homeowner_total_amount ?? milestoneToApprove.amount)
    : 0;
  const milestonePaymentDue = Math.max(0, approvalMilestoneAmount - verifiedEscrowBalance);
  const defaultPaymentMilestone = milestones.find(milestone => milestone.status === 'in_progress')
    || milestones.find(milestone => milestone.status !== 'paid')
    || null;

  const completedMilestonesCount = paidMilestones.length;
  const totalMilestonesCount = milestones.length;
  const completionPercentage = totalMilestonesCount > 0 ? Math.round((completedMilestonesCount / totalMilestonesCount) * 100) : 0;

  const handleOpenMilestonePayment = (milestone: Milestone) => {
    const milestoneTotal = Number(milestone.homeowner_total_amount ?? milestone.amount);
    const amountDue = Math.max(0, milestoneTotal - verifiedEscrowBalance);
    if (amountDue === 0) {
      showToast('This milestone is already fully funded in escrow.', 'info', 'No Payment Due');
      return;
    }

    setSelectedMilestoneForPayment(milestone);
    setProofForm(prev => ({ ...prev, customPaymentAmount: amountDue.toFixed(2) }));
    setMilestoneToApprove(null);
    setIsPaymentModalOpen(true);
    setErrorMsg('');
  };

  // Milestone Approval Flow
  const handleApproveMilestone = async (m: Milestone) => {
    setApprovingMilestoneId(m.id);
    setErrorMsg('');
    const supabase = createClient();

    try {
      let payoutQueued = false;
      const currentVerifiedEscrowBalance = Math.max(0, txPaidTotal - fundsReleasedTotal);
      const milestoneTotal = Number(m.homeowner_total_amount ?? m.amount);
      if (currentVerifiedEscrowBalance >= milestoneTotal) {
        const { data: payoutId, error: payoutError } = await supabase.rpc('approve_milestone', {
          p_milestone_id: m.id,
        });
        if (payoutError) {
          if (!payoutError.message.toLowerCase().includes('insufficient verified project escrow')) {
            throw payoutError;
          }
        } else {
          if (!payoutId) throw new Error('Milestone approval succeeded without a payout confirmation.');
          payoutQueued = true;
        }
      }

      if (payoutQueued) {
        await loadData();
        setMilestoneToApprove(null);
        const successMessage = `Milestone "${cleanMilestoneTitle(m.name)}" approved and its escrow payout was queued.`;
        setSuccessMsg(successMessage);
        showToast(successMessage, 'success', 'Milestone Approved & Payout Queued');
        return;
      }

      const now = new Date().toISOString();
      const { error: milestoneError } = await supabase
        .from('milestones')
        .update({ status: 'approved', approved_at: now })
        .eq('id', m.id);
      if (milestoneError) throw milestoneError;

      const nextMilestone = milestones.find(item => item.seq === m.seq + 1);
      if (nextMilestone) {
        const { error } = await supabase.from('milestones').update({ status: 'in_progress' }).eq('id', nextMilestone.id);
        if (error) throw error;
      }

      // Update state locally
      setMilestones(prev => prev.map(item => {
        if (item.id === m.id) return { ...item, status: 'approved', approved_at: now };
        if (item.seq === m.seq + 1) return { ...item, status: 'in_progress' };
        return item;
      }));

      setMilestoneToApprove(null);
      const msSuccess = `Milestone "${cleanMilestoneTitle(m.name)}" approved. No escrow payout was made because sufficient verified funds are not available.`;
      setSuccessMsg(msSuccess);
      showToast(msSuccess, 'success', 'Milestone Approved');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve milestone';
      setErrorMsg(message);
      showToast(message, 'error', 'Milestone Approval Failed');
    } finally {
      setApprovingMilestoneId(null);
    }
  };

  // Open Dispute Workflow
  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeModalMilestone || !disputeReason.trim()) return;

    setDisputeSubmitting(true);
    const supabase = createClient();

    try {
      const { data: disputeId, error: disputeError } = await supabase.rpc('open_dispute', {
        p_milestone_id: disputeModalMilestone.id,
        p_reason: disputeReason.trim(),
      });
      if (disputeError) throw disputeError;
      if (!disputeId) throw new Error('The dispute was not created. Please try again.');
      const { data: newDsp, error: disputeLoadError } = await supabase
        .from('disputes')
        .select('*')
        .eq('id', disputeId)
        .single();
      if (disputeLoadError) throw disputeLoadError;

      setDisputes(prev => newDsp ? [newDsp as Dispute, ...prev] : prev);
      setMilestones(prev => prev.map(item => item.id === disputeModalMilestone.id ? { ...item, status: 'disputed' as any } : item));
      setProject(prev => prev ? { ...prev, status: 'disputed' } : prev);

      setDisputeModalMilestone(null);
      setDisputeReason('');
      setErrorMsg('');
      const dispMsg = 'Dispute opened. An administrator will mediate the escrow.';
      setSuccessMsg(dispMsg);
      showToast(dispMsg, 'info', 'Dispute Filed with Admin');
      setActiveTab('disputes');
    } catch (err: unknown) {
      const message = typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
        ? err.message
        : err instanceof Error ? err.message : 'Unable to submit the dispute. Please try again.';
      showToast(message, 'error', 'Dispute Submission Failed');
    } finally {
      setDisputeSubmitting(false);
    }
  };

  // Homeowner confirms rectification and marks dispute resolved
  const handleResolveDispute = async (d: Dispute) => {
    setApprovingMilestoneId(d.milestone_id);
    const supabase = createClient();
    try {
      const { error } = await supabase.rpc('approve_disputed_milestone_fix', {
        p_milestone_id: d.milestone_id,
      });
      if (error) throw error;
    } catch (error: unknown) {
      console.error('Dispute approval failed:', error);
      const message = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : error instanceof Error ? error.message : 'Failed to resolve dispute. Please try again.';
      showToast(message, 'error', 'Dispute Update Failed');
      setApprovingMilestoneId(null);
      return;
    }

    const now = new Date().toISOString();
    setDisputes(prev => prev.map(item => item.id === d.id
      ? { ...item, status: 'resolved_fix', resolved_at: now, resolution: 'Homeowner accepted the contractor rectification; stage returned to in progress without payout' }
      : item));
    const resolvedMilestone = milestones.find(milestone => milestone.id === d.milestone_id);
    setMilestones(prev => prev.map(milestone => {
      if (milestone.id === d.milestone_id) {
        return { ...milestone, status: 'in_progress', approved_at: null, paid_at: null };
      }
      if (resolvedMilestone && milestone.seq === resolvedMilestone.seq + 1 && milestone.status === 'in_progress') {
        return { ...milestone, status: 'locked' };
      }
      return milestone;
    }));
    setProject(prev => prev ? { ...prev, status: 'in_progress' } : prev);
    showToast('Fix approved. The milestone is back in progress; no payout was released.', 'success', 'Dispute Resolved');
    setApprovingMilestoneId(null);
  };

  // Homeowner Accepts Contractor Proposal & Awards Contract -> Transitions to Project Planning Phase
  const handleAcceptContractorQuote = async (targetQuote: Quote & { contractor_profile: ContractorProfile | null }) => {
    setAcceptingQuoteId(targetQuote.id);
    const supabase = createClient();
    const agreedPrice = Number(targetQuote.price);

    try {
      const { error } = await supabase.rpc('phase_one_accept_quote', { p_quote_id: targetQuote.id });
      if (error) throw error;

      const commissionAmount = Math.round((agreedPrice * projectCommissionPercent / 100 + Number.EPSILON) * 100) / 100;
      const totalAmount = agreedPrice + commissionAmount;
      setProject(prev => prev ? {
        ...prev,
        awarded_quote_id: targetQuote.id,
        status: 'project_planning',
        platform_commission_amount: commissionAmount,
        homeowner_total_amount: totalAmount,
      } : prev);
      setQuotes(prev => prev.map(q => q.id === targetQuote.id ? { ...q, status: 'accepted' as any } : { ...q, status: 'declined' as any }));
      setMilestones([]);
      setConfirmQuoteToAccept(null);
      setIsComparisonOpen(false);

      const contractorName = targetQuote.contractor_profile?.business_name || 'the selected contractor';
      const successToast = `Proposal accepted. Your total project cost is ${formatCurrency(totalAmount)}.`;
      setSuccessMsg(successToast);
      showToast(successToast, 'success', 'Proposal Accepted — Project Planning Phase');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to award contract';
      setErrorMsg(message);
      showToast(message, 'error', 'Award Failed');
    } finally {
      setAcceptingQuoteId(null);
    }
  };

  // Homeowner Requests Quotation Revision / Clarification
  const handleRequestRevision = async (quoteId: string, notes: string) => {
    const supabase = createClient();
    const now = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('quotes')
        .update({
          status: 'revision_requested',
          revision_requested_notes: notes,
          revision_requested_at: now
        })
        .eq('id', quoteId);
      if (error) throw error;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to request a quotation revision.', 'error');
      return;
    }

    const targetQuote = quotes.find(q => q.id === quoteId);
    if (targetQuote) {
      const updated = {
        ...targetQuote,
        status: 'revision_requested' as const,
        revision_requested_notes: notes,
        revision_requested_at: now
      };
      setQuotes(prev => prev.map(q => q.id === quoteId ? (updated as any) : q));
    }

    showToast('Revision request sent to contractor. They will update their materials quotation and proposal.', 'success', 'Revision Requested');
    setRevisionModalQuote(null);
    await loadData();
  };

  // Homeowner Approves Project Plan
  const handleApproveProjectPlan = async () => {
    if (!project) return;
    setApprovingPlan(true);
    const supabase = createClient();
    const now = new Date().toISOString();

    try {
      const { error } = await supabase.rpc('phase_one_approve_project_plan', {
        p_project_id: project.id,
      });
      if (error) throw error;

      if (projectPlan) {
        setProjectPlan({ ...projectPlan, status: 'approved', approved_at: now, updated_at: now });
      }

      if (milestones.length > 0) {
        setMilestones(prev => prev.map(milestone => (
          ['locked', 'in_progress'].includes(milestone.status)
            ? { ...milestone, status: milestone.seq === 1 ? 'in_progress' : 'locked' }
            : milestone
        )));
      }

      setProject(prev => prev ? { ...prev, status: 'in_progress' } : prev);
      showToast('Project plan approved! Construction officially advances to Building phase.', 'success', 'Plan Approved');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to approve project plan', 'error');
    } finally {
      setApprovingPlan(false);
    }
  };

  // Homeowner Requests Milestone Plan Revision
  const handleRequestPlanRevision = async () => {
    if (!project || !planRevisionNotes.trim()) {
      showToast('Please provide revision comments explaining what needs to change.', 'error');
      return;
    }
    setSubmittingPlanRevision(true);
    const supabase = createClient();
    const now = new Date().toISOString();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to request plan revisions.');
      const authorName = user.user_metadata?.full_name || user.email || 'Homeowner';
      const { error: planError } = await supabase
        .from('project_plans')
        .update({
          status: 'revision_requested',
          revision_notes: planRevisionNotes.trim(),
          updated_at: now,
        })
        .eq('project_id', project.id);
      if (planError) throw planError;

      const { data: comment, error: commentError } = await supabase.from('project_plan_comments').insert({
        project_id: project.id,
        author_name: authorName,
        author_role: 'homeowner',
        message: `[REVISION REQUESTED]: ${planRevisionNotes.trim()}`,
      }).select().single();
      if (commentError) throw commentError;

      if (projectPlan) {
        setProjectPlan({
          ...projectPlan,
          status: 'revision_requested',
          revision_notes: planRevisionNotes.trim(),
          updated_at: now,
        });
      }

      if (comment) setPlanComments(prev => [...prev, comment as ProjectPlanComment]);

      setPlanRevisionModalOpen(false);
      setPlanRevisionNotes('');
      showToast('Revision request sent to contractor. They can now adjust and resubmit the schedule.', 'success', 'Revision Requested');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to request revision', 'error');
    } finally {
      setSubmittingPlanRevision(false);
    }
  };

  // Homeowner Comments on Plan
  const handlePostPlanComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanComment.trim() || !project) return;
    setPostingPlanComment(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to post comments.');
      const { data: comment, error } = await supabase.from('project_plan_comments').insert({
        project_id: project.id,
        author_name: user.user_metadata?.full_name || user.email || 'Homeowner',
        author_role: 'homeowner',
        message: newPlanComment.trim(),
      }).select().single();
      if (error) throw error;
      if (comment) setPlanComments(prev => [...prev, comment as ProjectPlanComment]);
      setNewPlanComment('');
      showToast('Comment posted.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to post comment', 'error');
    } finally {
      setPostingPlanComment(false);
    }
  };

  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [isDeletingProject, setIsDeletingProject] = React.useState(false);

  const handleDeleteCurrentProject = async () => {
    setIsDeletingProject(true);
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to delete projects.');
      const { error: quotesError } = await supabase.from('quotes').delete().eq('project_id', projectId);
      if (quotesError) throw quotesError;
      const { error: projectError } = await supabase.from('projects')
        .delete().eq('id', projectId).eq('homeowner_id', user.id);
      if (projectError) throw projectError;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Project could not be deleted.', 'error', 'Delete Failed');
      setIsDeletingProject(false);
      return;
    }
    showToast(`Project "${project?.title}" has been permanently deleted.`, 'success', 'Project Deleted');
    setShowDeleteModal(false);
    setIsDeletingProject(false);
    router.push('/homeowner/projects');
  };

  // Submit Payment Proof Handler
  const handleExecuteProofSubmission = async () => {
    if (!project) return;
    const method = configuredMethods.find(m => m.id === selectedMethodId);
    if (!method) {
      showToast('No active payment methods are available.', 'error', 'Payment Method Unavailable');
      return;
    }
    const enteredAmount = parseNumberInput(proofForm.customPaymentAmount);
    const centavos = Math.round(enteredAmount * 100);
    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0 || !Number.isSafeInteger(centavos)) {
      showToast('Please enter a valid payment amount.', 'error', 'Amount Required');
      return;
    }
    if (Math.abs(enteredAmount * 100 - centavos) > 1e-8) {
      showToast('Enter the amount using no more than two decimal places.', 'error', 'Invalid Amount');
      return;
    }
    if (enteredAmount > availablePaymentBalance) {
      showToast(
        `Payment cannot exceed the remaining amount available for payment (${formatCurrency(availablePaymentBalance)}).`,
        'error',
        'Amount Exceeds Balance'
      );
      return;
    }
    if (method.min_amount != null && enteredAmount < method.min_amount) {
      showToast(`The minimum payment for ${method.display_name} is ${formatCurrency(method.min_amount)}.`, 'error', 'Below Minimum');
      return;
    }
    if (method.max_amount != null && enteredAmount > method.max_amount) {
      showToast(`The maximum payment for ${method.display_name} is ${formatCurrency(method.max_amount)}.`, 'error', 'Above Maximum');
      return;
    }
    if (!proofForm.senderName.trim()) {
      showToast('Enter the sender name for this payment.', 'error', 'Sender Name Required');
      return;
    }
    if (method.requires_proof && !proofForm.proofFileUrl) {
      showToast('Attach payment proof before submitting this method.', 'error', 'Proof Required');
      return;
    }

    const autoRef = proofForm.transactionRef.trim() || `PAY-${Date.now().toString().slice(-6)}`;
    const autoSender = proofForm.senderName.trim();
    const targetMilestone = selectedMilestoneForPayment || defaultPaymentMilestone;

    setProcessingPayment(true);
    setErrorMsg('');
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to submit a payment.');
      if (!awardedQuote?.contractor_id) throw new Error('A contractor must be assigned before submitting payment.');
      const internalTxRef = `TXN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100000 + Math.random() * 900000)}`;
      const methodCode = `${method.code} ${method.bank_or_provider_name}`.toLowerCase();
      const paymentMethod = method.category === 'cash_check'
        ? 'cash'
        : method.category === 'bank_transfer' || method.category === 'qr_ph'
          ? 'bank_transfer'
          : method.category === 'card'
            ? 'card'
            : method.category === 'ewallet'
              ? methodCode.includes('maya') ? 'maya' : 'gcash'
              : 'sandbox';

      const newTransaction = {
        transaction_ref: internalTxRef,
        idempotency_key: `proof-${projectId}-${autoRef}-${Date.now()}`,
        project_id: projectId,
        milestone_id: targetMilestone?.id || null,
        payer_id: user.id,
        recipient_id: awardedQuote.contractor_id,
        amount_centavos: centavos,
        currency: 'PHP',
        payment_method: paymentMethod,
        payment_method_id: method.id,
        provider: method.bank_or_provider_name,
        provider_tx_ref: autoRef,
        sender_name: autoSender,
        sender_account_identifier: proofForm.senderAccount.trim() || null,
        proof_file_url: proofForm.proofFileUrl || null,
        proof_file_name: proofForm.proofFileName || null,
        notes: proofForm.notes.trim() || null,
        payment_status: 'PENDING_VERIFICATION' as const,
        payout_status: 'NOT_READY' as const,
      };

      const { data: savedTransaction, error } = await supabase
        .from('payment_transactions')
        .insert(newTransaction)
        .select()
        .single();
      if (error) throw error;

      if (savedTransaction) setProjectTransactions(prev => [savedTransaction, ...prev]);

      setIsPaymentModalOpen(false);
      setSelectedMilestoneForPayment(null);
      setProofForm({
        customPaymentAmount: '',
        senderName: '',
        senderAccount: '',
        transactionRef: '',
        transferDate: new Date().toISOString().split('T')[0],
        proofFileUrl: '',
        proofFileName: '',
        notes: '',
      });

      const notifyMsg = `Payment of ${formatCurrency(enteredAmount)} submitted successfully (Ref: ${autoRef}).`;
      setSuccessMsg(notifyMsg);
      showToast(notifyMsg, 'success', 'Payment Submitted');
      setActiveTab('payments');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit proof of payment';
      setErrorMsg(message);
      showToast(message, 'error', 'Submission Failed');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Account details copied to clipboard!', 'success', 'Copied');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleViewContractorPortfolio = async (target: ContractorProfile) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('portfolio_items')
      .select('*, portfolio_images(*)')
      .eq('contractor_id', target.profile_id)
      .order('created_at', { ascending: false });
    if (error) {
      showToast(error.message, 'error', 'Portfolio Unavailable');
      return;
    }
    setViewingContractorPortfolio({ contractor: target, items: data || [] });
  };

  if (loading) {
    return (
      <AppLayout userRole="homeowner" userName={homeownerName} title="Project Details">
        <div className="w-full py-16 text-center text-slate-500">
          Loading project inspection and milestone records...
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout userRole="homeowner" userName={homeownerName} title={errorMsg ? 'Project Unavailable' : 'Project Not Found'}>
        <div className="w-full py-16 text-center text-red-500">
          {errorMsg || 'Active project not found.'}
        </div>
      </AppLayout>
    );
  }

  const hasApprovedProjectPlan = projectPlan?.status === 'approved';

  return (
    <AppLayout
      userRole="homeowner"
      userName={homeownerName}
      title={project.title}
      subtitle={`Location: ${project.city || 'Location unavailable'} • Builder: ${contractor?.business_name || (isContractAccepted ? 'Awarded contractor' : 'Pending Contractor Award')}`}
      workspace={{
        projectId: project.id,
        projectTitle: project.title,
        backHref: '/homeowner/projects',
      }}
    >
      <div className="w-full space-y-6">
        {errorMsg && (
          <div className="p-4 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold">
            Project data or requested operation could not be completed: {errorMsg}
          </div>
        )}
        {activeTab === 'project_plan' && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Project Plan</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Review the contractor’s proposed construction stages, schedule, and plan status.
                  </p>
                </div>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase text-slate-700">
                  {projectPlan ? removeUnderscore(projectPlan.status) : project.status === 'project_planning' ? 'In preparation' : 'Not started'}
                </span>
              </div>

              {project.status !== 'project_planning' && !projectPlan ? (
                <div className="py-12 text-center">
                  <FolderKanban className="mx-auto h-8 w-8 text-slate-300" />
                  <h3 className="mt-3 text-sm font-bold text-slate-800">Project plan not started</h3>
                  <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                    A project plan is prepared after you accept a contractor’s proposal. Review available proposals in the Contractors section.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push(`/homeowner/projects/${project.id}?tab=contractors`)}
                    className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    View Contractors
                  </button>
                </div>
              ) : projectPlan?.status === 'submitted' ? (
                <div className="space-y-5 pt-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-600">
                      Submitted by {contractor?.business_name || 'your contractor'} on {projectPlan.submitted_at ? formatDate(projectPlan.submitted_at) : '—'}.
                      Review the plan before approving it.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPlanRevisionModalOpen(true)}
                        className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
                        Request Revision
                      </button>
                      <button
                        type="button"
                        disabled={approvingPlan}
                        onClick={handleApproveProjectPlan}
                        className="rounded-xl bg-[#136F48] px-3 py-2 text-xs font-bold text-white hover:bg-[#0f5939] disabled:opacity-50"
                      >
                        {approvingPlan ? 'Approving...' : 'Approve Project Plan'}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-bold text-slate-600">
                        <tr>
                          <th className="px-3 py-2.5">Stage</th>
                          <th className="px-3 py-2.5">Description</th>
                          <th className="px-3 py-2.5">Homeowner Total</th>
                          <th className="px-3 py-2.5">Schedule</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {milestones.map((milestone) => (
                          <tr key={milestone.id}>
                            <td className="px-3 py-3 font-semibold text-slate-900">{milestone.seq}. {milestone.name}</td>
                            <td className="px-3 py-3 text-slate-600">{milestone.description || 'Stage execution works'}</td>
                            <td className="px-3 py-3 font-mono font-semibold text-slate-800">
                              {formatCurrency(milestone.amount)}
                            </td>
                            <td className="px-3 py-3 text-slate-600">{milestone.start_date ? formatDate(milestone.start_date) : '—'} – {milestone.end_date ? formatDate(milestone.end_date) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : projectPlan?.status === 'revision_requested' ? (
                <div className="py-10 text-center">
                  <h3 className="text-sm font-bold text-amber-800">Awaiting contractor revision</h3>
                  <p className="mx-auto mt-2 max-w-lg text-xs text-slate-600">
                    Your feedback: {projectPlan.revision_notes || 'The contractor was asked to revise the project plan.'}
                  </p>
                </div>
              ) : projectPlan?.status === 'approved' ? (
                <div className="py-10 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                  <h3 className="mt-3 text-sm font-bold text-emerald-800">Project plan approved</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    The approved work schedule is available in Milestones.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push(`/homeowner/projects/${project.id}?tab=milestones`)}
                    className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    View Milestones
                  </button>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <Clock className="mx-auto h-8 w-8 text-indigo-400" />
                  <h3 className="mt-3 text-sm font-bold text-slate-800">Plan in preparation</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Your contractor is preparing the construction stages and schedule for review.
                  </p>
                </div>
              )}
            </section>

            {projectPlan && (
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">Plan Discussion & Feedback</h3>
                  <p className="mt-1 text-xs text-slate-500">Messages about the schedule and proposed work stages.</p>
                </div>
                <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
                  {planComments.length === 0 ? (
                    <p className="text-xs text-slate-400">No plan comments yet.</p>
                  ) : planComments.map((comment) => (
                    <div key={comment.id} className={`flex ${comment.author_role === 'homeowner' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs ${
                        comment.author_role === 'homeowner'
                          ? 'rounded-br-md bg-emerald-700 text-white'
                          : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                      }`}>
                        <div className={`mb-1 flex items-center justify-between gap-4 text-[10px] ${
                          comment.author_role === 'homeowner' ? 'text-emerald-100' : 'text-slate-500'
                        }`}>
                          <strong className="font-semibold">{comment.author_name}</strong>
                          <time dateTime={comment.created_at}>
                            {new Date(comment.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </time>
                        </div>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{comment.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handlePostPlanComment} className="flex gap-2">
                  <input
                    type="text"
                    value={newPlanComment}
                    onChange={(event) => setNewPlanComment(event.target.value)}
                    placeholder="Message your contractor about the plan..."
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800"
                  />
                  <button
                    type="submit"
                    disabled={postingPlanComment || !newPlanComment.trim()}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </section>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 1: OVERVIEW                                                      */}
        {/* Project details, location, contractor info, agreed amount, released  */}
        {/* funds, remaining balance, and escrow balance                        */}
        {/* ==================================================================== */}
        {(activeTab === 'overview' || activeTab === 'contractors') && (
          <div className="space-y-6">
            {/* Project Planning Notification Banner */}
            {project.status === 'project_planning' && (
              <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 border border-indigo-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Clock className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base">Project Planning in Progress</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 uppercase tracking-wide border border-indigo-200">
                        Contract Proposal Accepted
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                      The accepted contractor quote is <strong className="text-slate-900 font-mono">{formatCurrency(agreedCost)}</strong>. The contractor is preparing the milestone schedule.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('milestones')}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0 shadow-xs transition cursor-pointer"
                >
                  View Milestone Roadmap →
                </button>
              </div>
            )}

            {/* Financial Metrics Cards Strip (Contextual based on whether contractor is awarded or awaiting bids) */}
            {activeTab === 'overview' && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                  {isContractAccepted ? 'Total Agreed Cost' : 'Estimated Project Cost'}
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 mt-1 truncate" title={formatCurrency(displayCostAmount)}>
                  {formatCurrency(displayCostAmount)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {isContractAccepted
                    ? `${formatCurrency(agreedCost)} contractor quote`
                    : systemEstimate
                      ? `Low: ${formatCurrency(systemEstimate.low)} • High: ${formatCurrency(systemEstimate.high)}`
                      : 'Standard Philippine construction baseline'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 shadow-xs">
                <div className="text-[11px] text-emerald-800 font-medium uppercase tracking-wider">Released Funds</div>
                <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
                  {formatCurrency(fundsReleasedTotal)}
                </div>
                <div className="text-[11px] text-emerald-700/80 mt-0.5">
                  {isContractAccepted ? `${completedMilestonesCount} stage(s) approved & paid` : 'No milestone payouts yet'}
                </div>
              </div>

              <div className="order-first p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                  Project Status
                </div>
                <div className="text-xl font-bold font-mono text-slate-800 mt-1 truncate">
                  {isContractAccepted
                    ? formatCurrency(remainingBalanceToPay)
                    : submittedQuotes.length > 0
                      ? `${submittedQuotes.length} proposal${submittedQuotes.length === 1 ? '' : 's'} received`
                      : 'Awaiting proposals'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {isContractAccepted
                    ? 'Balance yet to complete'
                    : submittedQuotes.length > 0
                    ? 'Review proposals and choose a contractor'
                    : 'Awaiting contractor proposals'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 shadow-xs">
                <div className="text-[11px] text-blue-800 font-medium uppercase tracking-wider">Escrow Balance</div>
                <div className="text-xl font-bold font-mono text-blue-700 mt-1">
                  {formatCurrency(escrowBalance)}
                </div>
                <div className="text-[11px] text-blue-700/80 mt-0.5">
                  {isContractAccepted ? 'Safeguarded vault balance' : 'Escrow funded after award'}
                </div>
              </div>
            </div>}

            {/* Project details and contractor proposals have their own workspace sections. */}
            <div className="grid grid-cols-1 gap-6">
              {/* Project Specifications */}
              {activeTab === 'overview' && <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-5 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-base font-bold uppercase tracking-wide text-slate-700">Project Details &amp; Location</span>
                        <h3 className="mt-1 text-lg font-bold text-slate-950">{project.title}</h3>
                        <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
                          <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${project.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                        project.status === 'project_planning' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                        project.status === 'awarded' ? 'bg-indigo-100 text-indigo-800' :
                          project.status === 'disputed' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {removeUnderscore(project.status)}
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-slate-800">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            {project.city}{project.province ? `, ${project.province}` : ''}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center gap-1 font-semibold text-blue-700">
                            <HardHat className="h-3.5 w-3.5 text-blue-600" />
                            Builder: <strong className="ml-0.5 text-slate-900">{contractor?.business_name || (isContractAccepted ? 'Awarded contractor' : 'Pending Contractor Award')}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {project.status === 'project_planning' ? (
                      <span className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800">
                        Contractor Formulating Milestones
                      </span>
                    ) : isContractAccepted ? (
                      <button
                        type="button"
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        Pay Milestone Escrow
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowDeleteModal(true)}
                        className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                      >
                        Delete Project
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Project specifications</div>
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Work Scope</span>
                    <strong className="text-slate-800 capitalize font-semibold">{removeUnderscore(project.work_type)}</strong>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">House Type</span>
                    <strong className="text-slate-800 capitalize font-semibold">{project.house_type ? removeUnderscore(project.house_type) : 'Unavailable'}</strong>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Floor Area</span>
                    <strong className="text-slate-800 font-semibold">{project.floor_area_sqm ?? '—'} sq.m ({project.floors ?? '—'} flr)</strong>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Finish Level</span>
                    <strong className="text-slate-800 capitalize font-semibold">{project.finish_level ? `${project.finish_level} Finish` : 'Unavailable'}</strong>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-blue-600">Estimated Project Cost</span>
                    <strong className="text-blue-700 font-bold">
                      {systemEstimatedCost == null ? 'Unavailable' : formatCurrency(systemEstimatedCost)}
                    </strong>
                    {systemEstimate && (
                      <span className="text-[10px] text-slate-500 block">
                        Range: {formatCurrency(systemEstimate.low)} – {formatCurrency(systemEstimate.high)}
                      </span>
                    )}
                    {systemEstimateError && (
                      <span className="text-[10px] text-red-600 block">{systemEstimateError}</span>
                    )}
                  </div>
                  {project.budget && Number(project.budget) > 0 && Number(project.budget) < 1000000000 && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Homeowner's Target Budget</span>
                      <strong className="text-slate-800 font-bold">{formatCurrency(Number(project.budget))}</strong>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Site Location</span>
                    <strong className="text-slate-800 font-semibold">{project.city}{project.province ? `, ${project.province}` : ''}</strong>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Contract Mobilized</span>
                    <strong className="text-slate-800 font-semibold">{formatDate(project.created_at)}</strong>
                    </div>
                  </div>
                </div>

                {(project as any).description && (
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-xs font-bold text-slate-700 block mb-1">Homeowner Requirements & Scope Notes:</span>
                    <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      {(project as any).description}
                    </p>
                  </div>
                )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-3 shadow-sm">
                  <div
                    onClick={project.plan_file_path ? () => setViewingZoomPhoto({ url: project.plan_file_path!, caption: project.title }) : undefined}
                    className={`relative flex min-h-72 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2 group ${project.plan_file_path ? 'cursor-pointer' : ''}`}
                    title={project.plan_file_path ? 'Click to zoom image' : undefined}
                  >
                    {project.plan_file_path ? (
                      <img
                        src={project.plan_file_path}
                        alt={project.title}
                        className="max-h-80 w-auto max-w-full object-contain rounded-lg transition-transform duration-300 group-hover:scale-101"
                      />
                    ) : (
                      <div className="flex h-48 items-center justify-center text-xs text-slate-400">No project image provided</div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-end rounded-b-xl bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4">
                      <div className="text-xs text-white">
                        <span className="block text-sm font-bold">{project.title}</span>
                        <span className="text-[11px] text-slate-200">{project.city}{project.province ? `, ${project.province}` : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="px-2 pb-1 pt-3 text-[11px] font-medium text-slate-500">
                    Project preview
                  </div>
                </div>
              </div>}

              {/* Contractor Information Card */}
              {activeTab === 'contractors' && <div className="min-h-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <HardHat className="h-5 w-5 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900">Contractor Proposals &amp; Award</h3>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    isContractAccepted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {isContractAccepted ? 'Contract Awarded' : 'Reviewing Proposals'}
                  </span>
                </div>

                  {contractor ? (
                  <div className="grid min-h-0 grid-cols-1 gap-4 text-xs xl:grid-cols-[minmax(230px,0.34fr)_minmax(0,0.66fr)]">
                    <div className="flex min-h-0 flex-col gap-2.5">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <span className="text-slate-400 block text-[11px]">Builder Firm</span>
                        <strong className="text-slate-900 font-bold text-sm block mt-0.5">{contractor.business_name}</strong>
                        {contractor.trade_name && <span className="text-[11px] text-slate-500">Trade: {contractor.trade_name}</span>}
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <span className="text-slate-400 block text-[11px]">Authorized Representative</span>
                        <strong className="text-slate-800 font-semibold block mt-0.5">{contractor.authorized_representative || 'Authorized Representative'}</strong>
                      </div>

                      <div className="space-y-1 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-900">
                          <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                          <span>PCAB Accreditation</span>
                        </div>
                        <div className="font-mono text-xs font-bold text-blue-800">{contractor.pcab_license_no || contractor.license_no || 'License not provided'}</div>
                        <div className="text-[10px] text-blue-700">{contractor.pcab_category || 'Category A — General Building'}</div>
                      </div>

                      <div className="space-y-1.5 rounded-xl border border-slate-100 p-3">
                        <div className="flex items-center gap-2 text-slate-600"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{contractor.business_email || '—'}</span></div>
                        <div className="flex items-center gap-2 text-slate-600"><Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span>{contractor.business_phone || '—'}</span></div>
                        <div className="flex items-start gap-2 text-slate-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="leading-snug">{contractor.business_address || '—'}</span></div>
                      </div>

                      <div className="mt-auto space-y-2 border-t border-slate-100 pt-3">
                        <button type="button" onClick={() => handleViewContractorPortfolio(contractor)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100">
                          <Eye className="h-3.5 w-3.5 text-slate-500" /> View Contractor Portfolio
                        </button>
                        <Link href={`/contractors/${contractor.profile_id}?returnTo=${encodeURIComponent(returnTo)}`} className="block w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-center text-xs font-bold text-blue-800 transition hover:bg-blue-100">
                          View Full Profile, License &amp; Projects
                        </Link>
                      </div>
                    </div>
                    {awardedQuote && (
                      <div className="min-h-0 overflow-hidden">
                        <QuoteCostBreakdown quote={awardedQuote} title="Accepted Project Cost Breakdown" compact />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-amber-700 font-bold">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Pending Contractor Award</span>
                      </div>
                      <p className="text-slate-600 leading-relaxed text-[11px]">
                        Review competitive proposals submitted by licensed builders. Accepting a proposal establishes the agreed contract price and unlocks milestone construction tracking.
                      </p>
                    </div>

                    {submittedQuotes.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-900 flex items-center gap-1.5">
                            <HardHat className="w-4 h-4 text-blue-600" />
                            <span>Submitted Contractor Proposals ({submittedQuotes.length})</span>
                          </span>
                          {submittedQuotes.length >= 2 && (
                            <button
                              type="button"
                              onClick={() => setIsComparisonOpen(true)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                            >
                              <Scale className="w-3.5 h-3.5" />
                              <span>Compare Proposals ({submittedQuotes.length})</span>
                            </button>
                          )}
                        </div>

                        <div>
                          <div className="grid gap-4 pb-1 sm:grid-cols-2 xl:grid-cols-3">
                          {submittedQuotes.map((q) => (
                            <div
                              key={q.id}
                              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                            >
                              <div className="relative h-32 overflow-hidden bg-gradient-to-br from-emerald-100 via-slate-100 to-blue-100">
                                {contractorPreviewImages[q.contractor_id] ? (
                                  <img
                                    src={contractorPreviewImages[q.contractor_id]}
                                    alt={`${q.contractor_profile?.business_name || 'Contractor'} portfolio`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center">
                                    <Building2 className="h-12 w-12 text-emerald-800/35" />
                                  </div>
                                )}
                                <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm ${
                                  q.contractor_profile?.verification_status === 'approved'
                                    ? 'bg-white/95 text-emerald-800'
                                    : 'bg-white/95 text-amber-800'
                                }`}>
                                  {q.contractor_profile?.verification_status === 'approved'
                                    ? <><ShieldCheck className="h-3.5 w-3.5" /> Verified contractor</>
                                    : <><Clock className="h-3.5 w-3.5" /> Verification pending</>}
                                </span>
                                <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase shadow-sm ${
                                  q.status === 'accepted' || q.id === project.awarded_quote_id
                                    ? 'bg-emerald-600 text-white'
                                    : q.status === 'revision_requested'
                                      ? 'bg-amber-100 text-amber-900'
                                      : ['declined', 'rejected', 'expired'].includes(q.status)
                                        ? 'bg-slate-800/80 text-white'
                                        : 'bg-blue-100 text-blue-900'
                                }`}>
                                  {q.id === project.awarded_quote_id || q.status === 'accepted'
                                    ? 'Accepted'
                                    : q.status === 'revision_requested'
                                      ? 'Revision requested'
                                      : q.status === 'revised'
                                        ? 'Revised'
                                        : q.status === 'declined'
                                          ? 'Declined'
                                          : q.status === 'rejected'
                                            ? 'Rejected'
                                            : q.status === 'expired'
                                              ? 'Expired'
                                              : 'Under review'}
                                </span>
                              </div>

                              <div className="space-y-3 p-4">
                                <div className="flex items-start gap-3">
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-800">
                                    <HardHat className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="truncate text-sm font-bold text-slate-900">
                                      {q.contractor_profile?.business_name || `Contractor ${q.contractor_id.slice(0, 8)}`}
                                    </h4>
                                    {q.contractor_profile?.trade_name && (
                                      <p className="truncate text-[11px] text-slate-500">{q.contractor_profile.trade_name}</p>
                                    )}
                                    <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
                                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                      <span className="font-semibold">
                                        {q.contractor_profile?.rating_avg
                                          ? Number(q.contractor_profile.rating_avg).toFixed(1)
                                          : 'New'}
                                      </span>
                                      {q.contractor_profile?.rating_count ? (
                                        <span>({q.contractor_profile.rating_count} reviews)</span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                  {(q.contractor_profile?.specialties || []).slice(0, 3).map(specialty => (
                                    <span key={specialty} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                                      {removeUnderscore(specialty)}
                                    </span>
                                  ))}
                                  {q.contractor_profile?.years_experience ? (
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                                      {q.contractor_profile.years_experience}+ years
                                    </span>
                                  ) : null}
                                </div>

                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    {q.contractor_profile?.province || q.contractor_profile?.service_cities?.join(', ') || 'Service area not listed'}
                                  </span>
                                </div>

                                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Quotation price</div>
                                  <div className="mt-0.5 font-mono text-xl font-extrabold text-emerald-800">
                                    {formatCurrency(q.price)}
                                  </div>
                                  {q.price != null && (
                                    <div className="mt-2 space-y-1 border-t border-emerald-100 pt-2 text-[10px]">
                                      <div className="flex justify-between gap-2 text-slate-600">
                                        <span>Contractor quote</span>
                                        <strong>{formatCurrency(Number(q.price))}</strong>
                                      </div>
                                      <div className="flex justify-between gap-2 text-slate-600">
                                        <span>Platform commission ({projectCommissionPercent}%)</span>
                                        <strong>{formatCurrency(Math.round((Number(q.price) * projectCommissionPercent / 100 + Number.EPSILON) * 100) / 100)}</strong>
                                      </div>
                                      <div className="flex justify-between gap-2 border-t border-emerald-100 pt-1 font-bold text-emerald-900">
                                        <span>Total payable if accepted</span>
                                        <strong>{formatCurrency(Number(q.price) + Math.round((Number(q.price) * projectCommissionPercent / 100 + Number.EPSILON) * 100) / 100)}</strong>
                                      </div>
                                    </div>
                                  )}
                                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-emerald-100 pt-2 text-[10px]">
                                    <div>
                                      <span className="block text-slate-500">Duration</span>
                                      <span className="font-semibold text-slate-800">{q.duration_months ? `${q.duration_months} months` : 'Not specified'}</span>
                                    </div>
                                    <div>
                                      <span className="block text-slate-500">License</span>
                                      <span className="truncate font-semibold text-slate-800">
                                        {q.contractor_profile?.pcab_license_no || q.contractor_profile?.license_no || 'Not provided'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {q.scope_of_work && (
                                  <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                                    <strong className="text-slate-800">Scope:</strong> {q.scope_of_work}
                                  </p>
                                )}

                                <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                                  <button
                                    type="button"
                                    onClick={() => setViewingMaterialQuote(q)}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
                                  >
                                    <FileSpreadsheet className="h-3.5 w-3.5" />
                                    See Quotation
                                  </button>
                                  <Link
                                    href={`/contractors/${q.contractor_id}?returnTo=${encodeURIComponent(returnTo)}`}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-700 bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    View Profile
                                  </Link>
                                  {!isContractAccepted && !['declined', 'rejected', 'expired'].includes(q.status) && (
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setRevisionModalQuote(q)}
                                        className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100"
                                      >
                                        Request Revision
                                      </button>
                                      <button
                                        type="button"
                                        disabled={acceptingQuoteId === q.id}
                                        onClick={() => handleAcceptContractorQuote(q)}
                                        className="flex-1 rounded-xl bg-emerald-700 px-2 py-2 text-[11px] font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                                      >
                                        {acceptingQuoteId === q.id ? 'Accepting…' : 'Accept Proposal'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-xs text-slate-500">
                        No contractor quotations have been submitted for this project yet. Contractors will appear here after sending a quotation.
                      </p>
                    )}
                  </div>
                )}
              </div>}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: MILESTONE TRACKING                                            */}
        {/* All milestones, statuses, contractor progress updates, submitted     */}
        {/* images, comments, inspection results, and approval history           */}
        {/* STRICT CONSTRAINT: Do not display milestone amounts in milestone list*/}
        {/* ==================================================================== */}
        {activeTab === 'milestones' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Construction Milestone Schedule & Verification</h3>
                  <p className="text-xs text-slate-500">
                    Click any milestone stage below to drop down details, inspect contractor work proof photos, and approve stage completion.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExpandAllStages}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={handleCollapseAllStages}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
                  >
                    Collapse All
                  </button>
                  <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                    {completedMilestonesCount} of {totalMilestonesCount} Stages Completed
                  </span>
                </div>
              </div>

              {/* Milestone Dropdown / Accordion Cards List (NO AMOUNTS DISPLAYED IN THIS LIST) */}
              {!hasApprovedProjectPlan ? (
                <div className="p-10 text-center bg-amber-50/60 rounded-2xl border border-amber-200 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">Milestones are locked</h4>
                  <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
                    The contractor&apos;s proposed milestone schedule will appear here after you approve the Project Plan.
                    Review and approve it in the Project Plan tab first.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push(`/homeowner/projects/${project.id}?tab=project_plan`)}
                    className="px-4 py-2 rounded-xl bg-[#136F48] hover:bg-[#0f5939] text-white text-xs font-bold transition"
                  >
                    Review Project Plan
                  </button>
                </div>
              ) : project.status === 'project_planning' || milestones.length === 0 ? (
                project.status === 'project_planning' ? (
                  <div className="space-y-6">
                    {/* Homeowner Plan Approval Card when plan is submitted */}
                    {projectPlan?.status === 'submitted' ? (
                      <div className="bg-white rounded-2xl border-2 border-emerald-500/60 shadow-md p-6 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                                Submitted for Your Review
                              </span>
                              <span className="text-xs font-mono font-bold text-slate-500">
                                Total Homeowner Cost: {formatCurrency(homeownerTotalAmount || totalContractAmount)}
                              </span>
                            </div>
                            <h4 className="font-extrabold text-slate-900 text-lg">Proposed Project Plan & Milestone Schedule</h4>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {contractor?.business_name || 'Contractor'} has submitted this milestone plan. Review the scope, timeline, and allocation before granting approval.
                            </p>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPlanRevisionModalOpen(true)}
                              className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                              <span>Request Revision</span>
                            </button>
                            <button
                              type="button"
                              disabled={approvingPlan}
                              onClick={handleApproveProjectPlan}
                              className="px-5 py-2.5 rounded-xl bg-[#136F48] hover:bg-[#0f5939] disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>{approvingPlan ? 'Approving...' : 'Approve Project Plan'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Proposed Milestone Breakdown Table */}
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                                <th className="py-2.5 px-3 w-12 text-center">No.</th>
                                <th className="py-2.5 px-3 min-w-[180px]">Milestone Name</th>
                                <th className="py-2.5 px-3 min-w-[220px]">Description</th>
                                <th className="py-2.5 px-3 w-32">Allocation</th>
                                <th className="py-2.5 px-3 w-28">Start Date</th>
                                <th className="py-2.5 px-3 w-28">End Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {milestones.map((m) => (
                                <tr key={m.id} className="hover:bg-slate-50/50">
                                  <td className="py-3 px-3 text-center font-bold text-slate-500">{m.seq}</td>
                                  <td className="py-3 px-3 font-bold text-slate-900">{m.name}</td>
                                  <td className="py-3 px-3 text-slate-600">{m.description || 'Stage execution works'}</td>
                                  <td className="py-3 px-3 font-mono font-bold text-slate-900">
                                    {formatCurrency(m.homeowner_total_amount ?? m.amount)}
                                    {Number(m.platform_commission_amount ?? 0) > 0 && (
                                      <span className="mt-1 block font-sans text-[10px] font-normal text-slate-500">
                                        Includes {formatCurrency(m.platform_commission_amount ?? 0)} commission
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-slate-600">{m.start_date ? formatDate(m.start_date) : '—'}</td>
                                  <td className="py-3 px-3 text-slate-600">{m.end_date ? formatDate(m.end_date) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Comments & Discussion for Plan */}
                        <div className="pt-2 space-y-3">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-slate-600" />
                            <h5 className="font-bold text-slate-800 text-xs">Plan Discussion & Feedback</h5>
                          </div>

                          <div className="space-y-3 max-h-56 overflow-y-auto rounded-xl bg-slate-50 p-3">
                            {planComments.length === 0 ? (
                              <p className="text-[11px] text-slate-400 italic">No comments yet. You can leave feedback or request date adjustments below.</p>
                            ) : (
                              planComments.map((c) => (
                                <div key={c.id} className={`flex ${c.author_role === 'homeowner' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
                                    c.author_role === 'homeowner'
                                      ? 'rounded-br-md bg-emerald-700 text-white'
                                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                                  }`}>
                                    <div className={`mb-1 flex items-center justify-between gap-4 text-[10px] ${
                                      c.author_role === 'homeowner' ? 'text-emerald-100' : 'text-slate-500'
                                    }`}>
                                      <strong className="font-semibold">{c.author_name}</strong>
                                      <time dateTime={c.created_at}>
                                        {new Date(c.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                      </time>
                                    </div>
                                    <p className="whitespace-pre-wrap break-words">{c.message}</p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          <form onSubmit={handlePostPlanComment} className="flex gap-2 pt-1">
                            <input
                              type="text"
                              value={newPlanComment}
                              onChange={(e) => setNewPlanComment(e.target.value)}
                              placeholder="Type a message or adjustment request for the contractor..."
                              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:border-[#136F48] outline-hidden"
                            />
                            <button
                              type="submit"
                              disabled={postingPlanComment || !newPlanComment.trim()}
                              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition"
                            >
                              Send
                            </button>
                          </form>
                        </div>
                      </div>
                    ) : projectPlan?.status === 'revision_requested' ? (
                      <div className="p-8 sm:p-10 text-center bg-amber-50/50 rounded-2xl border border-amber-200 space-y-4">
                        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
                          <MessageSquare className="w-7 h-7 text-amber-700" />
                        </div>
                        <div className="space-y-1">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                            Revision Requested by You
                          </span>
                          <h4 className="font-bold text-slate-900 text-base">Awaiting Contractor Resubmission</h4>
                        </div>
                        <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
                          Your revision request: <strong className="text-slate-800">"{projectPlan.revision_notes || 'Adjust milestone timeline'}"</strong>.
                          The contractor has been notified and is updating their spreadsheet schedule.
                        </p>
                      </div>
                    ) : (
                      <div className="p-8 sm:p-10 text-center bg-indigo-50/50 rounded-2xl border border-indigo-200/90 space-y-4">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto shadow-xs">
                          <Clock className="w-7 h-7 animate-pulse text-indigo-700" />
                        </div>
                        <div className="space-y-1">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Project Planning Phase Active
                          </span>
                          <h4 className="font-bold text-slate-900 text-base">Contractor Milestone Schedule in Formulation</h4>
                        </div>
                        <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
                          Contractor <strong className="text-slate-900">{contractor?.business_name || 'Assigned Builder'}</strong> accepted your proposal. Your total project cost is <strong className="text-slate-900 font-mono">{formatCurrency(homeownerTotalAmount)}</strong>. The contractor is currently drafting the construction phase deliverables, target dates, and milestone payment schedule.
                        </p>
                        <div className="max-w-md mx-auto p-4 bg-white rounded-xl border border-indigo-100 text-left text-xs text-indigo-950 space-y-2.5 shadow-2xs">
                          <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                            <span>What happens next?</span>
                          </div>
                          <ul className="space-y-2 text-slate-600 text-[11px] list-disc list-inside">
                            <li>Contractor structures the construction stages and sets percentage allocations (totaling 100%).</li>
                            <li>Contractor submits the proposed project plan for your review.</li>
                            <li>You can approve the plan or request revisions with specific notes.</li>
                            <li>Upon your approval, Stage 1 activates and construction officially starts!</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-12 text-center text-xs bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                      <Layers className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm">No Construction Milestones Scheduled Yet</h4>
                    <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
                      This project is currently open for contractor bidding. Sequential construction milestones, phase percentages, and escrow payment schedules will be established once you award a contractor quotation.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-3.5">
                  {milestones.map((m) => {
                    const isPaid = m.status === 'paid';
                    const isProofSubmitted = m.status === 'proof_submitted';
                    const isInProgress = m.status === 'in_progress';
                    const isDisputed = m.status === 'disputed';
                    const isLocked = m.status === 'locked';
                    const activeDispute = isDisputed
                      ? disputes.find(dispute =>
                        dispute.milestone_id === m.id &&
                        ['open', 'need_more_proof'].includes(dispute.status)
                      )
                      : undefined;
                    const cleanTitle = cleanMilestoneTitle(m.name);
                    // Locked stages strictly have ZERO images/proofs!
                    // Active/completed stages display the contractor's uploaded proofs
                    const proofs = isLocked ? [] : (m.proofs || []);
                    const visibleProofs = proofs.filter(proof => Boolean(proof.file_path));
                    const latestProofNote = [...proofs]
                      .sort((left, right) => right.created_at.localeCompare(left.created_at))
                      .find(proof => proof.note?.trim())?.note?.trim();
                    const contractorNote = m.contractor_update?.trim() || latestProofNote;

                    // Determine if this dropdown is open: active/in-progress/disputed default open, locked default closed
                    const defaultOpen = !isLocked && (m.seq === 1 || isInProgress || isProofSubmitted || isDisputed);
                    const isExpanded = expandedStages[m.id] !== undefined ? expandedStages[m.id] : defaultOpen;

                    return (
                      <div
                        key={m.id}
                        className={`rounded-2xl border transition-all overflow-hidden ${isPaid
                          ? 'bg-white border-emerald-200 shadow-2xs'
                          : isProofSubmitted
                            ? 'bg-white border-indigo-200 shadow-xs ring-1 ring-indigo-50'
                            : isDisputed
                              ? 'bg-white border-amber-300 shadow-xs ring-1 ring-amber-50'
                              : isInProgress
                                ? 'bg-white border-blue-300 shadow-xs ring-1 ring-blue-50'
                                : 'bg-slate-50/70 border-slate-200'
                          }`}
                      >
                        {/* CLICKABLE DROPDOWN / ACCORDION HEADER */}
                        <button
                          type="button"
                          onClick={() => toggleStage(m.id)}
                          className="w-full p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-left hover:bg-slate-50/80 transition cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3.5 flex-wrap">
                            <span className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${isPaid ? 'bg-emerald-100 text-emerald-800' :
                              isProofSubmitted ? 'bg-indigo-100 text-indigo-800' :
                                isDisputed ? 'bg-amber-100 text-amber-800' :
                                  isInProgress ? 'bg-blue-100 text-blue-800' :
                                    'bg-slate-200 text-slate-500'
                              }`}>
                              {isLocked ? <Lock className="w-3.5 h-3.5" /> : m.seq}
                            </span>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                                  Stage {m.seq}: {cleanTitle}
                                </h4>
                                <span className="text-xs text-slate-500 font-semibold">
                                  ({m.percent}% of contract)
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {isPaid ? 'Stage approved & funds released' :
                                  isProofSubmitted ? loadingProofMilestones[m.id]
                                    ? 'Loading inspection photos…'
                                    : `${proofs.length} inspection photo(s) submitted for your review` :
                                    isDisputed ? 'Milestone contested in dispute resolution' :
                                      isInProgress ? 'Phase currently under active construction on-site' :
                                        'Scheduled phase (locked)'}
                              </p>
                            </div>
                          </div>

                          {/* Badges & Dropdown Chevron */}
                          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                            {visibleProofs.length > 0 && (
                              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <Camera className="w-3 h-3 text-blue-600" />
                            <span>{visibleProofs.length} Photo{visibleProofs.length > 1 ? 's' : ''}</span>
                              </span>
                            )}

                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${isPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              isProofSubmitted ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                                isDisputed ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                  isInProgress ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                    'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}>
                              {isPaid
                                ? 'Approved'
                                : isProofSubmitted
                                  ? 'Proof Awaiting Review'
                                  : isLocked
                                    ? 'Locked'
                                    : removeUnderscore(m.status)}
                            </span>

                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-slate-200 transition">
                              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                        </button>

                        {/* DROPDOWN / ACCORDION BODY: Revealed only when dropped down */}
                        {isExpanded && (
                          <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
                            {/* CASE 1: LOCKED MILESTONES (STRICTLY NO IMAGES) */}
                            {isLocked && (
                              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                                  <Lock className="w-4 h-4" />
                                </div>
                                <div className="space-y-1">
                                  <div className="font-bold text-slate-800">Stage Locked - Scheduled Phase</div>
                                  <p className="text-slate-500 leading-relaxed">
                                    This phase is scheduled sequentially and is currently locked. It will automatically unlock once preceding milestone stages are inspected and completed.
                                  </p>
                                  <p className="text-slate-400 text-[11px]">
                                    No site images yet. The contractor will upload inspection photos and engineering slump/pressure test documents when this stage begins.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* CASE 2: IN PROGRESS WITHOUT UPLOADED PROOFS YET */}
                            {isInProgress && proofs.length === 0 && (
                              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 text-xs text-blue-900 flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                                  <Clock className="w-4 h-4" />
                                </div>
                                <div className="space-y-1">
                                  <div className="font-bold text-blue-950">Active Construction Phase</div>
                                  <p className="text-blue-800 leading-relaxed">
                                    Contractor is actively executing work on-site for this milestone.
                                  </p>
                                  <p className="text-blue-600 text-[11px]">
                                    Work proof photos, site progress updates, and structural inspection documents will appear here once submitted by the contractor so you can inspect and mark this milestone complete.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* CASE 3: UPLOADED WORK PROOF & INSPECTION PHOTOS */}
                            {visibleProofs.length > 0 && (
                              <div className="space-y-3">
                                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Submitted Work Proof & Inspection Results ({visibleProofs.length} Photos)</span>
                                  </span>
                                  <span className="text-[11px] text-slate-400">Click photo to zoom</span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                  {visibleProofs.map((proof) => (
                                    <div
                                      key={proof.id}
                                      className="max-w-[240px] rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden text-xs"
                                    >
                                      {proof.file_path && (
                                        <div
                                          onClick={() => setViewingZoomPhoto({ url: proof.file_path, caption: proof.note || `Stage ${m.seq} inspection proof` })}
                                          className="relative overflow-hidden border-b border-slate-200 aspect-square cursor-pointer group bg-slate-900"
                                        >
                                          <img
                                            src={proof.file_path}
                                            alt={proof.note || 'Work Proof'}
                                            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-200"
                                          />
                                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1">
                                            <Eye className="w-4 h-4" />
                                            <span>Click to Zoom</span>
                                          </div>
                                        </div>
                                      )}

                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {contractorNote && (
                              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950">
                                <div className="font-bold text-blue-800 mb-1">Contractor Note</div>
                                <p className="leading-relaxed whitespace-pre-wrap">{contractorNote}</p>
                              </div>
                            )}

                            {/* Dispute Alert Information */}
                            {isDisputed && (
                              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                                <div className="flex items-center gap-2 font-bold text-amber-800">
                                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                  <span>Milestone Contested in Active Dispute Mediation</span>
                                </div>
                                <p className="text-[11px] text-amber-800/90 leading-relaxed">
                                  Escrow release for this stage is temporarily frozen pending contractor rectification and structural verification.
                                </p>
                              </div>
                            )}

                            {/* Action Buttons for this Milestone - STRICTLY NO PAYMENT BUTTON IN MILESTONES */}
                            <div className="pt-2 flex items-center justify-end gap-2.5 flex-wrap">
                              {isDisputed && (
                                <button
                                  type="button"
                                  disabled={!activeDispute || visibleProofs.length === 0 || approvingMilestoneId === m.id}
                                  onClick={() => activeDispute && void handleResolveDispute(activeDispute)}
                                  title={!activeDispute || visibleProofs.length === 0
                                    ? 'The contractor must submit replacement photos first.'
                                    : 'Approve the contractor fix and release this milestone.'}
                                  className="px-4 py-2 rounded-xl bg-[#136F48] hover:bg-[#0f5738] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{approvingMilestoneId === m.id ? 'Approving...' : 'Approve'}</span>
                                </button>
                              )}

                              {isProofSubmitted && (
                                <>
                                  {proofs.length === 0 && (
                                    <div className="w-full p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                                      Contractor must upload at least one milestone image before this stage can be inspected or released.
                                    </div>
                                  )}

                                  {proofs.length > 0 && (
                                    <>
                                  <button
                                    type="button"
                                    onClick={() => setDisputeModalMilestone(m)}
                                    className="px-3.5 py-2 rounded-xl bg-white border border-red-200 hover:bg-red-50 text-red-700 text-xs font-bold transition flex items-center gap-1.5"
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                    <span>Report Defect / Dispute</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setMilestoneToApprove(m)}
                                    className="px-4 py-2 rounded-xl bg-[#136F48] hover:bg-[#0f5738] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Approve and Pay</span>
                                  </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: PAYMENT LOGS                                                  */}
        {/* All payment transactions, dates, amounts, payment methods, proof     */}
        {/* of payment, verification status, and fund-release records           */}
        {/* ==================================================================== */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            {/* Payment Summary Bar */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Escrow Payment History & Audit Logs</h3>
                <p className="text-xs text-slate-500">
                  Traceable bank transfer and e-wallet deposit slips verified by administration.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Pay Milestone Escrow</span>
                </button>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Transaction Ref</th>
                        <th className="py-3 px-4">Payment Date</th>
                        <th className="py-3 px-4">Amount (₱)</th>
                        <th className="py-3 px-4">Payment Method</th>
                        <th className="py-3 px-4">Proof of Payment</th>
                        <th className="py-3 px-4">Verification Status</th>
                        <th className="py-3 px-4">Fund-Release Record</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {projectTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center">
                            <CreditCard className="w-8 h-8 text-slate-300 mx-auto" />
                            <p className="mt-3 font-semibold text-slate-700">No payment transaction records submitted yet.</p>
                            <p className="mx-auto mt-1 max-w-sm text-slate-400">
                              When you make an external bank or e-wallet transfer, click &quot;Pay Milestone Escrow&quot; to upload your deposit slip.
                            </p>
                            <button
                              type="button"
                              onClick={() => setIsPaymentModalOpen(true)}
                              className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition"
                            >
                              Pay First Milestone Escrow
                            </button>
                          </td>
                        </tr>
                      ) : projectTransactions.map((tx) => {
                        const isPending = ['PENDING_VERIFICATION', 'PENDING', 'CREATED'].includes(tx.payment_status);
                        const isSucceeded = tx.payment_status === 'PAID' || tx.payment_status === 'SUCCEEDED';
                        const isRejected = tx.payment_status === 'REJECTED';
                        const amount = (tx.amount_centavos || 0) / 100;

                        return (
                          <tr key={tx.id || tx.transaction_ref} className="hover:bg-slate-50/70">
                            {/* 1. Transaction Ref */}
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              <div>{tx.transaction_ref}</div>
                              {tx.provider_tx_ref && (
                                <div className="text-[10px] text-slate-400 font-normal">
                                  Trace Ref: {tx.provider_tx_ref}
                                </div>
                              )}
                            </td>

                            {/* 2. Payment Date */}
                            <td className="py-3.5 px-4 text-slate-600">
                              {formatDate(tx.created_at)}
                            </td>

                            {/* 3. Amount */}
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {formatCurrency(amount)}
                            </td>

                            {/* 4. Payment Method */}
                            <td className="py-3.5 px-4">
                              <span className="font-semibold text-slate-800 block">
                                {tx.provider || tx.payment_method}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Payer: {tx.sender_name || 'Homeowner'}
                              </span>
                            </td>

                            {/* 5. Proof of Payment (Clickable View Slip modal) */}
                            <td className="py-3.5 px-4">
                              <button
                                type="button"
                                onClick={() => setViewingSlipTx(tx)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs transition"
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-600" />
                                <span>View Slip</span>
                              </button>
                            </td>

                            {/* 6. Verification Status */}
                            <td className="py-3.5 px-4">
                              {isSucceeded && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Verified & Credited
                                </span>
                              )}
                              {isPending && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  Pending Admin Audit
                                </span>
                              )}
                              {isRejected && (
                                <div>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                                    <AlertCircle className="w-3 h-3 text-red-600" />
                                    Rejected
                                  </span>
                                  {tx.rejection_reason && (
                                    <p className="mt-1 max-w-48 text-[10px] text-red-700">{tx.rejection_reason}</p>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* 7. Fund-Release Record */}
                            <td className="py-3.5 px-4 text-xs">
                              {isSucceeded ? (
                                <span className="font-semibold text-emerald-700 flex items-center gap-1">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                  Secured in Escrow Vault
                                </span>
                              ) : isPending ? (
                                <span className="text-slate-400">Awaiting clearance</span>
                              ) : isRejected ? (
                                <span className="text-red-500 font-medium">Payment rejected — resubmit after correction</span>
                              ) : (
                                <span className="text-slate-500 font-medium">Not credited to escrow</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
              </div>
            </div>
          </div>
        )}

        {/* Homeowner dispute list and filing form */}
        {activeTab === 'disputes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <h3 className="font-bold text-slate-900">Disputes</h3>
                <p className="mt-1 text-xs text-slate-500">{disputes.length} dispute{disputes.length === 1 ? '' : 's'}</p>
              </div>
              <button
                type="button"
                disabled={milestones.length === 0}
                onClick={() => {
                  const target = milestones.find(m => m.status === 'proof_submitted' || m.status === 'in_progress') || milestones[0];
                  setDisputeModalMilestone(target);
                }}
                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                File dispute
              </button>
            </div>

            {disputes.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No disputes have been filed for this project.
              </div>
            ) : (
              <div className="space-y-3">
                {disputes.map((d) => {
                  const targetMilestone = milestones.find(m => m.id === d.milestone_id);
                  const cleanMilestone = targetMilestone ? cleanMilestoneTitle(targetMilestone.name) : 'Milestone unavailable';
                  const stageSeq = targetMilestone?.seq;
                  const isResolved = d.status === 'resolved_paid' || d.status === 'resolved_refund' || d.status === 'resolved_split' || d.status === 'resolved_fix';

                  return (
                    <article key={d.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-semibold text-slate-900">
                          {stageSeq == null ? cleanMilestone : `Stage ${stageSeq}: ${cleanMilestone}`}
                        </h4>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                          isResolved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isResolved ? 'Resolved' : 'Open'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">Filed {formatDate(d.created_at)}</p>
                      <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{d.reason}</p>
                      {d.contractor_fix_note && (
                        <p className="mt-3 text-xs text-slate-600">
                          <span className="font-semibold">Contractor update:</span> {d.contractor_fix_note}
                        </p>
                      )}
                      {!isResolved && d.contractor_fix_status === 'fixed' && (
                        <button
                          type="button"
                          disabled={approvingMilestoneId === d.milestone_id}
                          onClick={() => void handleResolveDispute(d)}
                          className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          {approvingMilestoneId === d.milestone_id ? 'Approving...' : 'Approve Fix & Release'}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* MODAL 1: PAY MILESTONE ESCROW                                       */}
        {/* ==================================================================== */}
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
                <div>
                  <div className="flex items-center gap-1.5 text-blue-600 font-bold text-[10px] uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Official Escrow Safekeeping Transfer</span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">Pay Milestone Escrow</h3>
                  <p className="text-xs text-slate-500 truncate">{project.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
                {/* Balance strip */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                      {isContractAccepted ? 'Agreed Cost' : 'Estimated Project Cost'}
                    </span>
                    <span className="text-xs font-bold font-mono text-slate-900">{formatCurrency(displayCostAmount)}</span>
                  </div>
                  <div className="border-x border-slate-200">
                    <span className="text-[10px] font-semibold text-emerald-600 uppercase block">Released</span>
                    <span className="text-xs font-bold font-mono text-emerald-600">{formatCurrency(fundsReleasedTotal)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-blue-600 uppercase block">
                      {isContractAccepted ? 'Available to Pay' : 'Estimated Project Cost'}
                    </span>
                    <span className="text-xs font-bold font-mono text-blue-600">
                      {formatCurrency(isContractAccepted ? availablePaymentBalance : displayCostAmount)}
                    </span>
                  </div>
                </div>

                {/* Milestone Target Context */}
                <div className="p-2.5 rounded-xl bg-slate-100/80 border border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Paying Towards:</span>
                  <span className="font-bold text-slate-800">
                    {selectedMilestoneForPayment
                      ? `Stage ${selectedMilestoneForPayment.seq}: ${cleanMilestoneTitle(selectedMilestoneForPayment.name)}`
                      : (defaultPaymentMilestone
                        ? `Stage ${defaultPaymentMilestone.seq}: ${cleanMilestoneTitle(defaultPaymentMilestone.name)}`
                        : 'Platform Neutral Escrow Vault')}
                  </span>
                </div>

                {/* Amount Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">Payment Amount (₱) *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 font-mono">₱</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      placeholder="Enter amount to pay"
                      value={formatNumberInput(proofForm.customPaymentAmount)}
                      onChange={(e) => setProofForm({ ...proofForm, customPaymentAmount: formatNumberInput(e.target.value) })}
                      className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  {pendingPaymentTotal > 0 && (
                    <p className="text-[10px] text-amber-700">
                      {formatCurrency(pendingPaymentTotal)} is currently awaiting verification and is excluded from the available balance.
                    </p>
                  )}
                </div>

                {/* Payment Category Pills */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">Select Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {configuredMethods.map(method => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedMethodId(method.id)}
                        className={`p-2.5 rounded-xl border text-left transition font-semibold ${selectedMethodId === method.id
                          ? 'bg-blue-50 border-blue-600 text-blue-900 ring-1 ring-blue-500 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        {method.display_name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Official Escrow Deposit Account Details Card */}
                {(() => {
                  const activeMethod = configuredMethods.find(m => m.id === selectedMethodId);
                  return activeMethod ? (
                    <div className="p-3.5 rounded-xl bg-blue-50/90 border border-blue-200 space-y-2.5 text-xs animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-950 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-blue-600" />
                          <span>Official Platform Escrow Account Details</span>
                        </span>
                        <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-md bg-blue-200/80 text-blue-800">
                          Neutral Vault
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-blue-200/70">
                        <div>
                          <span className="text-[10px] text-slate-500 font-semibold block uppercase">Bank / Provider</span>
                          <span className="font-bold text-slate-900 truncate block">
                            {activeMethod.bank_or_provider_name}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-semibold block uppercase">Account Name</span>
                          <span className="font-bold text-slate-900 truncate block">
                            {activeMethod.account_holder_name}
                          </span>
                        </div>
                      </div>

                      {/* Prominent Account Number / Mobile Number with Copy Button */}
                      <div className="p-2.5 rounded-xl bg-white border border-blue-200 flex items-center justify-between gap-3 shadow-2xs">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                            {activeMethod.category === 'ewallet' || activeMethod.category === 'qr_ph'
                              ? 'Wallet / QR Account'
                              : activeMethod.category === 'bank_transfer'
                                ? 'Bank Account Number'
                                : 'Account / Payment Identifier'}
                          </span>
                          <span className="font-mono text-base font-extrabold text-blue-900 tracking-wider select-all">
                            {activeMethod.account_number_or_id}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(activeMethod.account_number_or_id, 'payment-acc-num')}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition shrink-0 shadow-2xs"
                          title="Copy account number to clipboard"
                        >
                          {copiedId === 'payment-acc-num' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-white" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy #</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Instructions */}
                      <div className="text-[11px] text-blue-900 leading-relaxed bg-white/70 p-2.5 rounded-lg border border-blue-100">
                        <span className="font-bold text-blue-950 block mb-0.5">Transfer Instructions:</span>
                        <p className="whitespace-pre-line text-slate-600">
                          {activeMethod.payment_instructions}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                      No active payment methods are available.
                    </div>
                  );
                })()}

                {/* Sender Name & Ref */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Sender Name</label>
                    <input
                      type="text"
                      placeholder="Payment sender name"
                      value={proofForm.senderName}
                      onChange={(e) => setProofForm({ ...proofForm, senderName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Bank / Trace Ref #</label>
                    <input
                      type="text"
                      placeholder="e.g. 104928192"
                      value={proofForm.transactionRef}
                      onChange={(e) => setProofForm({ ...proofForm, transactionRef: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Upload Proof (Fully Functional with Gallery & Camera Options) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700">
                      Deposit Slip / Payment Receipt Photo *
                    </label>
                    <span className="text-[10px] text-slate-400">PNG, JPG automatically optimized</span>
                  </div>

                  {/* Hidden File Inputs for Gallery and Direct Camera */}
                  <input
                    ref={paymentSlipInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePaymentSlipSelect}
                  />
                  <input
                    ref={paymentCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePaymentSlipSelect}
                  />

                  {proofForm.proofFileUrl ? (
                    /* Uploaded Thumbnail Preview */
                    <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50/60 flex items-center justify-between gap-3 animate-in fade-in duration-150">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          onClick={() => setViewingZoomPhoto({ url: proofForm.proofFileUrl, caption: proofForm.proofFileName })}
                          className="w-14 h-14 rounded-lg bg-slate-900 border border-emerald-400 overflow-hidden relative cursor-pointer group shrink-0"
                          title="Click to preview slip"
                        >
                          <img
                            src={proofForm.proofFileUrl}
                            alt="Deposit slip preview"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                            <Eye className="w-3.5 h-3.5" />
                          </div>
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-1 text-emerald-800 font-bold text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Receipt Photo Attached</span>
                          </div>
                          <div className="text-[11px] text-slate-600 truncate mt-0.5">
                            {proofForm.proofFileName || 'Official_Deposit_Receipt.jpg'}
                          </div>
                          <div className="text-[10px] text-emerald-700 font-medium">
                            Ready for platform escrow verification
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => paymentSlipInputRef.current?.click()}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 transition"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={() => setProofForm(prev => ({ ...prev, proofFileUrl: '', proofFileName: '' }))}
                          className="p-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 transition"
                          title="Remove attached photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Dropzone & Direct Upload Options */
                    <div className="space-y-2">
                      <div
                        onClick={() => paymentSlipInputRef.current?.click()}
                        className="border border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-4 text-center bg-slate-50 hover:bg-blue-50/40 transition cursor-pointer flex flex-col items-center gap-1.5 group"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition">
                          <Upload className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-blue-700">Click to upload deposit slip / receipt</span>
                        <span className="text-[10px] text-slate-400">PNG, JPG up to 10MB (automatically optimized)</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => paymentSlipInputRef.current?.click()}
                          className="flex-1 py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                        >
                          <Upload className="w-3.5 h-3.5 text-slate-500" />
                          <span>Choose from Gallery</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => paymentCameraInputRef.current?.click()}
                          className="flex-1 py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                        >
                          <Camera className="w-3.5 h-3.5 text-slate-500" />
                          <span>Use Camera</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Neutral Escrow Safety Assurance */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-[11px] text-slate-600">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Escrow Protection:</strong> Funds deposited are held securely in platform safekeeping. No money is released to the builder until you inspect the milestone work proof and mark it approved.
                  </p>
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingPayment}
                  onClick={handleExecuteProofSubmission}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition flex items-center gap-1.5 shadow-xs text-xs disabled:opacity-50"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{processingPayment ? 'Submitting...' : 'Submit Milestone Payment Proof'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* MODAL 2: VIEW PAYMENT SLIP MODAL                                    */}
        {/* ==================================================================== */}
        {viewingSlipTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Official Deposit Slip Verification</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingSlipTx(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-3/4 flex items-center justify-center">
                  {viewingSlipTx.proof_file_url ? (
                    <img src={viewingSlipTx.proof_file_url} alt="Deposit Receipt" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-slate-500">No payment proof attached.</span>
                  )}
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ref Code:</span>
                    <strong className="font-mono text-slate-900">{viewingSlipTx.transaction_ref}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Amount:</span>
                    <strong className="font-mono text-slate-900">{formatCurrency((viewingSlipTx.amount_centavos || 0) / 100)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Channel:</span>
                    <span>{viewingSlipTx.provider || viewingSlipTx.payment_method}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Trace Ref:</span>
                    <span className="font-mono">{viewingSlipTx.provider_tx_ref || '—'}</span>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setViewingSlipTx(null)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* MODAL 3: MILESTONE INSPECTION & PROGRESS PAYMENT (MATCHING IMAGE 4)  */}
        {/* ==================================================================== */}
        {milestoneToApprove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-5 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto max-h-[94vh] flex flex-col">
              
              {/* Header Bar */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMilestoneToApprove(null)}
                    className="p-1.5 rounded-xl hover:bg-slate-200/60 text-slate-500 transition flex items-center gap-1 text-xs font-semibold"
                  >
                    <ArrowLeft className="w-4 h-4 text-[#136F48]" />
                    <span>Back to Project</span>
                  </button>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight">
                      Milestone {milestoneToApprove.seq}: {cleanMilestoneTitle(milestoneToApprove.name)}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      Awaiting Homeowner Approval
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMilestoneToApprove(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Inspection Modal Body: 2 Columns Matching Image 4 */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column (8 cols): Progress Report, Photo Gallery, Sign-off & Escrow Notice */}
                  <div className="lg:col-span-8 space-y-5">
                    
                    {/* Contractor Progress Report Card */}
                    <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#136F48] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                            <HardHat className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 text-xs block">
                              {contractor?.business_name || 'Contractor'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Site Progress Inspection Submission • Verified PCAB Contractor
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {milestoneToApprove.proof_submitted_at ? formatDate(milestoneToApprove.proof_submitted_at) : 'Submission date unavailable'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 leading-relaxed bg-white p-3.5 rounded-xl border border-slate-200/80">
                        <strong className="block text-slate-900 font-bold mb-1">Contractor Progress Note:</strong>
                        {milestoneToApprove.proofs?.find((proof: MilestoneProof) => proof.note)?.note || 'No contractor progress note has been submitted.'}
                      </div>

                      {/* 12 Photo Evidence Gallery Matching Image 4 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                          <span className="flex items-center gap-1.5">
                            <Camera className="w-4 h-4 text-[#136F48]" />
                            Photo Evidence Gallery ({milestoneToApprove.proofs?.filter(photo => Boolean(photo.file_path)).length || 0} photos)
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">Click any thumbnail to zoom</span>
                        </div>

                        {(milestoneToApprove.proofs || []).some(photo => Boolean(photo.file_path)) ? (
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {(milestoneToApprove.proofs || []).filter(photo => Boolean(photo.file_path)).map((photo: MilestoneProof) => (
                            <div
                              key={photo.id}
                              onClick={() => setViewingZoomPhoto({ url: photo.file_path, caption: photo.note || `Milestone ${milestoneToApprove.seq}` })}
                              className="relative aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-200 cursor-pointer group shadow-2xs"
                            >
                              <img
                                src={photo.file_path}
                                alt={photo.note || `Milestone ${milestoneToApprove.seq} proof`}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye className="w-4 h-4" />
                              </div>
                            </div>
                          ))}
                          </div>
                        ) : (
                          <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                            No photo evidence has been submitted for this milestone.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Secure Escrow Protection Banner Matching Image 4 */}
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#136F48] text-white flex items-center justify-center shrink-0 shadow-xs">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          <span>Contractor milestone:</span>
                          <span className="font-mono text-[#136F48] font-black text-sm">
                            {formatCurrency(milestoneToApprove.amount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-emerald-200 pt-1 text-xs font-bold text-emerald-950">
                          <span>Total homeowner milestone:</span>
                          <strong>{formatCurrency(milestoneToApprove.homeowner_total_amount ?? milestoneToApprove.amount)}</strong>
                        </div>
                        <p className="text-[11px] text-emerald-900 leading-relaxed">
                          Review the submitted work before continuing. If payment is due, submit your deposit for verification. Once verified, use this button to approve the milestone and release its escrow.
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons Matching Image 4 */}
                    <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        disabled={approvingMilestoneId === milestoneToApprove.id}
                        onClick={() => milestonePaymentDue > 0
                          ? handleOpenMilestonePayment(milestoneToApprove)
                          : handleApproveMilestone(milestoneToApprove)}
                        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#136F48] hover:bg-[#0f5738] text-white font-extrabold text-xs shadow-md shadow-emerald-900/20 transition-all hover:scale-102 flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {milestonePaymentDue > 0
                          ? <CreditCard className="w-4 h-4" />
                          : <CheckCircle2 className="w-4 h-4" />}
                        <span>
                          {approvingMilestoneId === milestoneToApprove.id
                            ? 'Approving Milestone...'
                            : milestonePaymentDue > 0
                              ? `Pay & Approve Milestone (${formatCurrency(milestonePaymentDue)})`
                              : 'Approve Milestone'}
                        </span>
                      </button>
                    </div>

                  </div>

                  {/* Right Column (4 cols): Completion Circular Meter, Payment Summary & Roadmap */}
                  <div className="lg:col-span-4 space-y-5">
                    
                    {/* Completion Ring Card Matching Image 4 */}
                    <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-5 text-center space-y-3">
                      <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Project Progress
                      </div>
                      
                      {/* Circular Meter */}
                      <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-slate-200"
                            strokeWidth="3.5"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className="text-[#136F48]"
                            strokeDasharray={`${completionPercentage}, 100`}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <div className="absolute flex flex-col items-center">
                          <span className="text-2xl font-black text-slate-900">{completionPercentage}%</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Complete</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500">
                        {paidMilestones.length} of {totalMilestonesCount} milestones approved.
                      </p>
                    </div>

                    {/* Payment Summary */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5 text-xs">
                      <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider pb-1 border-b border-slate-100">
                        Payment Summary
                      </h4>
                      <div className="flex justify-between text-slate-600">
                        <span>Milestone total:</span>
                        <strong className="font-mono text-slate-900">{formatCurrency(milestoneToApprove.homeowner_total_amount ?? milestoneToApprove.amount)}</strong>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Released to date:</span>
                        <strong className="text-emerald-700">{formatCurrency(fundsReleasedTotal)}</strong>
                      </div>
                      <div className="flex justify-between text-slate-800 font-bold pt-1.5 border-t border-slate-100">
                        <span>Remaining contract balance:</span>
                        <span className="font-mono text-[#136F48]">{formatCurrency(remainingBalanceToPay)}</span>
                      </div>
                    </div>

                    {/* Milestone Roadmap Sequence */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 text-xs">
                      <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider pb-1 border-b border-slate-100">
                        Milestone Schedule
                      </h4>

                      <div className="space-y-2.5">
                        {milestones.map((ms) => {
                          const isCurrent = ms.id === milestoneToApprove.id;
                          const isDone = ms.status === 'paid';
                          return (
                            <div
                              key={ms.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between text-[11px] ${
                                isCurrent
                                  ? 'bg-emerald-50 border-emerald-300 font-bold text-[#136F48]'
                                  : isDone
                                  ? 'bg-slate-50 border-slate-200 text-slate-500'
                                  : 'bg-white border-slate-100 text-slate-400'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                  isDone ? 'bg-emerald-100 text-[#136F48]' : isCurrent ? 'bg-[#136F48] text-white' : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {isDone ? '✓' : ms.seq}
                                </span>
                                <span className="truncate max-w-[130px]">{cleanMilestoneTitle(ms.name)}</span>
                              </div>
                              <span className="font-semibold text-[10px]">
                                {isDone ? 'Paid' : isCurrent ? 'In Review' : 'Locked'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                </div>
              </div>

            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* MODAL 4: RAISE DISPUTE / DEFECT CLAIM                               */}
        {/* ==================================================================== */}
        {disputeModalMilestone && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-slate-900 text-base">File Milestone Dispute / Defect Claim</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDisputeModalMilestone(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-600 space-y-3">
                <p>
                  Select the affected milestone. The selected stage will be frozen and this complaint will be sent to the platform administrator.
                </p>

                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">Affected Milestone *</label>
                  <select
                    value={disputeModalMilestone.id}
                    onChange={(e) => {
                      const selected = milestones.find(milestone => milestone.id === e.target.value);
                      if (selected) setDisputeModalMilestone(selected);
                    }}
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                  >
                    {milestones
                      .filter(milestone => milestone.status !== 'locked')
                      .map(milestone => (
                        <option key={milestone.id} value={milestone.id}>
                          Stage {milestone.seq}: {cleanMilestoneTitle(milestone.name)} — {removeUnderscore(milestone.status)}
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    Selected: <strong>Stage {disputeModalMilestone.seq}: {cleanMilestoneTitle(disputeModalMilestone.name)}</strong>
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">Describe Defect or Reason for Non-Approval *</label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Specify the observed defects, structural deviations, or incomplete items on-site..."
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDisputeModalMilestone(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={disputeSubmitting || !disputeReason.trim()}
                  onClick={handleOpenDispute}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{disputeSubmitting ? 'Submitting Dispute...' : 'Submit Claim to Admin'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* MODAL 5: FULL-RESOLUTION PHOTO LIGHTBOX                             */}
        {/* ==================================================================== */}
        {viewingZoomPhoto?.url && (
          <div
            onClick={() => setViewingZoomPhoto(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm cursor-zoom-out"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl space-y-2 p-2"
            >
              <button
                type="button"
                onClick={() => setViewingZoomPhoto(null)}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={viewingZoomPhoto.url}
                alt={viewingZoomPhoto.caption || 'Site Photo'}
                className="w-full max-h-[80vh] object-contain rounded-xl"
              />
              {viewingZoomPhoto.caption && (
                <div className="p-3 text-center text-xs font-semibold text-white/90 bg-slate-950/60 rounded-lg">
                  {viewingZoomPhoto.caption}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* MODAL 6: CONTRACTOR PORTFOLIO SHOWCASE                              */}
        {/* ==================================================================== */}
        {viewingContractorPortfolio && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {viewingContractorPortfolio.contractor.business_name} Portfolio
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Verified residential build portfolio, architectural fenestrations, and structural finishes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingContractorPortfolio(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {viewingContractorPortfolio.items.map((item) => (
                  <div key={item.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    {item.portfolio_images && item.portfolio_images[0] && (
                      <div className="h-44 w-full bg-slate-100 overflow-hidden">
                        <img
                          src={item.portfolio_images[0].file_path}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="p-4 space-y-1.5 text-xs">
                      <div className="flex justify-between items-start">
                        <h5 className="font-bold text-slate-900 text-sm">{item.title}</h5>
                        <span className="text-[10px] text-slate-400 font-medium">{item.year_completed}</span>
                      </div>
                      <p className="text-slate-600 line-clamp-2 leading-relaxed">{item.description}</p>
                      <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                        {item.floor_area_sqm} sq.m • {item.floors} flr • {removeUnderscore(item.house_type)}
                      </div>
                    </div>
                  </div>
                ))}
                {viewingContractorPortfolio.items.length === 0 && (
                  <div className="col-span-full p-8 text-center text-xs text-slate-500">
                    No portfolio projects are available.
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setViewingContractorPortfolio(null)}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
                >
                  Close Showcase
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* MODAL 7: MATERIALS QUOTATION & BILL OF QUANTITIES (BOQ) BREAKDOWN    */}
        {/* ==================================================================== */}
        {viewingMaterialQuote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs sm:p-4">
            <div className="flex max-h-[92dvh] min-h-0 w-full max-w-5xl flex-col space-y-4 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:space-y-5 sm:p-8">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider mb-1">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Official Verified Cost Breakdown</span>
                  </div>
                  <h3 className="text-base font-bold leading-snug text-slate-900 sm:text-xl">
                    Materials Quotation & Bill of Quantities (BOQ)
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Itemized materials, structural rebar, aggregates, MEP systems, architectural finishes, and certified labor.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close cost breakdown"
                  onClick={() => setViewingMaterialQuote(null)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Summary Cards */}
              {(() => {
                const mq = viewingMaterialQuote?.material_quotation as SavedDetailedProposal | null | undefined;
                let items: QuoteDisplayItem[] = [];
                if (mq?.materials || mq?.labor || mq?.equipment || mq?.overhead) {
                  items = [
                    ...(mq.materials || []).map((item, index) => ({
                      id: `material-${index}`,
                      category: 'Material',
                      item_name: item.name,
                      specifications: item.unit,
                      quantity: Number(item.quantity) || 0,
                      unit: item.unit,
                      unit_price: Number(item.unitPrice) || 0,
                      line_total: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
                      supplier: '—',
                    })),
                    ...(mq.labor || []).map((item, index) => ({
                      id: `labor-${index}`,
                      category: 'Labor',
                      item_name: item.position,
                      specifications: `${Number(item.workers) || 0} worker(s) × ${Number(item.days) || 0} day(s)`,
                      quantity: Number(item.workers) || 0,
                      unit: 'worker(s)',
                      unit_price: Number(item.dailyRate) || 0,
                      line_total: (Number(item.workers) || 0) * (Number(item.dailyRate) || 0) * (Number(item.days) || 0),
                      supplier: viewingMaterialQuote?.contractor_profile?.business_name || 'Contractor',
                    })),
                    ...(mq.equipment || []).map((item, index) => ({
                      id: `equipment-${index}`,
                      category: 'Equipment',
                      item_name: item.name,
                      specifications: `${item.arrangement || 'Equipment'} · ${Number(item.duration) || 0} period(s)`,
                      quantity: Number(item.quantity) || 0,
                      unit: 'unit(s)',
                      unit_price: Number(item.rate) || 0,
                      line_total: (Number(item.quantity) || 0) * (Number(item.rate) || 0) * (Number(item.duration) || 0)
                        + (Number(item.fuel) || 0) + (Number(item.maintenance) || 0),
                      supplier: '—',
                    })),
                    ...(mq.overhead || []).map((item, index) => ({
                      id: `overhead-${index}`,
                      category: 'Overhead',
                      item_name: item.name,
                      specifications: item.description,
                      quantity: 1,
                      unit: 'lot',
                      unit_price: Number(item.amount) || 0,
                      line_total: Number(item.amount) || 0,
                      supplier: '—',
                    })),
                    ...(['profit', 'contingency', 'taxes'] as const).flatMap(key => {
                      const amount = Number(mq[key]?.amount) || 0;
                      if (amount <= 0) return [];
                      const labels = {
                        profit: "Contractor's profit",
                        contingency: 'Contingency allowance',
                        taxes: 'Taxes and charges',
                      };
                      return [{
                        id: key,
                        category: 'Additional cost',
                        item_name: labels[key],
                        specifications: 'Included in proposal total',
                        quantity: 1,
                        unit: 'lot',
                        unit_price: amount,
                        line_total: amount,
                        supplier: '—',
                      }];
                    }),
                  ];
                } else if (mq && mq.items && mq.items.length > 0) {
                  items = [
                    ...mq.items.map((it, idx) => ({
                      id: it.code || `mat-${idx + 1}`,
                      category: 'Material',
                      item_name: it.item_name,
                      specifications: it.brand_spec || it.division || 'Standard Spec',
                      quantity: it.quantity,
                      unit: it.unit,
                      unit_price: it.unit_price,
                      line_total: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0) + (Number(it.delivery_cost) || 0),
                      supplier: it.supplier || 'Verified Supplier'
                    })),
                    ...(Number(mq.labor_cost) > 0 ? [{
                      id: 'labor-1',
                      category: 'Labor',
                      item_name: 'Skilled Labor & Construction Crew',
                      specifications: 'Licensed foreman, carpenters, masons, steelmen and MEP specialists',
                      quantity: 1,
                      unit: 'lot',
                      unit_price: Number(mq.labor_cost),
                      line_total: Number(mq.labor_cost),
                      supplier: viewingMaterialQuote.contractor_profile?.business_name || 'Contractor Direct Labor'
                    }] : []),
                    ...(Number(mq.equipment_cost) > 0 ? [{
                      id: 'equip-1',
                      category: 'Equipment',
                      item_name: 'Construction Equipment & Scaffolding',
                      specifications: 'Mixers, vibrators, scaffolding rentals and site tools',
                      quantity: 1,
                      unit: 'lot',
                      unit_price: Number(mq.equipment_cost),
                      line_total: Number(mq.equipment_cost),
                      supplier: 'Equipment Provider'
                    }] : []),
                    ...(Number(mq.logistics_cost) > 0 ? [{
                      id: 'log-1',
                      category: 'Logistics',
                      item_name: 'Hauling & Site Logistics',
                      specifications: 'Staged material delivery, debris hauling and disposal',
                      quantity: 1,
                      unit: 'lot',
                      unit_price: Number(mq.logistics_cost),
                      line_total: Number(mq.logistics_cost),
                      supplier: 'Hauling Services'
                    }] : []),
                    ...(Number(mq.taxes_cost) > 0 ? [{
                      id: 'tax-1',
                      category: 'Permits',
                      item_name: 'Engineering, Supervision & Permits',
                      specifications: 'Sign-and-seal structural engineering, site safety officer',
                      quantity: 1,
                      unit: 'lot',
                      unit_price: Number(mq.taxes_cost),
                      line_total: Number(mq.taxes_cost),
                      supplier: 'Engineering Consulting'
                    }] : [])
                  ];
                } else if ((viewingMaterialQuote as any)?.line_items && (viewingMaterialQuote as any).line_items.length > 0) {
                  items = (viewingMaterialQuote as any).line_items;
                } else {
                  items = [];
                }

                const materialsTotal = mq?.materials_subtotal !== undefined
                  ? Number(mq.materials_subtotal)
                  : items.filter(it => it.category === 'Material').reduce((sum, it) => sum + Number(it.line_total || 0), 0);
                const laborEquipTotal = mq?.operations_subtotal !== undefined
                  ? Number(mq.operations_subtotal)
                  : items.filter(it => it.category !== 'Material').reduce((sum, it) => sum + Number(it.line_total || 0), 0);
                const totalBOQ = viewingMaterialQuote?.price ? Number(viewingMaterialQuote.price) : (materialsTotal + laborEquipTotal);

                return (
                  <>
                    <div className="grid shrink-0 grid-cols-1 gap-3 text-xs md:grid-cols-3">
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Materials Scope Total</span>
                        <span className="text-base font-extrabold font-mono text-slate-900 mt-0.5 block">{formatCurrency(materialsTotal)}</span>
                        <span className="text-[10px] text-slate-400">Cement, steel, aggregates, pipes & tiles</span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Labor & Equipment Total</span>
                        <span className="text-base font-extrabold font-mono text-slate-900 mt-0.5 block">{formatCurrency(laborEquipTotal)}</span>
                        <span className="text-[10px] text-slate-400">Foremen, rebarmen, masons & mixers</span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                        <span className="text-[10px] text-emerald-800 uppercase font-bold block">Grand Quotation Total</span>
                        <span className="text-base font-extrabold font-mono text-emerald-700 mt-0.5 block">{formatCurrency(totalBOQ)}</span>
                        <span className="text-[10px] text-emerald-700/80">{items.length} verified itemized line items</span>
                      </div>
                    </div>

                    <div className="hidden min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 shadow-2xs md:block">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky top-0 z-10">
                          <tr>
                            <th className="py-2.5 px-3 w-10 text-center">#</th>
                            <th className="py-2.5 px-3 w-24">Category</th>
                            <th className="py-2.5 px-3">Item Description & Scope</th>
                            <th className="py-2.5 px-3">Specifications</th>
                            <th className="py-2.5 px-3 text-right">Qty</th>
                            <th className="py-2.5 px-3">Unit</th>
                            <th className="py-2.5 px-3 text-right">Unit Price</th>
                            <th className="py-2.5 px-3 text-right">Line Total</th>
                            <th className="py-2.5 px-3">Supplier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {items.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-slate-50/70 transition">
                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${item.category === 'Labor' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                                  item.category === 'Equipment' ? 'bg-purple-100 text-purple-900 border border-purple-200' :
                                    'bg-blue-50 text-blue-800 border border-blue-200'
                                  }`}>
                                  {item.category || 'Material'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">{item.item_name}</td>
                              <td className="py-2.5 px-3 text-slate-500 text-[11px]">{item.specifications || '—'}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-medium">{item.quantity}</td>
                              <td className="py-2.5 px-3 text-slate-500">{item.unit}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatCurrency(Number(item.unit_price) || 0)}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(item.line_total)}</td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-600 truncate max-w-[150px]">{item.supplier || 'Verified Supplier'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto md:hidden">
                      {items.map((item, idx) => (
                        <article key={item.id || idx} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                {item.category || 'Material'}
                              </span>
                              <h4 className="mt-0.5 break-words text-sm font-bold text-slate-900">{item.item_name}</h4>
                            </div>
                            <span className="shrink-0 text-right text-sm font-extrabold text-slate-900">
                              {formatCurrency(item.line_total)}
                            </span>
                          </div>
                          {item.specifications && (
                            <p className="mt-1 break-words text-xs text-slate-500">{item.specifications}</p>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                            <span>Quantity: <strong className="text-slate-800">{item.quantity} {item.unit}</strong></span>
                            <span className="text-right">Unit price: <strong className="text-slate-800">{formatCurrency(Number(item.unit_price) || 0)}</strong></span>
                            {item.supplier && <span className="col-span-2 break-words">Supplier: {item.supplier}</span>}
                          </div>
                        </article>
                      ))}
                      {items.length === 0 && (
                        <p className="rounded-xl border border-slate-200 p-4 text-center text-xs text-slate-500">
                          No itemized cost details are available for this quotation.
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}

              <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
                <span className="min-w-0 text-[11px] leading-relaxed text-slate-400">
                  Included automatically in the multi-sheet Excel export (.xlsx)
                </span>
                <button
                  type="button"
                  onClick={() => setViewingMaterialQuote(null)}
                  className="w-full rounded-xl bg-slate-900 px-5 py-2 font-bold text-xs text-white transition hover:bg-slate-800 sm:w-auto"
                >
                  Close Breakdown
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SIDE-BY-SIDE QUOTATION COMPARISON MODAL */}
        {isComparisonOpen && project && (
          <QuotationComparisonModal
            project={project}
            quotes={submittedQuotes}
            isOpen={isComparisonOpen}
            onClose={() => setIsComparisonOpen(false)}
            onRequestRevision={(q) => {
              setIsComparisonOpen(false);
              setRevisionModalQuote(q);
            }}
            onAcceptQuote={(q) => handleAcceptContractorQuote(q as any)}
            acceptingQuoteId={acceptingQuoteId}
          />
        )}

        {/* REQUEST REVISION MODAL */}
        {revisionModalQuote && (
          <RequestRevisionModal
            quote={revisionModalQuote}
            isOpen={!!revisionModalQuote}
            onClose={() => setRevisionModalQuote(null)}
            onSubmitRevision={handleRequestRevision}
          />
        )}

        {/* REQUEST PLAN REVISION MODAL */}
        {planRevisionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5 text-amber-700 font-bold text-base">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-amber-700" />
                  </div>
                  <span>Request Milestone Plan Revision</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPlanRevisionModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-slate-600">
                <p>
                  Explain what needs to change in the contractor's milestone schedule (e.g. adjust target dates, re-allocate stage percentages, or clarify stage scope).
                </p>
                <textarea
                  value={planRevisionNotes}
                  onChange={(e) => setPlanRevisionNotes(e.target.value)}
                  placeholder="e.g. Can we adjust Stage 2 completion to 45 days instead of 30, and reduce Stage 1 allocation to 20%?"
                  rows={4}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-hidden"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setPlanRevisionModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingPlanRevision || !planRevisionNotes.trim()}
                  onClick={handleRequestPlanRevision}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold transition shadow-xs flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingPlanRevision ? 'Sending...' : 'Submit Revision Request'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DELETE PROJECT CONFIRMATION MODAL */}
        {showDeleteModal && project && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5 text-red-600 font-bold text-base">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </div>
                  <span>Delete Project</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                <p>
                  Are you sure you want to permanently delete <strong className="text-slate-900">"{project.title}"</strong>?
                </p>
                <p className="text-slate-500">
                  This project has not been awarded yet. Deleting it will cancel all open contractor bids and remove its estimation records. This action cannot be undone.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingProject}
                  onClick={handleDeleteCurrentProject}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold transition shadow-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeletingProject ? 'Deleting...' : 'Delete Project'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
