'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Users, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Building2,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile, ContractorDocument } from '@/types/database';

export default function ContractorVettingPage() {
  const [loading, setLoading] = React.useState(true);
  const [contractors, setContractors] = React.useState<ContractorProfile[]>([]);
  const [documents, setDocuments] = React.useState<ContractorDocument[]>([]);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);
  const [filter, setFilter] = React.useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: cData, error: contractorsError } = await supabase
      .from('contractor_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (contractorsError) setError(contractorsError.message);
    setContractors((cData || []) as ContractorProfile[]);

    const { data: docData, error: documentsError } = await supabase
      .from('contractor_documents')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (documentsError) setError(current => current ? `${current}; ${documentsError.message}` : documentsError.message);
    setDocuments((docData || []) as ContractorDocument[]);

    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerifyContractor = async (profileId: string, decision: 'approved' | 'rejected') => {
    setActionLoading(profileId);
    setSuccessMsg('');
    const supabase = createClient();

    try {
      const { error: verificationError } = await supabase.rpc('admin_set_contractor_verification', {
        p_profile_id: profileId,
        p_decision: decision,
        p_rejection_reason: null,
      });
      if (verificationError) throw verificationError;

      setSuccessMsg(`Contractor has been ${decision}!`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update contractor verification.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredContractors = contractors.filter(c => {
    if (filter === 'all') return true;
    return c.verification_status === filter;
  });

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Contractor Vetting & Verification"
      subtitle="Review PCAB credentials, municipal permits, and verify legitimate builders"
      backHref="/admin/dashboard"
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
                ?
              </button>
            </div>
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {(['pending', 'all', 'approved', 'rejected'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  filter === status
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {status} ({contractors.filter(c => status === 'all' ? true : c.verification_status === status).length})
              </button>
            ))}
          </div>
        </div>

        {/* Applications List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Contractor Applications</h2>
            <span className="text-xs text-slate-500">{filteredContractors.length} applications found</span>
          </div>

          {filteredContractors.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No contractors matching "{filter}" status.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredContractors.map((c) => {
                const contractorDocs = documents.filter(d => d.contractor_id === c.profile_id);
                const hasLicenseNumber = Boolean(c.license_no?.trim() || c.pcab_license_no?.trim() || contractorDocs.some((doc) => doc.doc_type === 'license' && doc.doc_number?.trim()));
                const hasLicenseDocument = contractorDocs.some((doc) => doc.doc_type === 'license');
                const canApprove = hasLicenseNumber && hasLicenseDocument;

                return (
                  <div key={c.profile_id} className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{c.business_name}</span>
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
                      <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                        <span>Experience: <strong>{c.years_experience} years</strong></span>
                        <span>•</span>
                        <span>Cities: <strong>{c.service_cities?.join(', ') || '—'}</strong></span>
                        {c.license_no && (
                          <>
                            <span>•</span>
                            <span>PCAB / License: <strong>{c.license_no}</strong></span>
                          </>
                        )}
                      </div>
                      {contractorDocs.length > 0 && (
                        <div className="text-xs text-blue-600 flex items-center gap-1.5 pt-1">
                          <FileText className="w-3.5 h-3.5" />
                          <span>Submitted Documents: {contractorDocs.map(d => d.doc_type).join(', ')}</span>
                        </div>
                      )}
                      {c.verification_status !== 'approved' && !canApprove && (
                        <p className="pt-1 text-xs text-amber-700">
                          Approval requires a license number and an uploaded license document.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {c.verification_status !== 'approved' && (
                        <button
                          onClick={() => handleVerifyContractor(c.profile_id, 'approved')}
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
                          onClick={() => handleVerifyContractor(c.profile_id, 'rejected')}
                          disabled={actionLoading === c.profile_id}
                          className="px-3.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
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
      </div>
    </AppLayout>
  );
}
