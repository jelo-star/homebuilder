'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Search, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Eye
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile, ContractorDocument, VerificationStatus } from '@/types/database';

export default function VerificationsQueuePage() {
  const [loading, setLoading] = React.useState(true);
  const [contractors, setContractors] = React.useState<ContractorProfile[]>([]);
  const [documents, setDocuments] = React.useState<ContractorDocument[]>([]);
  const [documentUrls, setDocumentUrls] = React.useState<Record<string, string | null>>({});
  const [documentUrlErrors, setDocumentUrlErrors] = React.useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = React.useState<VerificationStatus | 'all'>('pending');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);
  const [rejectModalContractor, setRejectModalContractor] = React.useState<ContractorProfile | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: cData, error: contractorsError } = await supabase
      .from('contractor_profiles')
      .select('*, profiles!contractor_profiles_profile_id_fkey(*)')
      .order('created_at', { ascending: false });
    if (contractorsError) setError(contractorsError.message);
    setContractors((cData || []) as ContractorProfile[]);

    const { data: docData, error: documentsError } = await supabase
      .from('contractor_documents')
      .select('*')
      .order('created_at', { ascending: false });
    if (documentsError) setError(current => current ? `${current}; ${documentsError.message}` : documentsError.message);
    const loadedDocuments = (docData || []) as ContractorDocument[];
    setDocuments(loadedDocuments);

    const urlResults = await Promise.all(loadedDocuments.map(async (doc) => {
      if (doc.file_path.startsWith('/demo-credentials/')) {
        return { id: doc.id, url: doc.file_path, error: null };
      }

      const { data, error: urlError } = await supabase.storage
        .from('contractor-docs')
        .createSignedUrl(doc.file_path, 3600);

      return {
        id: doc.id,
        url: data?.signedUrl || null,
        error: urlError?.message || (!data?.signedUrl ? 'No secure preview link was returned.' : null),
      };
    }));
    setDocumentUrls(Object.fromEntries(urlResults.map(result => [result.id, result.url])));
    setDocumentUrlErrors(Object.fromEntries(
      urlResults.filter(result => result.error).map(result => [result.id, result.error as string])
    ));

    setLoading(false);
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const handleVerify = async (profileId: string, decision: 'approved' | 'rejected', reason?: string) => {
    setActionLoading(profileId);
    setSuccessMsg('');
    setError(null);
    const supabase = createClient();

    try {
      const { error: verificationError } = await supabase.rpc('admin_set_contractor_verification', {
        p_profile_id: profileId,
        p_decision: decision,
        p_rejection_reason: reason || null,
      });
      if (verificationError) throw verificationError;

      setSuccessMsg(`Contractor application has been ${decision}!`);
      setRejectModalContractor(null);
      setRejectReason('');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update contractor verification.');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = contractors.filter(c => {
    const matchesTab = activeTab === 'all' || c.verification_status === activeTab;
    const matchesSearch = searchQuery === '' || 
      c.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.license_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.service_cities?.some(city => city.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Contractor Verification Queue"
      subtitle="Examine regulatory credentials, PCAB licenses, and municipal compliance before granting bidding eligibility"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {successMsg && (
          <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
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
          </div>
        )}

        {/* Filter Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex gap-2 border-b sm:border-b-0 border-slate-200 pb-2 sm:pb-0">
            {(['pending', 'all', 'approved', 'rejected'] as const).map((tab) => {
              const count = contractors.filter(c => tab === 'all' ? true : c.verification_status === tab).length;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {tab} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search contractor, PCAB #, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Verification Queue Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Applications ({filtered.length})</h2>
            <button
              onClick={() => loadData()}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading verifications...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No verification records matching current filters.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const cDocs = documents.filter(d => d.contractor_id === c.profile_id);
                const licenseDocument = cDocs.find(
                  doc => doc.doc_type === 'license' && doc.status === 'approved' && doc.doc_number?.trim()
                ) ?? cDocs.find(doc => doc.doc_type === 'license' && doc.doc_number?.trim());
                const licenseNumber = licenseDocument?.doc_number || c.pcab_license_no || c.license_no;
                const isImageDocument = (filePath: string) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(filePath);
                const hasLicenseNumber = Boolean(licenseNumber?.trim());
                const hasLicenseDocument = cDocs.some((doc) => doc.doc_type === 'license');
                const canApprove = hasLicenseNumber && hasLicenseDocument;
                return (
                  <div key={c.profile_id} className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/40 transition-colors">
                    <div className="space-y-1.5 max-w-xl">
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/contractors/${c.profile_id}`} className="font-semibold text-slate-900 text-sm hover:text-blue-600 transition-colors">
                          {c.business_name}
                        </Link>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                          c.verification_status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : c.verification_status === 'rejected'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {c.verification_status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 flex flex-wrap gap-2.5">
                        <span>Experience: <strong>{c.years_experience} yrs</strong></span>
                        <span>•</span>
                        <span>Cities: <strong>{c.service_cities?.join(', ') || '—'}</strong></span>
                        {licenseNumber && (
                          <>
                            <span>•</span>
                            <span>License / PCAB: <strong>{licenseNumber}</strong></span>
                          </>
                        )}
                      </div>

                      {cDocs.length > 0 && (
                        <div className="grid w-full grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                          {cDocs.map((doc) => {
                            const documentUrl = documentUrls[doc.id];
                            const imageDocument = isImageDocument(doc.file_path);
                            return (
                              <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                                {imageDocument && documentUrl ? (
                                  <a
                                    href={documentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Open ${doc.doc_title || doc.doc_type}`}
                                    className="group relative h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                                  >
                                    <img
                                      src={documentUrl}
                                      alt={doc.doc_title || `${doc.doc_type} document`}
                                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white transition-colors group-hover:bg-black/35">
                                      <Eye className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                                    </span>
                                  </a>
                                ) : (
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                                    <FileText className="h-5 w-5" />
                                  </div>
                                )}
                                <div className="min-w-0 space-y-1">
                                  <div className="truncate font-semibold text-slate-900">
                                    {doc.doc_title || doc.doc_type.replace('_', ' ')}
                                  </div>
                                  <div className="text-[11px] capitalize text-slate-500">
                                    {doc.doc_type.replace('_', ' ')} · {doc.status}
                                  </div>
                                  {doc.doc_number && (
                                    <div className="truncate font-mono text-[11px] text-slate-500">
                                      {doc.doc_number}
                                    </div>
                                  )}
                                  {documentUrl ? (
                                    <a
                                      href={documentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      View document
                                    </a>
                                  ) : (
                                    <p className="text-[11px] text-rose-600">
                                      {documentUrlErrors[doc.id] || 'Loading document preview…'}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {c.verification_status !== 'approved' && !canApprove && (
                        <p className="pt-1 text-xs text-amber-700">
                          Approval requires a license number and an uploaded license document.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/admin/contractors/${c.profile_id}`}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                      >
                        Details
                      </Link>

                      {c.verification_status !== 'approved' && (
                        <button
                          onClick={() => handleVerify(c.profile_id, 'approved')}
                          disabled={actionLoading === c.profile_id || !canApprove}
                          title={!canApprove ? 'Requires a license number and uploaded license document' : undefined}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded-lg text-xs font-medium shadow-xs transition-colors flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </button>
                      )}

                      {c.verification_status !== 'rejected' && (
                        <button
                          onClick={() => {
                            setRejectModalContractor(c);
                            setRejectReason('');
                          }}
                          disabled={actionLoading === c.profile_id}
                          className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reject Confirmation Modal with Required Reason */}
        {rejectModalContractor && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
              <div className="flex items-center gap-3 text-red-600">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <h3 className="font-bold text-slate-900 text-base">Reject Application</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Rejecting <strong>{rejectModalContractor.business_name}</strong> will revoke their bidding eligibility. You must specify a clear reason for the applicant.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason for Rejection *</label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Describe the credential or compliance issue"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setRejectModalContractor(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={!rejectReason.trim() || actionLoading === rejectModalContractor.profile_id}
                  onClick={() => handleVerify(rejectModalContractor.profile_id, 'rejected', rejectReason)}
                  className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
