'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileText, 
  Send,
  ArrowLeft,
  Download,
  Info,
  ShieldCheck,
  Layers,
  Hammer,
  FileSpreadsheet,
  Edit3,
  BedDouble,
  CalendarDays,
  Grid2X2,
  Layers3,
  ShieldCheck as FinishIcon,
  House
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

  const projectImage = project.plan_file_path
    || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85';

  return (
    <AppLayout
      userRole="contractor"
      title={project.title}
      subtitle={`Opportunity Overview • ${project.city}${project.province ? `, ${project.province}` : ''}`}
      backHref="/contractor/opportunities"
    >
      <div className="w-full space-y-4">
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
        <section
          className="relative min-h-[190px] overflow-hidden rounded-2xl border border-slate-200 bg-[#102e55] bg-cover bg-center shadow-sm"
          style={{ backgroundImage: `linear-gradient(90deg, rgba(8, 30, 65, .96) 0%, rgba(10, 48, 91, .86) 42%, rgba(10, 48, 91, .22) 100%), url("${projectImage}")` }}
        >
          <div className="relative flex min-h-[190px] flex-col justify-between p-5 text-white sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{project.work_type.replace('_', ' ')}</span>
              <span className="text-xs text-blue-100">Posted on {formatDate(project.created_at)}</span>
            </div>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{project.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-blue-50">
                  <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{project.city}{project.province ? `, ${project.province}` : ''}</span>
                  <span>•</span><span className="capitalize">{project.finish_level || '-'} finish</span>
                  <span>•</span><span>{project.floor_area_sqm != null ? `${project.floor_area_sqm} sq.m` : '-'} · {project.floors != null ? `${project.floors} floor${project.floors === 1 ? '' : 's'}` : '-'}</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/40 bg-slate-950/35 px-5 py-3 backdrop-blur-sm lg:min-w-[205px] lg:text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-100">Estimated project cost</div>
                <div className="mt-1 text-2xl font-extrabold">{project.est_mid != null ? formatCurrency(project.est_mid) : '-'}</div>
                <div className="mt-1 text-[10px] text-blue-100">{project.est_low != null && project.est_high != null ? `Range: ${formatCurrency(project.est_low)} – ${formatCurrency(project.est_high)}` : 'Range not provided'}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Cost range', project.est_low != null && project.est_high != null ? `${formatCurrency(project.est_low)} – ${formatCurrency(project.est_high)}` : '-'],
            ['House type', project.house_type?.replace('_', ' ') || '-'],
            ['Bedrooms', project.bedrooms ?? '-'],
            ['Bathrooms', project.bathrooms ?? '-'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
              <div className="mt-1 text-sm font-bold capitalize text-slate-900">{value}</div>
            </div>
          ))}
        </section>

        <div className="w-full min-h-0">
          {/* Project Specifications & Documents */}
          <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            {/* CONTRACTOR QUOTATION ACTION CARD */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm">
              <div className="flex items-center justify-between bg-[#102e55] px-5 py-3 text-white sm:px-6">
                <h2 className="flex items-center gap-2 text-sm font-bold"><FileText className="h-4 w-4" />Proposal &amp; Status</h2>
                {existingQuote && (
                  <span className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                    {existingQuote.status === 'revision_requested' ? 'Revision Requested' : existingQuote.status}
                  </span>
                )}
              </div>
              <div className="relative z-10 flex flex-col justify-between gap-5 p-5 md:flex-row md:items-start sm:p-6">
                <div className="max-w-3xl space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                      Project Cost Breakdown & Proposal
                    </span>
                  </div>

                  <h2 className="text-xl font-extrabold tracking-tight">
                    {existingQuote
                      ? `Your Proposal: ${formatCurrency(existingQuote.price)}`
                      : 'Prepare a Project Cost Breakdown'}
                  </h2>

                  <p className="text-xs leading-relaxed text-slate-500">
                    {existingQuote
                      ? existingQuote.status === 'revision_requested'
                        ? 'The homeowner has requested a proposal revision. Update your cost categories and resubmit your breakdown.'
                        : `Proposal ref ${existingQuote.quote_ref || 'Not assigned'} has been submitted for homeowner review.`
                      : 'Enter costs for materials, labor, equipment, transportation, overhead, and other costs.'}
                  </p>

                  {/* Show Homeowner revision notes if revision requested */}
                  {existingQuote?.status === 'revision_requested' && existingQuote.revision_requested_notes && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <span className="mb-0.5 block font-bold text-amber-950">Homeowner Revision Request:</span>
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
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h3 className="flex items-center gap-2 bg-[#102e55] px-5 py-3 text-sm font-bold text-white sm:px-6">
                <Building2 className="h-4 w-4" />
                Project Specifications
              </h3>
              <div className="grid grid-cols-1 divide-y divide-slate-100 p-4 text-xs sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0 sm:p-5">
                {[
                  [House, 'House type', project.house_type?.replace('_', ' ') || '-'],
                  [Grid2X2, 'Floor area', project.floor_area_sqm != null ? `${project.floor_area_sqm} sq.m` : '-'],
                  [Layers3, 'Storeys', project.floors != null ? `${project.floors} Storey` : '-'],
                  [FinishIcon, 'Finish level', project.finish_level ? `${project.finish_level} Quality` : '-'],
                  [BedDouble, 'Beds / baths', `${project.bedrooms ?? '-'} Beds / ${project.bathrooms ?? '-'} Baths`],
                  [CalendarDays, 'Start window', project.desired_start?.replace(/_/g, ' ') || '-'],
                ].map(([Icon, label, value], index) => (
                  <div key={label as string} className={`flex items-center gap-3 py-3 first:pt-1 sm:py-2.5 ${index >= 3 ? 'sm:border-t sm:border-slate-100' : ''}`}>
                    <Icon className="h-4 w-4 shrink-0 text-[#315b8e]" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-medium text-slate-400">{label as string}</div>
                      <strong className="mt-0.5 block capitalize text-slate-800">{value as string}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between bg-[#102e55] px-5 py-3 text-white sm:px-6">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Building2 className="h-4 w-4" />
                  Project image
                </h3>
                <span className="text-[10px] font-medium uppercase tracking-wide text-blue-100">Reference</span>
              </div>
              <div className="p-5 sm:p-6">
                <div
                  className="flex h-[190px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 bg-cover bg-center"
                  style={project.plan_file_path ? { backgroundImage: `url("${project.plan_file_path}")` } : undefined}
                >
                  {!project.plan_file_path && (
                    <div className="text-center text-slate-400">
                      <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-xs font-medium">No project image provided</p>
                      <p className="mt-1 text-[10px]">Reference files may be added during project planning.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </AppLayout>
  );
}
