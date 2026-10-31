'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Star, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile, ContractorDocument } from '@/types/database';
import { formatDate } from '@/lib/utils/formatters';

function removeUnderscore(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export default function ContractorDetailPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-slate-500">Loading contractor profile...</div>}>
      <ContractorDetailContent />
    </React.Suspense>
  );
}

function ContractorDetailContent() {
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = React.useState(true);
  const [contractor, setContractor] = React.useState<ContractorProfile | null>(null);
  const [documents, setDocuments] = React.useState<ContractorDocument[]>([]);
  const [documentUrls, setDocumentUrls] = React.useState<Record<string, string | null>>({});
  const [actionLoading, setActionLoading] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const loadData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: cData, error: contractorError } = await supabase
      .from('contractor_profiles')
      .select('*, profiles!contractor_profiles_profile_id_fkey(*)')
      .eq('profile_id', id)
      .maybeSingle();
    if (contractorError) setError(contractorError.message);
    setContractor((cData as ContractorProfile | null) || null);

    const { data: docData, error: documentsError } = await supabase
      .from('contractor_documents')
      .select('*')
      .eq('contractor_id', id);
    if (documentsError) setError(current => current ? `${current}; ${documentsError.message}` : documentsError.message);
    setDocuments((docData || []) as ContractorDocument[]);
    const urlResults = await Promise.all((docData || []).map(async (doc) => {
      if (doc.file_path.startsWith('/demo-credentials/')) {
        return [doc.id, doc.file_path] as const;
      }

      const { data, error: urlError } = await supabase.storage
        .from('contractor-docs')
        .createSignedUrl(doc.file_path, 300);
      if (urlError || !data?.signedUrl) {
        const message = urlError?.message || `Unable to create a viewing link for ${doc.doc_title || doc.doc_type}.`;
        setError(current => current ? `${current}; ${message}` : message);
        return [doc.id, null] as const;
      }

      return [doc.id, data.signedUrl] as const;
    }));
    setDocumentUrls(Object.fromEntries(urlResults));

    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerificationDecision = async (decision: 'approved' | 'rejected') => {
    if (!contractor) return;
    setActionLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.rpc('admin_set_contractor_verification', {
        p_profile_id: contractor.profile_id,
        p_decision: decision,
        p_rejection_reason: null,
      });
      if (error) throw error;

      setSuccessMsg(`Contractor has been ${decision}!`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update contractor verification.');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleContractorStatus = async () => {
    if (!contractor) return;
    setActionLoading(true);
    const newStatus = !contractor.is_active;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('contractor_profiles')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('profile_id', contractor.profile_id);
      if (error) throw error;

      setContractor(prev => prev ? { ...prev, is_active: newStatus } : null);
      setSuccessMsg(`Contractor standing updated to ${newStatus ? 'Active' : 'Suspended'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update contractor standing.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout userRole="admin" title="Contractor Profile">
        <div className="p-12 text-center text-xs text-slate-400">Loading contractor profile...</div>
      </AppLayout>
    );
  }

  if (!contractor) {
    return (
      <AppLayout userRole="admin" title="Contractor Not Found" backHref="/admin/contractors" showBackButton={true}>
        <div className="p-12 text-center text-xs text-slate-500">{error ? `Unable to load contractor: ${error}` : 'Contractor record not found.'}</div>
      </AppLayout>
    );
  }

  const isApproved = contractor.verification_status === 'approved';
  const isActive = contractor.is_active;
  const hasLicenseNumber = Boolean(
    contractor.license_no?.trim() ||
    contractor.pcab_license_no?.trim() ||
    documents.some((document) => document.doc_type === 'license' && document.doc_number?.trim())
  );
  const hasLicenseDocument = documents.some((document) => document.doc_type === 'license');
  const canApprove = hasLicenseNumber && hasLicenseDocument;
  const contractorName = contractor.profiles?.full_name || contractor.authorized_representative || contractor.business_name;
  const companyName = contractor.business_name;

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title={contractorName}
      subtitle={`Company: ${companyName} • License: ${contractor.license_no || '—'} • Governance & Oversight`}
      backHref="/admin/contractors"
      showBackButton={true}
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
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Overview Header Card */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{contractorName}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                isApproved
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {isApproved ? 'Verified & Approved' : removeUnderscore(contractor.verification_status)}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {isActive ? 'Active Standing' : 'Suspended'}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-700">
              Company: {companyName}
              {contractor.trade_name && contractor.trade_name !== companyName && (
                <span className="ml-2 text-xs font-normal text-slate-500">({contractor.trade_name})</span>
              )}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
              {contractor.bio || 'No business description provided.'}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleContractorStatus}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  isActive
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isActive ? 'Suspend Firm' : 'Reinstate Firm'}
              </button>

              {!isApproved ? (
                <button
                  onClick={() => handleVerificationDecision('approved')}
                  disabled={actionLoading || !canApprove}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve PCAB</span>
                </button>
              ) : (
                <button
                  onClick={() => handleVerificationDecision('rejected')}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Revoke Approval</span>
                </button>
              )}
            </div>
            {!isApproved && !canApprove && (
              <p className="text-xs text-amber-700">
                Approval requires a license number and an uploaded license document.
              </p>
            )}
          </div>
        </div>

        {/* Profile Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-400">Firm Specifications</h3>
            <div className="text-xs space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Representative:</span>
                <span className="font-bold text-slate-800">{contractor.profiles?.full_name || contractor.authorized_representative || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">PCAB License:</span>
                <span className="font-bold text-slate-900 font-mono">{contractor.license_no || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Experience:</span>
                <span className="font-bold text-slate-800">{contractor.years_experience} Years</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Completed Builds:</span>
                <span className="font-bold text-slate-800">{contractor.projects_completed} Projects</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Platform Rating:</span>
                <span className="font-bold text-amber-600 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{contractor.rating_avg ?? '—'}{contractor.rating_avg !== null && contractor.rating_avg !== undefined ? ' / 5.0' : ''}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 md:col-span-2">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-400">Verified Compliance Credentials</h3>
            {documents.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No documents uploaded yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {documents.map((doc) => {
                  const documentUrl = documentUrls[doc.id];
                  return (
                  <div key={doc.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                        <FileText className="w-4 h-4" />
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        doc.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : doc.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {removeUnderscore(doc.status)}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 text-xs block">{doc.doc_title || `${removeUnderscore(doc.doc_type)} Certificate`}</span>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">Submitted {formatDate(doc.created_at)}</div>
                      {doc.doc_number && (
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{doc.doc_number}</div>
                      )}
                    </div>
                    {documentUrl ? (
                      <a
                        href={documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2"
                      >
                        View / open document
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400">Document unavailable</span>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
