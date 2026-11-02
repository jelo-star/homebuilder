'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile, HouseType, Profile, UserRole } from '@/types/database';
import { KeyRound, Pencil, RefreshCw, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import { formatDate, formatNumberInput, parseNumberInput } from '@/lib/utils/formatters';
import { useToast } from '@/components/ui/ToastProvider';

interface AdminManagedProfile extends Profile {
  email?: string | null;
}

const PAGE_SIZE = 25;

export default function AdminUsersPage() {
  const { showToast } = useToast();
  const [profiles, setProfiles] = React.useState<AdminManagedProfile[]>([]);
  const [contractorProfiles, setContractorProfiles] = React.useState<Record<string, ContractorProfile>>({});
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [totalProfiles, setTotalProfiles] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<UserRole>('homeowner');
  const [phone, setPhone] = React.useState('');
  const [city, setCity] = React.useState('');
  const [businessName, setBusinessName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [passwordConfirmation, setPasswordConfirmation] = React.useState('');
  const [editingProfile, setEditingProfile] = React.useState<Profile | null>(null);
  const [editFullName, setEditFullName] = React.useState('');
  const [editPhone, setEditPhone] = React.useState('');
  const [editCity, setEditCity] = React.useState('');
  const [editAddress, setEditAddress] = React.useState('');
  const [editContractor, setEditContractor] = React.useState<ContractorProfile | null>(null);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [deletingProfileId, setDeletingProfileId] = React.useState<string | null>(null);

  const loadProfiles = React.useCallback(async (requestedPage = page) => {
    const supabase = createClient();
    setLoading(true);
    const { data, count, error: loadError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((requestedPage - 1) * PAGE_SIZE, requestedPage * PAGE_SIZE - 1);

    if (loadError) {
      showToast(loadError.message, 'error', 'Profiles Could Not Load');
      setProfiles([]);
      setTotalProfiles(0);
      setLoading(false);
    } else {
      setProfiles((data || []) as Profile[]);
      setTotalProfiles(count || 0);

      const lastPage = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));
      if (requestedPage > lastPage) {
        setPage(lastPage);
        setLoading(false);
        return;
      }

      const profileIds = (data || []).map(profile => profile.id);
      const { data: contractorData, error: contractorError } = profileIds.length
        ? await supabase.from('contractor_profiles').select('*').in('profile_id', profileIds)
        : { data: [], error: null };

      if (contractorError) {
        showToast(contractorError.message, 'error', 'Contractor Details Could Not Load');
        setContractorProfiles({});
      } else {
        setContractorProfiles(Object.fromEntries(
          (contractorData || []).map(contractor => [contractor.profile_id, contractor as ContractorProfile])
        ));
      }
      setLoading(false);
    }
  }, [page, showToast]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfiles();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfiles]);

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);

    try {
      if (password.length < 8 || password.length > 72) {
        throw new Error('Initial password must be between 8 and 72 characters.');
      }
      if (password !== passwordConfirmation) {
        throw new Error('Initial password and confirmation do not match.');
      }

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, role, phone, city, businessName, password }),
      });
      const result = await response.json() as { error?: string; user?: { email?: string; role?: UserRole } };
      if (!response.ok) throw new Error(result.error || 'Account could not be created.');

      showToast(
        `Created the ${result.user?.role || role} account for ${result.user?.email || email}. Share the initial password securely; the user can change it in Account Security.`,
        'success',
        'Account Created'
      );
      setFullName('');
      setEmail('');
      setRole('homeowner');
      setPhone('');
      setCity('');
      setBusinessName('');
      setPassword('');
      setPasswordConfirmation('');
      if (page === 1) await loadProfiles();
      else setPage(1);
    } catch (createError) {
      showToast(
        createError instanceof Error ? createError.message : 'Account could not be created.',
        'error',
        'Account Creation Failed'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRefresh = () => {
    void loadProfiles();
  };

  const handleEditProfile = (profile: Profile) => {
    setEditingProfile(profile);
    setEditFullName(profile.full_name);
    setEditPhone(profile.phone || '');
    setEditCity(profile.city || '');
    setEditAddress(profile.address || '');
    setEditContractor(profile.role === 'contractor'
      ? contractorProfiles[profile.id] || {
        profile_id: profile.id,
        business_name: '',
        years_experience: 0,
        service_cities: [],
        specialties: [],
        finish_levels: [],
        work_types: [],
        verification_status: 'pending',
        rating_avg: 0,
        rating_count: 0,
        projects_completed: 0,
        is_active: true,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      }
      : null);
  };

  const toggleContractorOption = (field: 'specialties' | 'finish_levels' | 'work_types', value: string) => {
    setEditContractor(current => {
      if (!current) return current;
      if (field === 'specialties') {
        const option = value as HouseType;
        return {
          ...current,
          specialties: current.specialties.includes(option)
            ? current.specialties.filter(item => item !== option)
            : [...current.specialties, option],
        };
      }
      if (field === 'finish_levels') {
        const option = value as ContractorProfile['finish_levels'][number];
        return {
          ...current,
          finish_levels: current.finish_levels.includes(option)
            ? current.finish_levels.filter(item => item !== option)
            : [...current.finish_levels, option],
        };
      }
      const option = value as ContractorProfile['work_types'][number];
      return {
        ...current,
        work_types: current.work_types.includes(option)
          ? current.work_types.filter(item => item !== option)
          : [...current.work_types, option],
      };
    });
  };

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProfile) return;

    setSavingProfile(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProfile.id,
          fullName: editFullName,
          phone: editPhone,
          city: editCity,
          address: editAddress,
          contractorProfile: editContractor ? {
            business_name: editContractor.business_name,
            trade_name: editContractor.trade_name || '',
            business_type: editContractor.business_type || '',
            authorized_representative: editContractor.authorized_representative || '',
            business_email: editContractor.business_email || '',
            business_phone: editContractor.business_phone || '',
            business_address: editContractor.business_address || '',
            province: editContractor.province || '',
            bio: editContractor.bio || '',
            years_experience: editContractor.years_experience,
            team_capacity: editContractor.team_capacity || '',
            pcab_category: editContractor.pcab_category || '',
            pcab_license_no: editContractor.pcab_license_no || editContractor.license_no || '',
            pcab_expiration_date: editContractor.pcab_expiration_date || '',
            dti_sec_no: editContractor.dti_sec_no || '',
            bir_tin: editContractor.bir_tin || '',
            service_cities: editContractor.service_cities,
            specialties: editContractor.specialties,
            finish_levels: editContractor.finish_levels,
            work_types: editContractor.work_types,
            min_project_budget: editContractor.min_project_budget || '',
            max_project_budget: editContractor.max_project_budget || '',
          } : undefined,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Profile could not be updated.');

      showToast('Profile details were updated.', 'success', 'Profile Updated');
      setEditingProfile(null);
      await loadProfiles();
    } catch (saveError) {
      showToast(
        saveError instanceof Error ? saveError.message : 'Profile could not be updated.',
        'error',
        'Update Failed'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (profile: Profile) => {
    if (!window.confirm(`Permanently delete ${profile.full_name}'s account? This cannot be undone.`)) return;

    setDeletingProfileId(profile.id);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: profile.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Account could not be deleted.');

      showToast(`${profile.full_name}'s account was permanently deleted.`, 'success', 'Account Deleted');
      await loadProfiles();
    } catch (deleteError) {
      showToast(
        deleteError instanceof Error ? deleteError.message : 'Account could not be deleted.',
        'error',
        'Delete Failed'
      );
    } finally {
      setDeletingProfileId(null);
    }
  };

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="User Accounts"
      subtitle="Create homeowner, contractor, and administrator accounts"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Create a user account</h2>
              <p className="text-xs text-slate-500">Set an initial password and share it with the user through a secure channel.</p>
            </div>
          </div>

          <form onSubmit={handleCreateUser} className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
            <label className="space-y-1.5 font-semibold text-slate-700">
              Full name *
              <input required maxLength={160} value={fullName} onChange={event => setFullName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900" />
            </label>
            <label className="space-y-1.5 font-semibold text-slate-700">
              Email address *
              <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900" />
            </label>
            <label className="space-y-1.5 font-semibold text-slate-700">
              Initial password *
              <input required type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900" />
              <span className="block font-normal text-slate-500">Use at least 8 characters. The user can change it after signing in.</span>
            </label>
            <label className="space-y-1.5 font-semibold text-slate-700">
              Confirm initial password *
              <input required type="password" autoComplete="new-password" minLength={8} maxLength={72} value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900" />
            </label>
            <label className="space-y-1.5 font-semibold text-slate-700">
              Account role *
              <select value={role} onChange={event => setRole(event.target.value as UserRole)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal text-slate-900">
                <option value="homeowner">Homeowner</option>
                <option value="contractor">Contractor</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            {role === 'contractor' && (
              <label className="space-y-1.5 font-semibold text-slate-700">
                Business name *
                <input required maxLength={200} value={businessName} onChange={event => setBusinessName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900" />
              </label>
            )}
            <label className="space-y-1.5 font-semibold text-slate-700">
              Phone
              <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900" />
            </label>
            <label className="space-y-1.5 font-semibold text-slate-700">
              City
              <input value={city} onChange={event => setCity(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900" />
            </label>
            <div className="sm:col-span-2">
              {role === 'admin' && (
                <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Administrator accounts have full platform access. Only invite trusted staff.
                </p>
              )}
              <button type="submit" disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                <KeyRound className="h-4 w-4" />
                {creating ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Users className="h-4 w-4 text-blue-600" />
              Registered profiles ({totalProfiles})
            </h2>
            <button type="button" onClick={handleRefresh} disabled={loading} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          {loading ? (
            <div className="p-10 text-center text-xs text-slate-400">Loading profiles…</div>
          ) : profiles.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">No user profiles found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">City</th>
                      <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profiles.map(profile => (
                    <tr key={profile.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{profile.full_name}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">{profile.role}</td>
                      <td className="px-4 py-3 text-slate-600">{profile.city || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(profile.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditProfile(profile)}
                            aria-label={`Edit ${profile.full_name}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteProfile(profile)}
                            disabled={deletingProfileId === profile.id}
                            aria-label={`Delete ${profile.full_name}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingProfileId === profile.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalProfiles > 0 && !loading && (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalProfiles)} of {totalProfiles} profiles
              </span>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPage(currentPage => Math.max(1, currentPage - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span>Page {page} of {Math.max(1, Math.ceil(totalProfiles / PAGE_SIZE))}</span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage => Math.min(Math.ceil(totalProfiles / PAGE_SIZE), currentPage + 1))}
                  disabled={page >= Math.ceil(totalProfiles / PAGE_SIZE)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="edit-profile-title" className="text-base font-bold text-slate-900">Edit profile</h2>
                <p className="mt-1 text-xs capitalize text-slate-500">{editingProfile.role} account</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                aria-label="Close edit profile dialog"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5 font-semibold text-slate-700">
                Full name *
                <input
                  required
                  maxLength={160}
                  value={editFullName}
                  onChange={event => setEditFullName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                />
              </label>
              <label className="block space-y-1.5 font-semibold text-slate-700">
                Phone
                <input
                  type="tel"
                  maxLength={40}
                  value={editPhone}
                  onChange={event => setEditPhone(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                />
              </label>
              <label className="block space-y-1.5 font-semibold text-slate-700">
                City
                <input
                  maxLength={120}
                  value={editCity}
                  onChange={event => setEditCity(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                />
              </label>
              <label className="block space-y-1.5 font-semibold text-slate-700">
                Address
                <input
                  maxLength={300}
                  value={editAddress}
                  onChange={event => setEditAddress(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                />
              </label>
              </div>
              {editingProfile.role === 'contractor' && editContractor && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <h3 className="font-bold text-slate-900">Contractor business details</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      ['business_name', 'Registered business name'],
                      ['trade_name', 'Trading name'],
                      ['authorized_representative', 'Authorized representative'],
                      ['business_email', 'Business email'],
                      ['business_phone', 'Business phone'],
                      ['business_address', 'Business address'],
                      ['province', 'Province'],
                      ['pcab_category', 'PCAB category'],
                      ['pcab_license_no', 'PCAB license number'],
                      ['dti_sec_no', 'DTI / SEC certificate number'],
                      ['bir_tin', 'BIR TIN'],
                    ] as const).map(([field, label]) => (
                      <label key={field} className="block space-y-1.5 font-semibold text-slate-700">
                        {label}{field === 'business_name' ? ' *' : ''}
                        <input
                          required={field === 'business_name'}
                          maxLength={field === 'business_name' ? 200 : 300}
                          type={field === 'business_email' ? 'email' : 'text'}
                          value={editContractor[field] || ''}
                          onChange={event => setEditContractor({ ...editContractor, [field]: event.target.value })}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                        />
                      </label>
                    ))}
                    <label className="block space-y-1.5 font-semibold text-slate-700">
                      PCAB license expiry date
                      <input
                        type="date"
                        value={editContractor.pcab_expiration_date?.slice(0, 10) || ''}
                        onChange={event => setEditContractor({ ...editContractor, pcab_expiration_date: event.target.value || null })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                      />
                    </label>
                    <label className="block space-y-1.5 font-semibold text-slate-700">
                      Legal structure
                      <select
                        value={editContractor.business_type || ''}
                        onChange={event => setEditContractor({ ...editContractor, business_type: event.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal text-slate-900"
                      >
                        <option value="">Not specified</option>
                        <option value="sole_proprietorship">Sole proprietorship</option>
                        <option value="partnership">Partnership</option>
                        <option value="corporation">Corporation</option>
                        <option value="cooperative">Cooperative / joint venture</option>
                      </select>
                    </label>
                    <label className="block space-y-1.5 font-semibold text-slate-700">
                      Years in business
                      <input
                        type="number"
                        min={0}
                        max={150}
                        value={editContractor.years_experience}
                        onChange={event => setEditContractor({ ...editContractor, years_experience: Number(event.target.value) })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                      />
                    </label>
                    <label className="block space-y-1.5 font-semibold text-slate-700">
                      Team capacity
                      <input
                        type="number"
                        min={1}
                        value={editContractor.team_capacity || ''}
                        onChange={event => setEditContractor({ ...editContractor, team_capacity: event.target.value ? Number(event.target.value) : undefined })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                      />
                    </label>
                    <label className="block space-y-1.5 font-semibold text-slate-700">
                      Minimum project budget
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatNumberInput(String(editContractor.min_project_budget || ''))}
                        onChange={event => setEditContractor({
                          ...editContractor,
                          min_project_budget: event.target.value ? parseNumberInput(formatNumberInput(event.target.value)) : undefined,
                        })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                      />
                    </label>
                    <label className="block space-y-1.5 font-semibold text-slate-700">
                      Maximum project budget
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatNumberInput(String(editContractor.max_project_budget || ''))}
                        onChange={event => setEditContractor({
                          ...editContractor,
                          max_project_budget: event.target.value ? parseNumberInput(formatNumberInput(event.target.value)) : undefined,
                        })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                      />
                    </label>
                    <label className="block space-y-1.5 font-semibold text-slate-700 sm:col-span-2">
                      Company bio
                      <textarea
                        rows={3}
                        maxLength={3000}
                        value={editContractor.bio || ''}
                        onChange={event => setEditContractor({ ...editContractor, bio: event.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                      />
                    </label>
                    <label className="block space-y-1.5 font-semibold text-slate-700 sm:col-span-2">
                      Service cities (one per line)
                      <textarea
                        rows={3}
                        value={(editContractor.service_cities || []).join('\n')}
                        onChange={event => setEditContractor({
                          ...editContractor,
                          service_cities: [...new Set(event.target.value.split(/\n|,/).map(city => city.trim()).filter(Boolean))],
                        })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900"
                      />
                    </label>
                  </div>
                  {([
                    ['specialties', 'Accepted house types', [
                      ['one_storey', 'One-storey'],
                      ['two_storey', 'Two-storey'],
                      ['townhouse', 'Townhouse'],
                    ]],
                    ['finish_levels', 'Finish levels', [
                      ['basic', 'Basic'],
                      ['standard', 'Standard'],
                      ['premium', 'Premium'],
                    ]],
                    ['work_types', 'Accepted work types', [
                      ['new_build', 'New build'],
                      ['renovation', 'Renovation'],
                      ['extension', 'Extension'],
                    ]],
                  ] as const).map(([field, label, options]) => (
                    <fieldset key={field}>
                      <legend className="mb-2 font-semibold text-slate-700">{label}</legend>
                      <div className="flex flex-wrap gap-3">
                        {options.map(([value, optionLabel]) => {
                          const checked = field === 'specialties'
                            ? editContractor.specialties.includes(value as HouseType)
                            : field === 'finish_levels'
                              ? editContractor.finish_levels.includes(value as ContractorProfile['finish_levels'][number])
                              : editContractor.work_types.includes(value as ContractorProfile['work_types'][number]);
                          return (
                            <label key={value} className="inline-flex items-center gap-1.5 text-slate-600">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleContractorOption(field, value)}
                              />
                              {optionLabel}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  disabled={savingProfile}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingProfile ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </AppLayout>
  );
}
