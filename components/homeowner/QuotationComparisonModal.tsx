'use client';

import React from 'react';
import Link from 'next/link';
import { 
  X, 
  Building2, 
  CheckCircle2, 
  ShieldCheck, 
  Clock, 
  Layers, 
  DollarSign, 
  Hammer, 
  FileSpreadsheet, 
  ArrowRight,
  Sparkles,
  Info,
  Calendar,
  AlertCircle,
  Edit3
} from 'lucide-react';
import { Quote, Project } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

interface QuotationComparisonModalProps {
  project: Project;
  quotes: Quote[];
  isOpen: boolean;
  onClose: () => void;
  onRequestRevision: (quote: Quote) => void;
  onAcceptQuote: (quote: Quote) => void;
  acceptingQuoteId?: string | null;
}

export default function QuotationComparisonModal({
  project,
  quotes,
  isOpen,
  onClose,
  onRequestRevision,
  onAcceptQuote,
  acceptingQuoteId,
}: QuotationComparisonModalProps) {
  if (!isOpen || quotes.length === 0) return null;

  const floorArea = project.floor_area_sqm || 120;
  const costCategories = [
    { label: 'Materials', amount: (q: Quote) => q.materials_subtotal ?? q.total_materials_quotation },
    { label: 'Labor', amount: (q: Quote) => q.labor_cost },
    { label: 'Equipment', amount: (q: Quote) => q.equipment_cost },
    { label: 'Transportation', amount: (q: Quote) => q.logistics_cost ?? q.delivery_charges },
    { label: 'Overhead', amount: (q: Quote) => q.overhead_profit_cost },
    { label: 'Other costs', amount: (q: Quote) => q.other_charges },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-7xl shadow-2xl border border-slate-200 flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300 font-bold">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 font-bold">
                  Side-by-Side Review
                </span>
                <span className="text-xs text-slate-300">
                  {quotes.length} Competing Contractor Proposals
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
                Compare Contractor Materials & Construction Quotations — {project.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Guidance Banner */}
        <div className="bg-blue-50/70 border-b border-blue-100 px-6 py-2.5 text-xs text-blue-900 flex items-center gap-2 shrink-0">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Compare total prices, material bills of quantities, skilled labor allocations, and execution timelines. Evaluate the quality of materials and contractor accreditation rather than cost alone.
          </span>
        </div>

        {/* Comparison Grid */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-4 sm:p-6">
          <div className="min-w-[760px]">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-48 p-3 text-left font-bold text-slate-500 uppercase text-[10px] border-b-2 border-slate-200 bg-slate-50 sticky left-0 z-10">
                    Evaluation Metric
                  </th>
                  {quotes.map((q) => (
                    <th key={q.id} className="p-4 text-left border-b-2 border-slate-200 bg-slate-50/50 min-w-[260px]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/contractors/${q.contractor_id}`}
                            className="font-bold text-slate-900 text-sm hover:text-blue-700 hover:underline"
                          >
                            {q.contractor_profile?.business_name || 'Contractor Profile'}
                          </Link>
                          <div className={`text-[11px] font-semibold flex items-center gap-1 mt-0.5 ${q.contractor_profile?.verification_status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}`}>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>
                              {q.contractor_profile?.pcab_license_no || q.contractor_profile?.license_no || 'License not provided'}
                              {q.contractor_profile?.verification_status !== 'approved' && ' · Not verified'}
                            </span>
                          </div>
                          <Link
                            href={`/contractors/${q.contractor_id}`}
                            className="mt-1 inline-flex text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                          >
                            View profile, credentials &amp; projects
                          </Link>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          q.status === 'accepted'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : q.status === 'revision_requested'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : q.status === 'revised'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {q.status === 'revision_requested' ? 'Rev. Requested' : q.status}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {/* 1. TOTAL PROPOSED PRICE */}
                <tr className="bg-blue-50/20">
                  <td className="p-3 font-bold text-slate-900 text-xs border-r border-slate-100 sticky left-0 bg-blue-50/40">
                    Total Proposed Price
                  </td>
                  {quotes.map((q) => (
                    <td key={q.id} className="p-4 border-r border-slate-100">
                      <div className="text-xl font-black font-mono text-emerald-700">
                        {formatCurrency(q.price)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        ~{formatCurrency(Math.round(q.price / floorArea))} / sq.m
                      </div>
                    </td>
                  ))}
                </tr>

                {costCategories.map(category => (
                  <tr key={category.label}>
                    <td className="p-3 font-bold text-slate-700 text-xs border-r border-slate-100 sticky left-0 bg-white">
                      {category.label}
                    </td>
                    {quotes.map(q => (
                      <td key={q.id} className="p-4 border-r border-slate-100 font-bold font-mono text-slate-900 text-sm">
                        {formatCurrency(category.amount(q) ?? 0)}
                      </td>
                    ))}

                    {[
                      ['Scope of work', (q: Quote) => q.scope_of_work || '—'],
                      ['Work methodology', (q: Quote) => q.work_methodology || '—'],
                      ['Payment terms', (q: Quote) => q.payment_terms || '—'],
                      ['Proposed start date', (q: Quote) => q.proposed_start_date || '—'],
                      ['Duration', (q: Quote) => q.duration_months ? `${q.duration_months} month(s)` : '—'],
                      ['Additional notes', (q: Quote) => q.notes || '—'],
                    ].map(([label, value]) => (
                      <tr key={label as string}>
                        <td className="p-3 font-bold text-slate-700 text-xs border-r border-slate-100 sticky left-0 bg-white">{label as string}</td>
                        {quotes.map(q => (
                          <td key={q.id} className="p-4 border-r border-slate-100 text-xs text-slate-600 whitespace-pre-wrap">
                            {(value as (quote: Quote) => string)(q)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tr>
                ))}

                {/* 9. VALIDITY DATE */}
                <tr>
                  <td className="p-3 font-bold text-slate-700 text-xs border-r border-slate-100 sticky left-0 bg-white">
                    Quote Validity
                  </td>
                  {quotes.map((q) => (
                    <td key={q.id} className="p-4 border-r border-slate-100 text-xs text-slate-600">
                      <div>Valid until: <strong>{formatDate(q.valid_until)}</strong></div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Submitted: {formatDate(q.created_at)}</div>
                    </td>
                  ))}
                </tr>

                {/* 10. ACTIONS ROW */}
                <tr className="bg-slate-50/70">
                  <td className="p-3 font-bold text-slate-900 text-xs border-r border-slate-100 sticky left-0 bg-slate-100">
                    Decision Actions
                  </td>
                  {quotes.map((q) => (
                    <td key={q.id} className="p-4 border-r border-slate-100 space-y-2">
                      <button
                        type="button"
                        disabled={acceptingQuoteId === q.id || q.status === 'accepted'}
                        onClick={() => onAcceptQuote(q)}
                        className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        {acceptingQuoteId === q.id ? (
                          <span>Awarding Contract...</span>
                        ) : q.status === 'accepted' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Accepted & Awarded</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Accept Proposal</span>
                          </>
                        )}
                      </button>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onRequestRevision(q)}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-semibold transition text-center cursor-pointer"
                        >
                          Request Revision
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            Close Comparison
          </button>
        </div>

      </div>
    </div>
  );
}
