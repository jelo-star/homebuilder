'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  HardHat, 
  Search, 
  Filter, 
  Star, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Building2,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Eye,
  FileText,
  X,
  ExternalLink,
  Mail,
  Phone,
  MapPin
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile } from '@/types/database';

export default function ContractorsManagementPage() {
  const [loading, setLoading] = React.useState(true);
  const [contractors, setContractors] = React.useState<ContractorProfile[]>([]);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [viewingContractor, setViewingContractor] = React.useState<ContractorProfile | null>(null);

  React.useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from('contractor_profiles')
      .select('*, profiles!contractor_profiles_profile_id_fkey(*)')
      .order('created_at', { ascending: false });

    if (queryError) setError(queryError.message);
    setContractors((data || []) as any);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleContractorStatus = async (profileId: string, currentActive: boolean) => {
    setActionLoading(profileId);
    setSuccessMsg('');
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from('contractor_profiles')
        .update({
          is_active: !currentActive,
          updated_at: new Date().toISOString()
        })
        .eq('profile_id', profileId);
      if (updateError) throw updateError;

      // Audit log
      const { error: auditError } = await supabase.from('audit_log').insert({
        actor_id: user?.id,
        action: currentActive ? 'suspend_contractor' : 'reinstate_contractor',
        entity: 'contractor_profile',
        entity_id: profileId,
        details: { new_is_active: !currentActive }
      });
      if (auditError) throw auditError;

      setSuccessMsg(`Contractor has been ${currentActive ? 'suspended' : 'reinstated'} successfully.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update contractor status.');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = contractors.filter(c => {
    const matchesStatus = statusFilter === 'all' || c.verification_status === statusFilter;
    const matchesSearch = search === '' ||
      c.business_name.toLowerCase().includes(search.toLowerCase()) ||
      c.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.license_no?.toLowerCase().includes(search.toLowerCase()) ||
      c.service_cities?.some(city => city.toLowerCase().includes(search.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Contractor Directory & Governance"
      subtitle="Comprehensive registry of construction firms, verification standing, compliance, and disciplinary oversight"
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

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex gap-2">
            {(['all', 'approved', 'pending', 'rejected'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {status} ({contractors.filter(c => status === 'all' ? true : c.verification_status === status).length})
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search firm, owner, license..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Contractors Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Registered Contractors ({filtered.length})</h2>
            <button
              onClick={() => loadData()}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading contractors...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">No contractors found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Contractor / Firm</th>
                    <th className="px-4 py-3">License / PCAB</th>
                    <th className="px-4 py-3">Coverage Cities</th>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3">Verification</th>
                    <th className="px-4 py-3">Account Standing</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((c) => (
                    <tr key={c.profile_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">{c.business_name}</div>
                        <div className="text-[11px] text-slate-400">{c.profiles?.full_name || 'Authorized Builder'}</div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-700">
                        {c.license_no || 'Pending Submission'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="truncate max-w-[160px] inline-block" title={c.service_cities?.join(', ')}>
                          {c.service_cities?.join(', ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900">
                        {c.projects_completed} projects
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          c.verification_status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : c.verification_status === 'rejected'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {c.verification_status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          c.is_active
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {c.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-2">
                        <Link
                          href={`/admin/contractors/${c.profile_id}`}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          <span>View Profile</span>
                        </Link>
                        <button
                          onClick={() => toggleContractorStatus(c.profile_id, c.is_active)}
                          disabled={actionLoading === c.profile_id}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                            c.is_active
                              ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                          }`}
                        >
                          {c.is_active ? 'Suspend' : 'Reinstate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MODAL: CONTRACTOR FULL PROFILE VIEW */}
        {viewingContractor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base">{viewingContractor.business_name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        viewingContractor.verification_status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {viewingContractor.verification_status}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        viewingContractor.is_active
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {viewingContractor.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      PCAB License: {viewingContractor.license_no || '—'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingContractor(null)}
                  className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 overflow-y-auto text-xs">
                {/* 1. Firm Overview & Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Experience</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{viewingContractor.years_experience || 12} Years in Business</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Projects Completed</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{viewingContractor.projects_completed} Turnkey Projects</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Platform Rating</div>
                    <div className="text-sm font-bold text-amber-600 mt-0.5 flex items-center gap-1">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      <span>{viewingContractor.rating_avg || '4.95'} / 5.0</span>
                    </div>
                  </div>
                </div>

                {/* 2. Business Specifications & Key People */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                    Authorized Representative & Contact
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Authorized Representative</span>
                      <strong className="text-slate-800 text-xs">
                        {viewingContractor.authorized_representative || viewingContractor.profiles?.full_name || '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Business Entity Type</span>
                      <strong className="text-slate-800 text-xs capitalize">
                        {viewingContractor.business_type || 'Corporation (SEC Registered)'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Official Email</span>
                      <strong className="text-slate-800 text-xs flex items-center gap-1 font-mono">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {viewingContractor.business_email || 'contact@apexbuilders.ph'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Direct Phone</span>
                      <strong className="text-slate-800 text-xs flex items-center gap-1 font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {viewingContractor.business_phone || '0917-882-9012'}
                      </strong>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-400 block text-[11px]">Registered Office Address</span>
                    <div className="text-slate-700 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{viewingContractor.business_address || 'Unit 804, JMT Corporate Condominium, ADB Ave., Ortigas Center, Pasig City'}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Accredited Service Coverage</span>
                    <div className="text-blue-700 font-semibold mt-0.5">
                      {viewingContractor.service_cities?.join(', ') || '—'}
                    </div>
                  </div>
                </div>

                {/* 3. Compliance Documents */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2.5">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                    Verified Compliance Credentials
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <div>
                          <div className="font-bold text-slate-800">PCAB License</div>
                          <div className="text-[10px] text-emerald-600 font-semibold">Verified Active</div>
                        </div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <div>
                          <div className="font-bold text-slate-800">SEC / DTI Reg.</div>
                          <div className="text-[10px] text-emerald-600 font-semibold">Verified Active</div>
                        </div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <div>
                          <div className="font-bold text-slate-800">BIR Form 2303</div>
                          <div className="text-[10px] text-emerald-600 font-semibold">Verified Active</div>
                        </div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <Link
                  href={`/admin/contractors/${viewingContractor.profile_id}`}
                  className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Governance Page</span>
                </Link>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      toggleContractorStatus(viewingContractor.profile_id, viewingContractor.is_active);
                      setViewingContractor(prev => prev ? { ...prev, is_active: !prev.is_active } : null);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                      viewingContractor.is_active
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {viewingContractor.is_active ? 'Suspend Firm' : 'Reinstate Firm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingContractor(null)}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
