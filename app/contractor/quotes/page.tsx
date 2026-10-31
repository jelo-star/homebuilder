'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  FileCheck, 
  Search, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Building2,
  Calendar,
  ChevronRight,
  Filter,
  History,
  Edit3,
  FileSpreadsheet
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Quote, Project } from '@/types/database';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils/formatters';
import ContractorCostBreakdownModal from '@/components/contractor/ContractorCostBreakdownModal';
import QuoteCostBreakdown from '@/components/quotes/QuoteCostBreakdown';

export default function ContractorQuotesPage() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [quotes, setQuotes] = React.useState<(Quote & { projects?: Project })[]>([]);
  const [filter, setFilter] = React.useState<'all' | 'submitted' | 'revision_requested' | 'accepted' | 'draft' | 'declined'>('all');
  const [search, setSearch] = React.useState('');

  // Active Quote being revised / edited in modal
  const [modalQuote, setModalQuote] = React.useState<Quote | null>(null);
  const [modalProject, setModalProject] = React.useState<Project | null>(null);

  const loadData = React.useCallback(async () => {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoadError(authError.message);
      setLoading(false);
      return;
    }

    let currentQuotes: (Quote & { projects?: Project })[] = [];
    if (user) {
      const { data, error } = await supabase
        .from('quotes')
        .select('*, projects!quotes_project_id_fkey(*)')
        .eq('contractor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      if (data) {
        currentQuotes = data as any;
      }
    }

    setLoadError('');
    setQuotes(currentQuotes);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredQuotes = React.useMemo(() => {
    return quotes.filter(q => {
      const matchesFilter = filter === 'all' || q.status === filter;
      const matchesSearch = search === '' ||
        q.projects?.title?.toLowerCase().includes(search.toLowerCase()) ||
        q.projects?.city?.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [quotes, filter, search]);

  return (
    <AppLayout
      userRole="contractor"
      title="My Project Quotations"
      subtitle="Track your submitted proposals, active contracts, and homeowner decisions"
      backHref="/contractor/dashboard"
    >
      <div className="w-full space-y-6">
        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Proposals' },
              { key: 'submitted', label: 'Under Review' },
              { key: 'revision_requested', label: 'Revision Requested' },
              { key: 'accepted', label: 'Accepted / Won' },
              { key: 'draft', label: 'Drafts' },
              { key: 'declined', label: 'Declined' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filter === tab.key
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by project title, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Quotes List Table / Cards */}
        {loading ? (
          <div className="p-16 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">
            Loading your quotation history...
          </div>
        ) : loadError ? (
          <div className="p-12 text-center text-xs text-red-600 bg-white rounded-2xl border border-red-200">{loadError}</div>
        ) : filteredQuotes.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-2">
            <FileCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-800 text-sm">No quotations found</div>
            <p className="text-slate-400">Browse open project leads to submit competitive proposals.</p>
            <div className="pt-2">
              <Link
                href="/contractor/opportunities"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >
                Explore Opportunities
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden divide-y divide-slate-100">
            {filteredQuotes.map((q) => (
              <div key={q.id} className="p-5 sm:p-6 hover:bg-slate-50/50 transition-colors flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        {q.projects?.title || 'Project title not available'}
                      </span>
                      {q.quote_ref && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {q.quote_ref}
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        q.status === 'accepted'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : q.status === 'declined'
                          ? 'bg-slate-100 text-slate-600'
                          : q.status === 'revision_requested'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                          : q.status === 'draft'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}>
                        {q.status === 'revision_requested' ? 'Revision Requested' : q.status}
                      </span>
                      {q.revision_number && q.revision_number > 1 && (
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                          Rev {q.revision_number}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Location: <strong>{q.projects?.city || 'Not provided'}</strong></span>
                      <span>•</span>
                      <span>Submitted: {formatDate(q.submitted_at || q.created_at)}</span>
                      {q.valid_until && (
                        <>
                          <span>•</span>
                          <span>Valid until: {formatDate(q.valid_until)}</span>
                        </>
                      )}
                    </div>

                    {q.scope_of_work && (
                      <p className="text-xs text-slate-600 line-clamp-1 max-w-xl">
                        {q.scope_of_work}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                    <div className="md:text-right">
                      <div className="text-xs text-slate-400 font-medium">Proposed Price</div>
                      <div className="text-base font-extrabold text-slate-900">
                        {formatCurrency(q.price)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {q.status === 'revision_requested' && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalQuote(q);
                            setModalProject(q.projects || null);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-xs font-bold text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Revise & Resubmit</span>
                        </button>
                      )}

                      {q.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalQuote(q);
                            setModalProject(q.projects || null);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-xs font-bold text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>Resume Draft</span>
                        </button>
                      )}

                      <Link
                        href={`/contractor/quotes/${q.id}`}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
                      >
                        View Details
                      </Link>

                      {q.status === 'accepted' && (
                        <Link
                          href={`/contractor/projects/${q.project_id}`}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs transition-colors flex items-center gap-1.5"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>Project Planning & Milestones →</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <QuoteCostBreakdown quote={q} />

                {/* Homeowner Revision Request Feedback Box */}
                {q.status === 'revision_requested' && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Homeowner Clarification & Revision Request</span>
                      {q.revision_requested_at && (
                        <span className="text-[10px] text-amber-600 font-normal">
                          ({formatDate(q.revision_requested_at)})
                        </span>
                      )}
                    </div>
                    <p className="text-amber-800 italic pl-5">
                      "{q.revision_requested_notes || 'No revision notes provided.'}"
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* PROJECT COST BREAKDOWN REVISION MODAL */}
        {modalQuote && modalProject && (
          <ContractorCostBreakdownModal
            project={modalProject}
            existingQuote={modalQuote}
            isOpen={!!modalQuote}
            onClose={() => {
              setModalQuote(null);
              setModalProject(null);
            }}
            onSuccess={() => {
              setModalQuote(null);
              setModalProject(null);
              loadData();
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}
