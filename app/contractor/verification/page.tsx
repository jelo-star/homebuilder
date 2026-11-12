'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import {
  ShieldCheck,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Info,
  Calendar,
  Building,
  FileCheck2,
  ChevronRight,
  Award,
  Eye,
  Trash2,
  ExternalLink,
  AlertTriangle,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { optimizeImage } from '@/lib/image-optimization';
import { ContractorProfile, ContractorDocument, DocType } from '@/types/database';
import { capitalize, formatDate } from '@/lib/utils/formatters';

export default function VerificationPage() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [contractor, setContractor] = React.useState<ContractorProfile | null>(null);
  const [documents, setDocuments] = React.useState<ContractorDocument[]>([]);
  const [documentUrls, setDocumentUrls] = React.useState<Record<string, string | null>>({});
  const [previewDocument, setPreviewDocument] = React.useState<{ url: string; title: string } | null>(null);

  // Upload form state
  const [docType, setDocType] = React.useState<DocType>('license');
  const [docTitle, setDocTitle] = React.useState('');
  const [docNumber, setDocNumber] = React.useState('');
  const [issuingAuthority, setIssuingAuthority] = React.useState('');
  const [issueDate, setIssueDate] = React.useState('');
  const [expiryDate, setExpiryDate] = React.useState('');
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = React.useState<string | null>(null);

  const [uploading, setUploading] = React.useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');

  React.useEffect(() => {
    if (!errorMsg && !successMsg) return;
    const t = setTimeout(() => {
      setErrorMsg('');
      setSuccessMsg('');
    }, 4000);
    return () => clearTimeout(t);
  }, [errorMsg, successMsg]);

  React.useEffect(() => {
    let objectUrl: string | null = null;
    const timer = window.setTimeout(() => {
      if (uploadFile?.type.startsWith('image/')) {
        objectUrl = URL.createObjectURL(uploadFile);
        setUploadPreviewUrl(objectUrl);
      } else {
        setUploadPreviewUrl(null);
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uploadFile]);

  const loadData = React.useCallback(async () => {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoadError(authError.message);
      setLoading(false);
      return;
    }

    // 1. Fetch contractor profile
    if (user) {
      const { data: cData, error: contractorError } = await supabase
        .from('contractor_profiles')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle();
      if (contractorError) {
        setLoadError(contractorError.message);
        setLoading(false);
        return;
      }
      setContractor(cData as ContractorProfile | null);
    } else {
      setContractor(null);
    }

    // 2. Fetch documents
    let currentDocs: ContractorDocument[] = [];
    if (user) {
      const { data: docData, error: documentsError } = await supabase
        .from('contractor_documents')
        .select('*')
        .eq('contractor_id', user.id)
        .order('created_at', { ascending: false });
      if (documentsError) {
        setLoadError(documentsError.message);
        setLoading(false);
        return;
      }
      if (docData) currentDocs = docData as ContractorDocument[];
    }
    setDocuments(currentDocs);
      const signedUrls = await Promise.all(currentDocs.map(async (doc) => {
        if (doc.file_path.startsWith('/demo-credentials/')) {
          return { id: doc.id, url: doc.file_path, error: null };
        }

        const { data: signedData, error: signedError } = await supabase.storage
          .from('contractor-docs')
          .createSignedUrl(doc.file_path, 3600);

        return {
          id: doc.id,
          url: signedData?.signedUrl || null,
          error: signedError?.message || (!signedData?.signedUrl ? 'Could not create a secure document preview.' : null),
        };
      }));
      setDocumentUrls(Object.fromEntries(signedUrls.map(item => [item.id, item.url])));
      if (signedUrls.some(item => item.error)) {
        setLoadError('Some document previews could not be loaded. Refresh the page or upload the document again.');
      }

      setLoading(false);
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const handleDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim() || !uploadFile) {
      setErrorMsg('Please provide a document title and select a document file.');
      return;
    }

    setUploading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to submit a verification document.');

      const documentFile = uploadFile.type.startsWith('image/') ? await optimizeImage(uploadFile, 'portfolio') : uploadFile;
      const fileExt = documentFile.name.split('.').pop();
      const storagePath = `${user.id}/${Date.now()}_${docType}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage
        .from('contractor-docs')
        .upload(storagePath, documentFile, { contentType: documentFile.type, upsert: true });
      if (uploadErr) {
        if (uploadErr.message.toLowerCase().includes('bucket not found')) {
          throw new Error('Document storage is not initialized. Run Supabase migration 76_restore_contractor_document_storage.sql, then retry the upload.');
        }
        throw uploadErr;
      }

      const { error: insertErr } = await supabase
        .from('contractor_documents')
        .insert({
          contractor_id: user.id,
          doc_type: docType,
          doc_title: docTitle.trim(),
          doc_number: docNumber.trim() || null,
          issuing_authority: issuingAuthority.trim() || null,
          issue_date: issueDate || null,
          expiry_date: expiryDate || null,
          file_path: storagePath,
          status: 'pending',
        });

      if (insertErr) throw insertErr;

      setSuccessMsg('Document successfully submitted for compliance verification.');
      setDocTitle('');
      setDocNumber('');
      setIssueDate('');
      setExpiryDate('');
      setUploadFile(null);
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setErrorMsg(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDocumentDelete = async (doc: ContractorDocument) => {
    if (deletingDocumentId) return;
    const approvalWarning = doc.status === 'approved'
      ? ' Deleting an approved document will return your contractor verification to pending and require administrator review again.'
      : '';
    if (!window.confirm(`Delete "${doc.doc_title || doc.doc_type}"? This cannot be undone.${approvalWarning}`)) return;

    setDeletingDocumentId(doc.id);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user || user.id !== doc.contractor_id) {
        throw new Error('You are not authorized to delete this document.');
      }

      const { data: deletedDocument, error: deleteError } = await supabase
        .from('contractor_documents')
        .delete()
        .eq('id', doc.id)
        .eq('contractor_id', user.id)
        .neq('status', 'approved')
        .select('id, file_path')
        .maybeSingle();

      if (deleteError) throw deleteError;
      if (!deletedDocument) {
        throw new Error('This document could not be deleted. Apply the latest contractor document permissions migration, then try again.');
      }

      setDocuments(current => current.filter(item => item.id !== doc.id));
      setDocumentUrls(current => {
        const next = { ...current };
        delete next[doc.id];
        return next;
      });

      if (!deletedDocument.file_path.startsWith('/demo-credentials/')) {
        const { error: storageError } = await supabase.storage
          .from('contractor-docs')
          .remove([deletedDocument.file_path]);

        if (storageError) {
          setErrorMsg(`Document record deleted, but the uploaded file could not be removed from storage: ${storageError.message}`);
          return;
        }
      }

      setSuccessMsg(doc.status === 'approved'
        ? 'Document deleted. Contractor verification is now pending administrator review.'
        : 'Document deleted.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete this document.');
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const getDocTypeRequirements = (type: DocType) => {
    switch (type) {
      case 'license':
        return 'Philippine Contractors Accreditation Board (PCAB) License showing category (AAA, AA, A, B, C, D) and principal classification.';
      case 'gov_id':
        return 'Valid government-issued photo ID of the authorized managing officer (Passport, UMID, PRC ID, Driver’s License).';
      case 'permit':
        return 'DTI Business Name Certificate (Sole Proprietorship) or SEC Certificate of Incorporation with Mayor’s/Business Permit.';
      default:
        return 'BIR Form 2303 (Certificate of Registration), DOLE Safety Officer Certification (COSH), or PhilGEPS Certificate.';
    }
  };

  const isImageFile = (filePath: string) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(filePath);

  if (loadError) {
    return (
      <AppLayout userRole="contractor" title="Verification Unavailable" backHref="/contractor/dashboard">
        <div className="p-12 text-center text-red-600">{loadError}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      userRole="contractor"
      title="Contractor Credentials & Vetting"
      subtitle="Manage PCAB licenses, corporate registrations, and compliance certifications"
      backHref="/contractor/dashboard"
    >
      <div className="w-full space-y-6">
        {loadError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{loadError}</div>}
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

        {/* 1. Verified Builder Status Banner */}
        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-start gap-4">
            <div className={`p-3.5 rounded-2xl shrink-0 ${
              contractor?.verification_status === 'approved'
                ? 'bg-emerald-500/10 text-emerald-600 ring-4 ring-emerald-50'
                : contractor?.verification_status === 'rejected'
                ? 'bg-rose-500/10 text-rose-600 ring-4 ring-rose-50'
                : 'bg-amber-500/10 text-amber-600 ring-4 ring-amber-50'
            }`}>
              <ShieldCheck className="w-8 h-8" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">
                  {contractor?.verification_status === 'approved' ? 'Verified Builder Status Active' : 'Account Compliance Review'}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  contractor?.verification_status === 'approved'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : contractor?.verification_status === 'rejected'
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}>
                  {contractor?.verification_status || 'Not registered'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-xl">
                {contractor?.verification_status === 'approved'
                  ? 'Your credentials have been verified by the Platform Owner. Your bids display the official Verified Builder badge with priority matching.'
                  : 'Submit your statutory credentials below. Approved contractors are verified against PCAB and regulatory directories before being permitted to submit binding project bids.'}
              </p>
            </div>
          </div>
        </div>

        {/* 2. Document Submission Form */}
        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-600" />
              Upload New Credential or License
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Submit digital copies of legal registrations. High-resolution PDF, JPG, and PNG files up to 15MB are accepted.
            </p>
          </div>

          <form onSubmit={handleDocumentSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Document Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={docType}
                  onChange={(e) => {
                    const val = e.target.value as DocType;
                    setDocType(val);
                    if (val === 'license') setIssuingAuthority('PCAB / CIAP');
                    else if (val === 'permit') setIssuingAuthority('LGU / DTI / SEC');
                    else if (val === 'gov_id') setIssuingAuthority('DFA / PSA / PRC / LTO');
                    else setIssuingAuthority('BIR / DOLE');
                  }}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="license">PCAB Contractor License</option>
                  <option value="permit">DTI / SEC Registration & Mayor’s Permit</option>
                  <option value="gov_id">Authorized Representative Government ID</option>
                  <option value="other">BIR 2303 / Tax Clearance / DOLE Safety Cert</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  {getDocTypeRequirements(docType)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Document Name / Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Enter document title"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Registration / License No.
                </label>
                <input
                  type="text"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  placeholder="Enter document number"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Issuing Authority
                </label>
                <input
                  type="text"
                  value={issuingAuthority}
                  onChange={(e) => setIssuingAuthority(e.target.value)}
                  placeholder="Enter issuing authority"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Date of Issue
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Expiration / Renewal Date
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* File Upload Box */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Attach Document File (PDF or Image)
              </label>
              <div className="border border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
                <input
                  type="file"
                  id="credential-upload"
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label htmlFor="credential-upload" className="cursor-pointer block">
                  {uploadFile ? (
                    <div className="flex flex-col items-center gap-3 text-xs font-bold text-blue-600">
                      {uploadPreviewUrl ? (
                        <img
                          src={uploadPreviewUrl}
                          alt={`Preview of ${uploadFile.name}`}
                          className="max-h-64 max-w-full rounded-lg border border-slate-200 object-contain"
                        />
                      ) : (
                        <FileCheck2 className="w-8 h-8 text-emerald-600" />
                      )}
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                        <span className="text-[10px] text-slate-400 font-normal">Click to change</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-600 flex items-center justify-center gap-2">
                      <Upload className="w-4 h-4 text-slate-400" />
                      <span>Click to select PDF or image scan of credential</span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={uploading || !docTitle.trim()}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover:shadow disabled:opacity-50 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>{uploading ? 'Submitting Credential...' : 'Submit Credential for Review'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* 3. Submitted documents */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Submitted Compliance Records</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Documents submitted for contractor verification</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{documents.length} Records</span>
          </div>

          {documents.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-2">
              <Building className="w-8 h-8 text-slate-300 mx-auto" />
              <div>No credential documents submitted yet.</div>
              <p className="text-[11px] text-slate-400">Upload your PCAB license above to unlock project bidding privileges.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <div key={doc.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs hover:bg-slate-50/50 transition-colors">
                  <div className="flex min-w-0 items-center gap-4">
                    {/* Document Preview Thumbnail */}
                    {isImageFile(doc.file_path) && documentUrls[doc.id] ? (
                      <button
                        type="button"
                        onClick={() => setPreviewDocument({
                          url: documentUrls[doc.id]!,
                          title: doc.doc_title || doc.doc_type.replace(/_/g, ' '),
                        })}
                        aria-label={`Preview ${doc.doc_title || doc.doc_type}`}
                        className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 group relative cursor-pointer"
                      >
                        <img
                          src={documentUrls[doc.id] || ''}
                          alt="Uploaded verification document"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Eye className="w-4 h-4" />
                        </div>
                      </button>
                    ) : (
                      <div
                        role="img"
                        aria-label={isImageFile(doc.file_path) ? 'Image preview unavailable' : 'PDF document'}
                        className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"
                      >
                        {isImageFile(doc.file_path)
                          ? <Eye className="w-5 h-5" />
                          : <FileText className="w-7 h-7" />}
                      </div>
                    )}
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {doc.doc_title || doc.doc_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {doc.doc_type.replace(/_/g, ' ')}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          doc.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : doc.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {doc.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        {doc.doc_number && <span>Document No.: <strong className="font-mono">{doc.doc_number}</strong></span>}
                        {doc.issuing_authority && <span>Issued by: {doc.issuing_authority}</span>}
                        {doc.issue_date && <span>Issued: {formatDate(doc.issue_date)}</span>}
                        {doc.expiry_date && <span>Expires: {formatDate(doc.expiry_date)}</span>}
                        <span>Submitted: {formatDate(doc.created_at)}</span>
                      </div>
                      {doc.reject_reason && (
                        <div className="flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span><strong>Review feedback:</strong> {doc.reject_reason}</span>
                        </div>
                      )}
                      {documentUrls[doc.id] && !isImageFile(doc.file_path) && (
                        <a
                          href={documentUrls[doc.id] || undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View document
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      disabled={deletingDocumentId === doc.id}
                      onClick={() => void handleDocumentDelete(doc)}
                      aria-label={`Delete ${doc.doc_title || doc.doc_type}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingDocumentId === doc.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {previewDocument && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          onClick={() => setPreviewDocument(null)}
          role="dialog"
          aria-modal="true"
          aria-label={previewDocument.title}
        >
          <button
            type="button"
            onClick={() => setPreviewDocument(null)}
            aria-label="Close document preview"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={previewDocument.url}
            alt={previewDocument.title}
            onClick={event => event.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </AppLayout>
  );
}
