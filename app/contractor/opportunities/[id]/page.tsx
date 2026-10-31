'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileText, 
  Send,
  ArrowLeft,
  Download,
  Info,
  Check,
  ShieldCheck,
  Layers,
  Hammer,
  FileSpreadsheet,
  Edit3
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Project, Quote } from '@/types/database';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils/formatters';

export default function OpportunityDetailPage() {
  return (
    <React.Suspense fallback={<div className="p-16 text-center text-xs text-slate-500">Loading opportunity...</div>}>
      <OpportunityDetailContent />
    </React.Suspense>
  );
}

function OpportunityDetailContent() {
  const params = useParams();
  const projectId = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [project, setProject] = React.useState<Project | null>(null);
  const [existingQuote, setExistingQuote] = React.useState<Quote | null>(null);

  const [successMsg, setSuccessMsg] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');

  React.useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => {
      setSuccessMsg('');
    }, 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const loadData = React.useCallback(async () => {
    if (!projectId) return;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoadError(authError.message);
      setLoading(false);
      return;
    }

    // 1. Fetch Project Details
    const { data: projData, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    if (projectError && projectError.code !== 'PGRST116') {
      setLoadError(projectError.message);
      setLoading(false);
      return;
    }

    const activeProject = (projData as Project) || null;
    if (activeProject) {
      setProject(activeProject);
    }

    // 2. Fetch any existing quote
    let currentQuote: Quote | null = null;
    if (user) {
      const { data: qData, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('project_id', projectId)
        .eq('contractor_id', user.id)
        .maybeSingle();
      if (quoteError) {
        setLoadError(quoteError.message);
        setLoading(false);
        return;
      }
      if (qData) currentQuote = qData as Quote;
    }
    if (currentQuote) {
      setExistingQuote(currentQuote);
    }

    setLoading(false);
  }, [projectId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <AppLayout userRole="contractor" title="Loading Opportunity..." backHref="/contractor/opportunities">
        <div className="p-16 text-center text-xs text-slate-500">Loading opportunity details...</div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout userRole="contractor" title="Opportunity Unavailable" backHref="/contractor/opportunities">
        <div className="p-16 text-center text-red-600">{loadError}</div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout userRole="contractor" title="Opportunity Not Found" backHref="/contractor/opportunities">
        <div className="p-16 text-center text-xs text-slate-500">Project opportunity was not found or has been closed.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      userRole="contractor"
      title={project.title}
      subtitle={`Opportunity Overview • ${project.city}${project.province ? `, ${project.province}` : ''}`}
      backHref="/contractor/opportunities"
    >
      <div className="w-full space-y-6">
        {(errorMsg || successMsg) && (
          <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200 space-y-2">
            {errorMsg && (
              <div className="p-4 rounded-xl bg-white border border-red-200 shadow-xl text-red-700 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                  <div className="font-semibold leading-relaxed">{errorMsg}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
                >
                  ?
                </button>
              </div>
            )}
            {successMsg && (
              <div className="p-4 rounded-xl bg-white border border-emerald-200 shadow-xl text-emerald-800 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div className="font-semibold leading-relaxed">{successMsg}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMsg('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
                >
                  ?
                </button>
              </div>
            )}
          </div>
        )}

        {/* Opportunity Summary Card */}
        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                {project.work_type.replace('_', ' ')}
              </span>
              <span className="text-xs text-slate-400">Posted on {formatDate(project.created_at)}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">{project.title}</h1>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span>{project.city}{project.province ? `, ${project.province}` : ''}</span>
              <span>•</span>
              <span className="capitalize">{project.finish_level} Finish</span>
              <span>•</span>
              <span>
                {project.floor_area_sqm != null ? `${project.floor_area_sqm} sq.m` : 'Floor area not provided'}
                {' • '}
                {project.floors != null ? `${project.floors} flr` : 'Floors not provided'}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl text-right min-w-[200px]">
            <div className="text-[11px] text-slate-400 font-medium">Estimated Project Cost</div>
            <div className="text-xl font-extrabold text-slate-900 mt-0.5">
              {project.est_mid != null ? formatCurrency(project.est_mid) : 'Not provided'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {project.est_low != null && project.est_high != null
                ? `Range: ${formatCurrency(project.est_low)} - ${formatCurrency(project.est_high)}`
                : 'Range not provided'}
            </div>
          </div>
        </div>

        <div className="w-full">
          {/* Project Specifications & Documents */}
          <div className="w-full space-y-6">
            {/* CONTRACTOR QUOTATION ACTION CARD */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl p-6 sm:p-7 text-white shadow-md relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-blue-500/30 text-blue-200 border border-blue-400/30">
                      Project Cost Breakdown & Proposal
                    </span>
                    {existingQuote && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                        existingQuote.status === 'accepted'
                          ? 'bg-emerald-500 text-white'
                          : existingQuote.status === 'revision_requested'
                          ? 'bg-amber-400 text-amber-950 animate-pulse font-extrabold'
                          : existingQuote.status === 'draft'
                          ? 'bg-purple-400 text-purple-950 font-bold'
                          : 'bg-white/20 text-white'
                      }`}>
                        {existingQuote.status === 'revision_requested' ? 'Revision Requested' : existingQuote.status.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl font-bold">
                    {existingQuote
                      ? `Your Proposal: ${formatCurrency(existingQuote.price)}`
                      : 'Prepare a Project Cost Breakdown'}
                  </h2>

                  <p className="text-xs text-blue-100/90 leading-relaxed">
                    {existingQuote
                      ? existingQuote.status === 'revision_requested'
                        ? 'The homeowner has requested a proposal revision. Update your cost categories and resubmit your breakdown.'
                        : `Proposal ref ${existingQuote.quote_ref || 'Not assigned'} has been submitted for homeowner review.`
                      : 'Enter costs for materials, labor, equipment, transportation, overhead, and other costs.'}
                  </p>

                  {/* Show Homeowner revision notes if revision requested */}
                  {existingQuote?.status === 'revision_requested' && existingQuote.revision_requested_notes && (
                    <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-300/40 text-xs text-amber-200 mt-2">
                      <span className="font-bold text-amber-100 block mb-0.5">Homeowner Revision Request:</span>
                      "{existingQuote.revision_requested_notes}"
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {existingQuote?.status === 'accepted' && (
                    <Link
                      href={`/contractor/projects/${project.id}`}
                      className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2"
                    >
                      <span>Project Planning & Milestones →</span>
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push(`/contractor/opportunities/${project.id}/proposal`)}
                    className="px-5 py-3 rounded-xl bg-white text-blue-900 hover:bg-blue-50 font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    <span>
                      {existingQuote
                        ? existingQuote.status === 'revision_requested'
                          ? 'Revise & Resubmit Proposal'
                          : existingQuote.status === 'draft'
                          ? 'Resume Draft Proposal'
                          : 'Edit / View Cost Breakdown'
                        : 'Create Cost Breakdown'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Architectural & Structural Specifications */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                Project Specifications
              </h3>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">House Type:</span>
                  <strong className="text-slate-900 capitalize">{project.house_type.replace('_', ' ')}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Total Floor Area:</span>
                  <strong className="text-slate-900">{project.floor_area_sqm} sq.m</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Number of Storeys:</span>
                  <strong className="text-slate-900">{project.floors} Storey</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Material Finish Level:</span>
                  <strong className="text-slate-900 capitalize">{project.finish_level} Quality</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Bedrooms / Bathrooms:</span>
                  <strong className="text-slate-900">{project.bedrooms ?? 'Not provided'} Beds / {project.bathrooms ?? 'Not provided'} Baths</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Desired Start Window:</span>
                  <strong className="text-slate-900 capitalize">{project.desired_start?.replace(/_/g, ' ') || 'Not specified'}</strong>
                </div>
              </div>

              {project.budget && (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex justify-between items-center">
                  <span>Homeowner's Target Budget:</span>
                  <strong className="text-sm font-bold">{formatCurrency(project.budget)}</strong>
                </div>
              )}
            </div>

            {/* Project Visual Renderings & Elevation */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                Architectural Elevation & Site Context
              </h3>
              
              <div className="relative rounded-xl border border-slate-200 aspect-video overflow-hidden bg-slate-50 flex items-center justify-center">
                {project.plan_file_path ? (
                  <Image src={project.plan_file_path} alt={`${project.title} project`} fill unoptimized className="object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Building2 className="w-10 h-10 text-slate-300" />
                    <span className="text-xs">No project image provided</span>
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
