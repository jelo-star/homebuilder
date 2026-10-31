'use client';

import React from 'react';
import { X, Send, AlertCircle, Building2, FileSpreadsheet, MessageSquare } from 'lucide-react';
import { Quote } from '@/types/database';

interface RequestRevisionModalProps {
  quote: Quote | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmitRevision: (quoteId: string, notes: string) => Promise<void>;
}

export default function RequestRevisionModal({
  quote,
  isOpen,
  onClose,
  onSubmitRevision,
}: RequestRevisionModalProps) {
  if (!isOpen || !quote) return null;

  const [notes, setNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      setError('Please provide specific feedback or clarification items for the contractor.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onSubmitRevision(quote.id, notes.trim());
      setNotes('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit revision request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-3xl w-full max-w-lg p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex justify-between items-start border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs uppercase tracking-wider">
              <MessageSquare className="w-4 h-4 text-amber-600" />
              <span>Request Quotation Revision / Clarification</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Feedback for {quote.contractor_profile?.business_name || 'Contractor'}
            </h3>
            <p className="text-xs text-slate-500">
              Quotation Ref: <strong className="font-mono text-slate-800">{quote.quote_ref || quote.id}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
              Specific Changes, Material Clarifications, or Budget Guidance <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              placeholder="e.g., Can we explore a different brand of porcelain tiles to fit our budget? Also please clarify if site debris disposal is included in the hauling subtotal."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              The contractor will receive your notes and be prompted to adjust and resubmit their materials quotation.
            </span>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
            <strong>What happens next:</strong> The proposal status will transition to <span className="font-bold underline">Revision Requested</span>. The contractor can modify their bill of materials and resubmit an updated proposal for your final approval.
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !notes.trim()}
              className="py-2.5 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitting ? 'Sending Request...' : 'Send Revision Request'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

