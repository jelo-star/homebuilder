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
  AlertCircle, 
  Clock, 
  FileCheck, 
  ArrowLeft,
  History,
  ShieldCheck,
  Check,
  FileSpreadsheet,
  Edit3,
  Layers,
  Truck
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Quote, Project } from '@/types/database';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils/formatters';
import ContractorCostBreakdownModal from '@/components/contractor/ContractorCostBreakdownModal';
import QuoteCostBreakdown from '@/components/quotes/QuoteCostBreakdown';

export default function QuoteDetailPage() {
  return (
    <React.Suspense fallback={<div className="p-16 text-center text-xs text-slate-500">Loading proposal...</div>}>
      <QuoteDetailContent />
    </React.Suspense>
  );
}

function QuoteDetailContent() {
  const params = useParams();
  const quoteId = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [quote, setQuote] = React.useState<(Quote & { projects?: Project }) | null>(null);
  const [revisions, setRevisions] = React.useState<any[]>([]);
  const [isReviseModalOpen, setIsReviseModalOpen] = React.useState(false);

  const loadData = React.useCallback(async () => {
    if (!quoteId) return;
    const supabase = createClient();
    const { error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoadError(authError.message);
      setLoading(false);
      return;
    }

    // 1. Fetch Quote with Project
    let currentQuote: (Quote & { projects?: Project }) | null = null;
    try {
      const { data: qData, error } = await supabase
        .from('quotes')
        .select('*, projects!quotes_project_id_fkey(*)')
        .eq('id', quoteId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (qData) currentQuote = qData as any;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load quotation.');
      setLoading(false);
      return;
    }

    setQuote(currentQuote);

    // 2. Fetch Revisions
    try {
      const { data: revData, error: revisionsError } = await supabase
        .from('quote_revisions')
        .select('*')
        .eq('quote_id', quoteId)
        .order('revision_number', { ascending: false });
      if (revisionsError) throw revisionsError;
      if (revData) setRevisions(revData);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load quotation revisions.');
    }

    setLoading(false);
  }, [quoteId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <AppLayout userRole="contractor" title="Loading Quote..." backHref="/contractor/quotes">
        <div className="p-16 text-center text-xs text-slate-500">Loading proposal details...</div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout userRole="contractor" title="Quotation Unavailable" backHref="/contractor/quotes">
        <div className="p-16 text-center text-xs text-red-600">{loadError}</div>
      </AppLayout>
    );
  }

  if (!quote) {
    return (
      <AppLayout userRole="contractor" title="Quote Not Found" backHref="/contractor/quotes">
        <div className="p-16 text-center text-xs text-slate-500">Proposal record was not found.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      userRole="contractor"
      title={`Quotation for ${quote.projects?.title || 'Project'}`}
      subtitle={`Submitted proposal details • Status: ${quote.status.toUpperCase()}`}
      backHref="/contractor/quotes"
    >
      <div className="w-full space-y-6">
        {/* Status Header */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                quote.status === 'accepted'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : quote.status === 'declined'
                  ? 'bg-slate-100 text-slate-600'
                  : quote.status === 'revision_requested'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                  : quote.status === 'draft'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}>
                {quote.status === 'revision_requested' ? 'Revision Requested' : quote.status}
              </span>
              {quote.quote_ref && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  {quote.quote_ref}
                </span>
              )}
              <span className="text-xs text-slate-400">
                Submitted on {formatDate(quote.submitted_at || quote.created_at)}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">{quote.projects?.title}</h1>
            <p className="text-xs text-slate-500">{quote.projects?.city} • {quote.projects?.floor_area_sqm} sq.m</p>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400 font-medium">Offered Contract Price</div>
            <div className="text-2xl font-extrabold text-slate-900">{formatCurrency(quote.price)}</div>
          </div>
        </div>

        <QuoteCostBreakdown quote={quote} />

        {/* Homeowner Revision Request Feedback Box */}
        {quote.status === 'revision_requested' && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xs">
            <div className="space-y-1">
              <div className="font-bold flex items-center gap-2 text-sm text-amber-800">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>Homeowner Clarification & Revision Request</span>
                {quote.revision_requested_at && (
                  <span className="text-xs font-normal text-amber-700">
                    ({formatDate(quote.revision_requested_at)})
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-800 italic pl-7">
                "{quote.revision_requested_notes || 'No revision notes provided.'}"
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsReviseModalOpen(true)}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Revise & Resubmit Quotation</span>
            </button>
          </div>
        )}

        {/* Scope and Proposal Specifications */}
        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-600" />
            Proposal Specifications & Commitments
          </h2>

          <div className="space-y-4 text-xs">
            <div>
              <span className="text-slate-400 font-medium block mb-1">Scope of Work:</span>
              <div className="p-3.5 rounded-xl bg-slate-50 text-slate-800 leading-relaxed">
                {quote.scope_of_work || 'Not provided'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-slate-400 font-medium block mb-1">Inclusions:</span>
                <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-100 text-emerald-950 leading-relaxed">
                  {quote.inclusions || 'Not provided'}
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-medium block mb-1">Exclusions:</span>
                <div className="p-3.5 rounded-xl bg-rose-50/50 border border-rose-100 text-rose-950 leading-relaxed">
                  {quote.exclusions || 'Not provided'}
                </div>
              </div>
            </div>

            {quote.notes && (
              <div>
                <span className="text-slate-400 font-medium block mb-1">Warranty & Contract Notes:</span>
                <div className="p-3.5 rounded-xl bg-slate-50 text-slate-800">
                  {quote.notes}
                </div>
              </div>
            )}
          </div>

          {quote.status === 'accepted' && (
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Link
                href={`/contractor/projects/${quote.project_id}`}
                className="py-2.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-2"
              >
                <span>Go to Project Planning & Milestone Setup →</span>
              </Link>
            </div>
          )}
        </div>

        {/* Itemized Materials Quotation & Construction Cost Breakdown */}
        {quote.material_quotation && (
          <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  <h2 className="font-bold text-slate-900 text-sm">Itemized Bill of Materials & Cost Breakdown</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Reference: <strong className="font-mono text-slate-800">{quote.quote_ref || quote.material_quotation.quote_ref || 'Not assigned'}</strong>
                  {quote.material_quotation.items ? ` • ${quote.material_quotation.items.length} line items` : ''}
                </p>
              </div>

              {quote.status !== 'accepted' && (
                <button
                  type="button"
                  onClick={() => setIsReviseModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Open Quotation Workbook</span>
                </button>
              )}
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Materials Subtotal</span>
                <span className="text-base font-extrabold font-mono text-slate-900 mt-0.5 block">
                  {formatCurrency(quote.materials_subtotal || quote.material_quotation.materials_subtotal || 0)}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Delivery & Logistics</span>
                <span className="text-base font-extrabold font-mono text-slate-900 mt-0.5 block">
                  {formatCurrency((Number(quote.delivery_charges) || 0) + (Number(quote.other_charges) || 0))}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Labor & Equipment</span>
                <span className="text-base font-extrabold font-mono text-slate-900 mt-0.5 block">
                  {formatCurrency((Number(quote.labor_cost) || 0) + (Number(quote.equipment_cost) || 0))}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] text-emerald-800 uppercase font-bold block">Total Quotation</span>
                <span className="text-base font-extrabold font-mono text-emerald-700 mt-0.5 block">
                  {formatCurrency(quote.price)}
                </span>
              </div>
            </div>

            {/* Items Table */}
            {quote.material_quotation.items && quote.material_quotation.items.length > 0 && (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3">Specifications / Brand</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3">Unit</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                      <th className="py-2.5 px-3">Supplier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {quote.material_quotation.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{it.item_name}</td>
                        <td className="py-2.5 px-3 text-slate-500 text-[11px]">{it.brand_spec || '—'}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium">{it.quantity || '-'}</td>
                        <td className="py-2.5 px-3 text-slate-500">{it.unit?.trim() || '-'}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatCurrency(it.unit_price)}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(Number(it.quantity) * (Number(it.unit_price) || 0))}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600 truncate max-w-[150px]">{it.supplier || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Revision Audit History */}
        {revisions.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-blue-600" />
                Revision History
              </h3>
              <span className="text-xs text-slate-500">{revisions.length} Revisions Recorded</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {revisions.map((rev) => (
                <div key={rev.id} className="p-4 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">Revision {rev.revision_number}</span>
                    <span className="text-slate-400 text-[11px] ml-2">({formatDate(rev.created_at)})</span>
                    {rev.notes && <p className="text-slate-500 text-[11px] mt-0.5">{rev.notes}</p>}
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-slate-900">{formatCurrency(rev.price)}</span>
                    {rev.duration_months && <span className="text-slate-500 block text-[11px]">{rev.duration_months} Months</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PROJECT COST BREAKDOWN REVISION MODAL */}
        {isReviseModalOpen && quote.projects && (
          <ContractorCostBreakdownModal
            project={quote.projects}
            existingQuote={quote}
            isOpen={isReviseModalOpen}
            onClose={() => setIsReviseModalOpen(false)}
            onSuccess={() => {
              setIsReviseModalOpen(false);
              loadData();
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}
