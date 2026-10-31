'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  ShieldCheck, 
  Award, 
  Briefcase, 
  Users, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  FileCheck,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ContractorProfile, HouseType, FinishLevel, WorkType } from '@/types/database';
import { formatCurrency } from '@/lib/utils/formatters';

export default function ContractorProfilePage() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');
  const [activeProfileSection, setActiveProfileSection] = React.useState<'personal' | 'business' | 'contact' | 'matching'>('personal');
  const [accountEmail, setAccountEmail] = React.useState('');
  const [personalName, setPersonalName] = React.useState('');
  const [personalPhone, setPersonalPhone] = React.useState('');
  const [personalCity, setPersonalCity] = React.useState('');
  const [personalAddress, setPersonalAddress] = React.useState('');

  React.useEffect(() => {
    if (!errorMsg && !successMsg) return;
    const t = setTimeout(() => {
      setErrorMsg('');
      setSuccessMsg('');
    }, 4000);
    return () => clearTimeout(t);
  }, [errorMsg, successMsg]);

  // Business profile form state
  const [businessName, setBusinessName] = React.useState('');
  const [tradeName, setTradeName] = React.useState('');
  const [businessType, setBusinessType] = React.useState('');
  const [authorizedRep, setAuthorizedRep] = React.useState('');
  const [businessEmail, setBusinessEmail] = React.useState('');
  const [businessPhone, setBusinessPhone] = React.useState('');
  const [businessAddress, setBusinessAddress] = React.useState('');
  const [province, setProvince] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [yearsExperience, setYearsExperience] = React.useState(0);
  const [teamCapacity, setTeamCapacity] = React.useState(0);
  const [pcabCategory, setPcabCategory] = React.useState('');
  const [pcabLicenseNo, setPcabLicenseNo] = React.useState('');
  const [pcabExpirationDate, setPcabExpirationDate] = React.useState('');
  const [dtiSecNo, setDtiSecNo] = React.useState('');
  const [birTin, setBirTin] = React.useState('');

  // Service coverage and specialties
  const [serviceCities, setServiceCities] = React.useState<string[]>([]);
  const [cityInput, setCityInput] = React.useState('');
  const [specialties, setSpecialties] = React.useState<HouseType[]>([]);
  const [finishLevels, setFinishLevels] = React.useState<FinishLevel[]>([]);
  const [workTypes, setWorkTypes] = React.useState<WorkType[]>([]);
  const [minBudget, setMinBudget] = React.useState<number>(0);
  const [maxBudget, setMaxBudget] = React.useState<number>(0);

  // Verification & rating metrics (read-only for security)
  const [contractor, setContractor] = React.useState<ContractorProfile | null>(null);

  const loadData = React.useCallback(async () => {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoadError(authError.message);
      setLoading(false);
      return;
    }

    if (user) {
    setAccountEmail(user.email || '');
    const { data, error } = await supabase
        .from('contractor_profiles')
      .select('*, profiles!contractor_profiles_profile_id_fkey(*)')
        .eq('profile_id', user.id)
        .maybeSingle();
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      if (data) {
        const c = data as ContractorProfile;
        setContractor(c);
        setPersonalName(c.profiles?.full_name || '');
        setPersonalPhone(c.profiles?.phone || '');
        setPersonalCity(c.profiles?.city || '');
        setPersonalAddress(c.profiles?.address || '');
        setBusinessName(c.business_name || '');
        setTradeName(c.trade_name || '');
        setBusinessType(c.business_type || '');
        setAuthorizedRep(c.authorized_representative || c.profiles?.full_name || '');
        setBusinessEmail(c.business_email || '');
        setBusinessPhone(c.business_phone || c.profiles?.phone || '');
        setBusinessAddress(c.business_address || '');
        setProvince(c.province || '');
        setBio(c.bio || '');
        setYearsExperience(c.years_experience || 0);
        setTeamCapacity(c.team_capacity || 0);
        setPcabCategory(c.pcab_category || '');
        setPcabLicenseNo(c.pcab_license_no || c.license_no || '');
        setPcabExpirationDate(c.pcab_expiration_date || '');
        setDtiSecNo(c.dti_sec_no || '');
        setBirTin(c.bir_tin || '');
        setServiceCities(c.service_cities || []);
        setSpecialties(c.specialties || []);
        setFinishLevels(c.finish_levels || []);
        setWorkTypes(c.work_types || []);
        setMinBudget(c.min_project_budget || 0);
        setMaxBudget(c.max_project_budget || 0);
      }
    }

    setLoading(false);
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const handleAddCity = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && cityInput.trim()) {
      e.preventDefault();
      const trimmed = cityInput.trim();
      if (!serviceCities.includes(trimmed)) {
        setServiceCities([...serviceCities, trimmed]);
      }
      setCityInput('');
    }
  };

  const handleRemoveCity = (cityToRemove: string) => {
    setServiceCities(serviceCities.filter(c => c !== cityToRemove));
  };

  const toggleSpecialty = (item: HouseType) => {
    setSpecialties(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
  };

  const toggleFinishLevel = (item: FinishLevel) => {
    setFinishLevels(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
  };

  const toggleWorkType = (item: WorkType) => {
    setWorkTypes(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personalName.trim()) {
      setActiveProfileSection('personal');
      setErrorMsg('Full name is required.');
      return;
    }
    if (!businessName.trim()) {
      setActiveProfileSection('business');
      setErrorMsg('Registered business name is required.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Sign in to save your contractor profile.');

      const profileUpdates = {
        business_name: businessName.trim(),
        trade_name: tradeName.trim() || null,
        business_type: businessType || null,
        authorized_representative: authorizedRep.trim() || null,
        business_email: businessEmail.trim() || null,
        business_phone: businessPhone.trim() || null,
        business_address: businessAddress.trim() || null,
        province: province || null,
        bio: bio.trim() || null,
        years_experience: Number(yearsExperience) || 0,
        team_capacity: Number(teamCapacity) || null,
        pcab_category: pcabCategory || null,
        pcab_license_no: pcabLicenseNo.trim() || null,
        pcab_expiration_date: pcabExpirationDate || null,
        license_no: pcabLicenseNo.trim() || null,
        dti_sec_no: dtiSecNo.trim() || null,
        bir_tin: birTin.trim() || null,
        service_cities: serviceCities,
        specialties,
        finish_levels: finishLevels,
        work_types: workTypes,
        min_project_budget: Number(minBudget) || null,
        max_project_budget: Number(maxBudget) || null,
        updated_at: new Date().toISOString(),
      };

      if (contractor) {
        const updateResult = await supabase
          .from('contractor_profiles')
          .update(profileUpdates)
          .eq('profile_id', user.id)
          .select('profile_id')
          .maybeSingle();

        if (updateResult.error) throw updateResult.error;
        if (!updateResult.data) {
          throw new Error(
            'Your contractor profile was not updated. Apply Supabase migration 84 to restore the contractor profile update policy, then try again.'
          );
        }
      } else {
        const insertResult = await supabase
          .from('contractor_profiles')
          .insert({ ...profileUpdates, profile_id: user.id })
          .select('profile_id')
          .maybeSingle();
        if (insertResult.error) throw insertResult.error;
        if (!insertResult.data) {
          throw new Error('No contractor profile was created. Check that you are signed in to the contractor account that owns this profile.');
        }
      }

      const { error: personalProfileError } = await supabase
        .from('profiles')
        .update({
          full_name: personalName.trim(),
          phone: personalPhone.trim() || null,
          city: personalCity.trim() || null,
          address: personalAddress.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (personalProfileError) {
        throw new Error(`Business details were saved, but personal contact details could not be updated: ${personalProfileError.message}`);
      }

      setSuccessMsg('Business profile details updated successfully.');
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? [
              err.message,
              'details' in err && typeof err.details === 'string' ? err.details : '',
              'hint' in err && typeof err.hint === 'string' ? err.hint : '',
            ].filter(Boolean).join(' — ')
          : 'Unable to update contractor profile. Please try again or contact support.';
      setErrorMsg(message);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <AppLayout userRole="contractor" title="Profile Unavailable" backHref="/contractor/dashboard">
        <div className="p-12 text-center text-red-600">{loadError}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      userRole="contractor"
      title="Contractor Business Profile"
      subtitle="Manage your company details, service areas, and project capacity for smart matching"
      backHref="/contractor/dashboard"
    >
      <div className="w-full space-y-3 lg:space-y-4">
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

        {/* Header Stats Badge Bar */}
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-base">{businessName || 'Your Construction Business'}</div>
              <div className="text-xs text-slate-500">
                {tradeName ? `Trading as: ${tradeName} • ` : ''}
                {serviceCities.length} Service Areas • {yearsExperience} Years in Construction
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="text-right">
              <div className="text-slate-400 font-medium">Platform Reputation</div>
              <div className="font-bold text-slate-900 flex items-center gap-1 justify-end">
                <span className="text-amber-500">★</span>
                <span>{contractor?.rating_avg ? contractor.rating_avg.toFixed(1) : 'New'}</span>
                <span className="text-slate-400 font-normal">({contractor?.rating_count || 0} reviews)</span>
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-right">
              <div className="text-slate-400 font-medium">Completed Projects</div>
              <div className="font-bold text-emerald-700">{contractor?.projects_completed || 0} Built</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div role="tablist" aria-label="Contractor profile sections" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs lg:grid-cols-4">
            {[
              { id: 'personal', label: 'Personal details', detail: 'Account holder' },
              { id: 'business', label: 'Business registration', detail: 'Company & licenses' },
              { id: 'contact', label: 'Contact & office', detail: 'Business contact' },
              { id: 'matching', label: 'Services & capacity', detail: 'Matching criteria' },
            ].map((section, index) => (
              <button
                key={section.id}
                id={`contractor-profile-tab-${section.id}`}
                type="button"
                role="tab"
                aria-selected={activeProfileSection === section.id}
                aria-controls="contractor-profile-panel"
                tabIndex={activeProfileSection === section.id ? 0 : -1}
                onClick={() => setActiveProfileSection(section.id as typeof activeProfileSection)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
                  event.preventDefault();
                  const nextIndex = event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 3
                      : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
                  const nextSection = ['personal', 'business', 'contact', 'matching'][nextIndex] as typeof activeProfileSection;
                  setActiveProfileSection(nextSection);
                  document.getElementById(`contractor-profile-tab-${nextSection}`)?.focus();
                }}
                className={`min-h-12 rounded-xl px-3 py-2 text-left transition-colors ${
                  activeProfileSection === section.id
                    ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="block text-xs font-bold">{section.label}</span>
                <span className="mt-0.5 block text-[10px] text-slate-500">{section.detail}</span>
              </button>
            ))}
          </div>

          <div id="contractor-profile-panel" role="tabpanel" aria-labelledby={`contractor-profile-tab-${activeProfileSection}`} className="min-w-0">
          {activeProfileSection === 'personal' && <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Personal Account Details
            </h2>
            <p className="text-xs leading-relaxed text-slate-500">
              These details identify you as the account holder and are separate from your business contact information.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Full name *</label>
                <input
                  type="text"
                  maxLength={160}
                  value={personalName}
                  onChange={event => setPersonalName(event.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Sign-in email</label>
                <input
                  type="email"
                  readOnly
                  value={accountEmail}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-500"
                />
                <p className="mt-1 text-[10px] text-slate-400">Sign-in email is managed separately from your profile.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Personal phone</label>
                <input
                  type="tel"
                  maxLength={40}
                  value={personalPhone}
                  onChange={event => setPersonalPhone(event.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">City / Municipality</label>
                <input
                  type="text"
                  maxLength={120}
                  value={personalCity}
                  onChange={event => setPersonalCity(event.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-900 mb-1">Personal address</label>
                <input
                  type="text"
                  maxLength={300}
                  value={personalAddress}
                  onChange={event => setPersonalAddress(event.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>}

          {/* Section 1: Business Identification */}
          {activeProfileSection === 'business' && <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              1. Business Registration & Structure
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Registered Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Enter registered business name"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Trading / Display Name (Optional)
                </label>
                <input
                  type="text"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder="Enter registered business name"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Legal Structure
                </label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select business structure</option>
                  <option value="sole_proprietorship">Sole Proprietorship (DTI Registered)</option>
                  <option value="partnership">Partnership (SEC Registered)</option>
                  <option value="corporation">Corporation (SEC Registered)</option>
                  <option value="cooperative">Construction Cooperative / Joint Venture</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Authorized Managing Representative
                </label>
                <input
                  type="text"
                  value={authorizedRep}
                  onChange={(e) => setAuthorizedRep(e.target.value)}
                  placeholder="Enter authorized representative name"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">PCAB License Category</label>
                <select
                  value={pcabCategory}
                  onChange={(e) => setPcabCategory(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select PCAB category</option>
                  <option value="Category AAA">Category AAA (Large Scale / High Rise)</option>
                  <option value="Category AA">Category AA (Medium-Large)</option>
                  <option value="Category A">Category A (Up to ₱100M)</option>
                  <option value="Category B">Category B (Up to ₱60M)</option>
                  <option value="Category C">Category C (Up to ₱30M)</option>
                  <option value="Category D">Category D (Up to ₱10M)</option>
                  <option value="Trade / Specialty">Trade / Specialty Contractor</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">PCAB License Number</label>
                <input
                  type="text"
                  value={pcabLicenseNo}
                  onChange={(e) => setPcabLicenseNo(e.target.value)}
                  placeholder="Enter PCAB license number"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">PCAB License Expiry Date</label>
                <input
                  type="date"
                  value={pcabExpirationDate}
                  onChange={(e) => setPcabExpirationDate(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">DTI / SEC Certificate No.</label>
                <input
                  type="text"
                  value={dtiSecNo}
                  onChange={(e) => setDtiSecNo(e.target.value)}
                  placeholder="Enter DTI or SEC certificate number"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">BIR TIN</label>
                <input
                  type="text"
                  value={birTin}
                  onChange={(e) => setBirTin(e.target.value)}
                  placeholder="Enter BIR Tax Identification Number"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>}

          {/* Section 2: Contact & Operations */}
          {activeProfileSection === 'contact' && <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              2. Contact & Office Location
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Business Email</label>
                <input
                  type="email"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  placeholder="Enter business email"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Business Phone / Mobile</label>
                <input
                  type="text"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  placeholder="Enter business phone"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Province / Headquarters</label>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select province</option>
                  <option value="Metro Manila">Metro Manila (NCR)</option>
                  <option value="Cavite">Cavite</option>
                  <option value="Laguna">Laguna</option>
                  <option value="Rizal">Rizal</option>
                  <option value="Bulacan">Bulacan</option>
                  <option value="Pampanga">Pampanga</option>
                  <option value="Batangas">Batangas</option>
                  <option value="Cebu">Cebu</option>
                  <option value="Davao">Davao</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">Complete Office Address</label>
              <input
                type="text"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                placeholder="Enter complete office address"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">Company Bio & Construction Philosophy</label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Briefly describe your team's background, past residential projects, craftsmanship quality, and warranty guarantees."
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>}

          {/* Section 3: Service Areas & Project Matching Criteria */}
          {activeProfileSection === 'matching' && <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              3. Service Coverage & Matching Capabilities
            </h2>

            {/* Service Cities Tags */}
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Active Service Cities & Municipalities
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {serviceCities.map((city) => (
                  <span
                    key={city}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium"
                  >
                    {city}
                    <button
                      type="button"
                      onClick={() => handleRemoveCity(city)}
                      className="text-blue-500 hover:text-blue-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={handleAddCity}
                placeholder="Type a service city and press Enter to add"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Specialties & Finish Levels */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-2">Accepted House Types</label>
                <div className="space-y-2 text-xs">
                  {[
                    { id: 'one_storey', label: '1-Storey Bungalow' },
                    { id: 'two_storey', label: '2-Storey House' },
                    { id: 'townhouse', label: 'Townhouse / Multi-Unit' },
                  ].map((item) => (
                    <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={specialties.includes(item.id as HouseType)}
                        onChange={() => toggleSpecialty(item.id as HouseType)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-slate-700">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-2">Finish Qualities Built</label>
                <div className="space-y-2 text-xs">
                  {[
                    { id: 'basic', label: 'Basic (Standard Finishes)' },
                    { id: 'standard', label: 'Standard (Granite / Quality)' },
                    { id: 'premium', label: 'Premium (High-end Architectural)' },
                  ].map((item) => (
                    <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={finishLevels.includes(item.id as FinishLevel)}
                        onChange={() => toggleFinishLevel(item.id as FinishLevel)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-slate-700">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-2">Scope Types Accepted</label>
                <div className="space-y-2 text-xs">
                  {[
                    { id: 'new_build', label: 'New Construction from Scratch' },
                    { id: 'renovation', label: 'Full & Partial Renovation' },
                    { id: 'extension', label: 'House Extension & Addition' },
                  ].map((item) => (
                    <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={workTypes.includes(item.id as WorkType)}
                        onChange={() => toggleWorkType(item.id as WorkType)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-slate-700">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Experience, Team & Project Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Years in Business</label>
                <input
                  type="number"
                  min="0"
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(Number(e.target.value))}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Direct Field Personnel</label>
                <input
                  type="number"
                  min="1"
                  value={teamCapacity}
                  onChange={(e) => setTeamCapacity(Number(e.target.value))}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Min. Project Budget (₱)</label>
                <input
                  type="number"
                  value={minBudget}
                  onChange={(e) => setMinBudget(Number(e.target.value))}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">Max. Project Budget (₱)</label>
                <input
                  type="number"
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(Number(e.target.value))}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-[#f8fafc]/95 py-3 backdrop-blur-sm lg:sticky lg:bottom-0 lg:z-10">
            <button
              type="submit"
              disabled={saving}
              className="py-3 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all hover:shadow disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving Profile...' : 'Save Business Profile'}</span>
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
