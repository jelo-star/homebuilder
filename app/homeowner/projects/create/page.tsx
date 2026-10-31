'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  Upload, 
  FileText, 
  Layers, 
  Hammer, 
  Send, 
  Plus, 
  Trash2, 
  Info,
  Clock,
  Calculator,
  Search,
  ChevronDown,
  Check
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { HouseType, WorkType, FinishLevel, StartWindow } from '@/types/database';
import { formatCurrency } from '@/lib/utils/formatters';
import { calculateEstimate } from '@/lib/utils/estimator';
import { PHILIPPINE_REGIONS, ALL_PHILIPPINE_PROVINCES } from '@/lib/utils/philippines';

export default function CreateProjectPage() {
  const router = useRouter();

  // Basic Project Details
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [houseType, setHouseType] = React.useState<HouseType>('two_storey');
  const [workType, setWorkType] = React.useState<WorkType>('new_build');
  const [finishLevel, setFinishLevel] = React.useState<FinishLevel>('standard');
  const [province, setProvince] = React.useState('');
  const [provinceSearch, setProvinceSearch] = React.useState('');
  const [isProvinceOpen, setIsProvinceOpen] = React.useState(false);
  const provinceDropdownRef = React.useRef<HTMLDivElement>(null);

  // Close province dropdown on click outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (provinceDropdownRef.current && !provinceDropdownRef.current.contains(event.target as Node)) {
        setIsProvinceOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered provinces list
  const filteredProvinces = React.useMemo(() => {
    const q = provinceSearch.trim().toLowerCase();
    if (!q) return ALL_PHILIPPINE_PROVINCES;
    return ALL_PHILIPPINE_PROVINCES.filter(p => p.toLowerCase().includes(q));
  }, [provinceSearch]);

  const handleProvinceInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setProvinceSearch(val);
    setIsProvinceOpen(true);
    
    // Automatically match and select if typed value matches a province
    const exact = ALL_PHILIPPINE_PROVINCES.find(p => p.toLowerCase() === val.trim().toLowerCase());
    if (exact) {
      setProvince(exact);
    } else {
      const startMatch = ALL_PHILIPPINE_PROVINCES.find(p => p.toLowerCase().startsWith(val.trim().toLowerCase()));
      if (startMatch && val.length >= 3) {
        setProvince(startMatch);
      } else {
        setProvince(val);
      }
    }
  };

  const handleSelectProvince = (p: string) => {
    setProvince(p);
    setProvinceSearch(p);
    setIsProvinceOpen(false);
  };
  const [city, setCity] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [floorArea, setFloorArea] = React.useState('');
  const [floors, setFloors] = React.useState('');
  const [bedrooms, setBedrooms] = React.useState('');
  const [bathrooms, setBathrooms] = React.useState('');
  const [budget, setBudget] = React.useState('');
  const [platformCommissionPercent, setPlatformCommissionPercent] = React.useState<number | null>(null);
  const [commissionLoadError, setCommissionLoadError] = React.useState('');
  const [desiredStart, setDesiredStart] = React.useState<StartWindow>('in_2_months');
  const [paymentTranches, setPaymentTranches] = React.useState<number>(3);
  const [planFilePath, setPlanFilePath] = React.useState<string | null>(null);
  const [imageFileName, setImageFileName] = React.useState('');

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDimension = 1440;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          const sizeKb = Math.round((compressed.length * 3) / 4 / 1024);
          setPlanFilePath(compressed);
          setImageFileName(`${file.name} (${sizeKb} KB)`);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  
  // Custom Materials & Scope Checklist
  const [scopeNotes, setScopeNotes] = React.useState('');

  // Live Cost Estimator calculation based on dimensions, finishes and region
  const [estimateResult, setEstimateResult] = React.useState<{
    key: string;
    value: Awaited<ReturnType<typeof calculateEstimate>>;
  } | null>(null);
  const [estimateFailure, setEstimateFailure] = React.useState<{ key: string; message: string } | null>(null);
  const estimateArea = Number(floorArea);
  const estimateFloors = Number(floors);
  const estimateInputKey = JSON.stringify([estimateArea, estimateFloors, finishLevel, workType, province]);
  const hasEstimateInputs = Boolean(estimateArea && estimateFloors && province);
  const liveEstimate = estimateResult?.key === estimateInputKey ? estimateResult.value : null;
  const estimateError = estimateFailure?.key === estimateInputKey ? estimateFailure.message : '';
  const estimateLoading = hasEstimateInputs && !liveEstimate && !estimateError;

  React.useEffect(() => {
    let active = true;
    createClient()
      .rpc('get_current_platform_commission_percent')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setCommissionLoadError(`Platform commission is unavailable. Apply Supabase migration 75, then reload. ${error.message}`);
          return;
        }
        const commissionPercent = Number(data);
        if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
          setCommissionLoadError('The configured platform commission is invalid. Contact an administrator.');
          return;
        }
        setPlatformCommissionPercent(commissionPercent);
      });

    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!hasEstimateInputs) return;

    let active = true;
    calculateEstimate(estimateArea, estimateFloors, finishLevel, workType, undefined, province)
      .then(result => {
        if (active) {
          setEstimateResult({ key: estimateInputKey, value: result });
        }
      })
      .catch(error => {
        if (active) {
          setEstimateFailure({
            key: estimateInputKey,
            message: error instanceof Error ? error.message : 'No active benchmark rate is available.',
          });
        }
      });

    return () => { active = false; };
  }, [estimateArea, estimateFloors, finishLevel, workType, province, estimateInputKey, hasEstimateInputs]);

  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');
  const [formStep, setFormStep] = React.useState<1 | 2>(1);

  const handleContinueToDetails = () => {
    if (!title.trim()) {
      setErrorMsg('Please provide a project title.');
      return;
    }
    if (!province.trim()) {
      setErrorMsg('Please specify the province or region.');
      return;
    }
    if (!city.trim()) {
      setErrorMsg('Please specify the construction city.');
      return;
    }

    setErrorMsg('');
    setFormStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToIdentity = () => {
    setFormStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  React.useEffect(() => {
    if (!errorMsg && !successMsg) return;
    const t = setTimeout(() => {
      setErrorMsg('');
      setSuccessMsg('');
    }, 4000);
    return () => clearTimeout(t);
  }, [errorMsg, successMsg]);

  const handleSaveDraft = async () => {
    await submitProject('draft');
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitProject('open');
  };

  const submitProject = async (targetStatus: 'draft' | 'open') => {
    if (!title.trim()) {
      setErrorMsg('Please provide a project title');
      return;
    }
    if (!province.trim()) {
      setErrorMsg('Please specify the construction province or region.');
      return;
    }
    if (!city.trim()) {
      setErrorMsg('Please specify the construction city');
      return;
    }
    if (!Number(floorArea) || !Number(floors)) {
      setErrorMsg('Enter the floor area and number of floors.');
      return;
    }
    if (!liveEstimate) {
      setErrorMsg(estimateError || 'An active database benchmark is required before saving or publishing this project.');
      return;
    }
    if (platformCommissionPercent == null) {
      setErrorMsg(commissionLoadError || 'The platform commission could not be verified. Reload the page before creating this project.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to save or publish a project.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw new Error(`Could not verify your account role: ${profileError.message}`);
      if (!profile) throw new Error('Your account profile is missing. Ask an administrator to repair your Supabase profile.');
      if (profile.role !== 'homeowner') {
        throw new Error(`Your account role is "${profile.role}", but only homeowner accounts can create projects.`);
      }

      const area = Number(floorArea);
      const flrs = Number(floors);
      const sysEst = liveEstimate;

      const projectData = {
        homeowner_id: user.id,
        title: title.trim(),
        house_type: houseType,
        work_type: workType,
        finish_level: finishLevel,
        floor_area_sqm: area,
        floors: flrs,
        bedrooms: Number(bedrooms) || 0,
        bathrooms: Number(bathrooms) || 0,
        province,
        city: city.trim(),
        budget: Number(budget) || null,
        desired_start: desiredStart,
        payment_tranches: paymentTranches,
        plan_file_path: planFilePath,
        payment_terms: `${paymentTranches} Equal Milestone Installments`,
        status: targetStatus,
        est_low: sysEst.low,
        est_mid: sysEst.mid,
        est_high: sysEst.high,
      };

      const { error } = await supabase
        .from('projects')
        .insert(projectData);
      if (error) throw error;

      setSuccessMsg(targetStatus === 'open' 
        ? 'Project successfully published! Verified contractors can now review and submit quotations.' 
        : 'Project draft saved to your account.');

      setTimeout(() => {
        router.push('/homeowner/projects');
      }, 900);

    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout
      userRole="homeowner"
      title="Create & Publish Construction Project"
      subtitle="Publish your residential build requirements to receive detailed material and construction proposals"
      backHref="/homeowner/projects"
    >
      <div className="w-full space-y-6">
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

        <form onSubmit={handlePublish} className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-xs">
            <div className="flex items-center gap-3">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${formStep === 1 ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                {formStep === 1 ? '1' : <Check className="h-4 w-4" />}
              </span>
              <div>
                <p className={`text-xs font-bold ${formStep === 1 ? 'text-blue-700' : 'text-slate-500'}`}>Project location</p>
                <p className="text-[10px] text-slate-500">Title and address</p>
              </div>
            </div>
            <div className={`mx-3 h-px flex-1 ${formStep === 2 ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            <div className="flex items-center gap-3">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${formStep === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>2</span>
              <div>
                <p className={`text-xs font-bold ${formStep === 2 ? 'text-blue-700' : 'text-slate-500'}`}>Project details</p>
                <p className="text-[10px] text-slate-500">Dimensions and budget</p>
              </div>
            </div>
          </div>

          {/* Card 1: Project Identity & Scope */}
          {formStep === 1 && <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                1. Project Identity & Location
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Specify basic property scope, address, and target build timeline</p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">Project Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Modern 2-Storey 3BR Residential Home"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Project Category</label>
                  <select
                    value={workType}
                    onChange={(e) => setWorkType(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
                  >
                    <option value="new_build">New Build Construction</option>
                    <option value="renovation">Major Renovation</option>
                    <option value="extension">House Extension</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Building Type</label>
                  <select
                    value={houseType}
                    onChange={(e) => setHouseType(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
                  >
                    <option value="one_storey">Single Storey Bungalow</option>
                    <option value="two_storey">2-Storey Residence</option>
                    <option value="townhouse">Urban Multi-Level Townhouse</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Finish Standard</label>
                  <select
                    value={finishLevel}
                    onChange={(e) => setFinishLevel(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
                  >
                    <option value="basic">Standard Bare / Basic</option>
                    <option value="standard">Standard Complete Finish</option>
                    <option value="premium">High-End Architectural</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative" ref={provinceDropdownRef}>
                  <label className="block font-semibold text-slate-800 mb-1">Province / Region (Type to search) *</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={provinceSearch}
                      onChange={handleProvinceInputChange}
                      onFocus={() => setIsProvinceOpen(true)}
                      placeholder="Type province name (e.g. Davao Occidental, Cebu, Rizal)"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      list="philippine-provinces-list"
                    />
                    <button
                      type="button"
                      onClick={() => setIsProvinceOpen(!isProvinceOpen)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isProvinceOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Datalist for native browser typeahead */}
                  <datalist id="philippine-provinces-list">
                    {ALL_PHILIPPINE_PROVINCES.map((prov) => (
                      <option key={prov} value={prov} />
                    ))}
                  </datalist>

                  {/* Floating Filtered Dropdown */}
                  {isProvinceOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {filteredProvinces.length === 0 ? (
                        <div className="p-3 text-slate-400 text-center text-xs">
                          No matching province found
                        </div>
                      ) : (
                        filteredProvinces.map((prov) => {
                          const isSelected = province.toLowerCase() === prov.toLowerCase();
                          return (
                            <button
                              key={prov}
                              type="button"
                              onClick={() => handleSelectProvince(prov)}
                              className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-blue-50 transition cursor-pointer ${
                                isSelected ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700'
                              }`}
                            >
                              <span>{prov}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 mb-1">City / Municipality *</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Quezon City, Antipolo, Pasig"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">Exact Construction Lot / Street Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Block 14 Lot 8 Phase 2, Eastview Subdivision"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
                />
              </div>
            </div>
          </div>}

          {/* Step 2: project details and live estimator */}
          {formStep === 2 && (
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
              <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-7 lg:col-span-8">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <Layers className="h-4 w-4 text-blue-600" />
                    2. Dimensions & Homeowner Target Budget
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">Enter the home dimensions, budget, and timing. Your estimate updates alongside the form.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-800">Floor Area (sq.m)</label>
                    <input
                      type="number"
                      value={floorArea}
                      onChange={(e) => setFloorArea(e.target.value)}
                      placeholder="e.g. 120"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-800">Floors</label>
                    <input
                      type="number"
                      value={floors}
                      onChange={(e) => setFloors(e.target.value)}
                      placeholder="e.g. 2"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-800">Bedrooms</label>
                    <input
                      type="number"
                      value={bedrooms}
                      onChange={(e) => setBedrooms(e.target.value)}
                      placeholder="e.g. 3"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-800">Bathrooms</label>
                    <input
                      type="number"
                      value={bathrooms}
                      onChange={(e) => setBathrooms(e.target.value)}
                      placeholder="e.g. 2"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 text-xs">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-800">Desired Start Timeline</label>
                    <select
                      value={desiredStart}
                      onChange={(e) => setDesiredStart(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900"
                    >
                      <option value="asap">Immediate / ASAP (Ready to mobilize)</option>
                      <option value="in_2_months">Within 1 to 2 Months</option>
                      <option value="in_6_months">Planning Stage (3 to 6 Months)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2.5 border-t border-slate-100 pt-4 text-xs">
                  <label className="block font-semibold text-slate-800">
                    Upload House / Project Reference Image (Optional)
                  </label>
                  <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center transition-colors hover:bg-slate-50">
                    <input
                      type="file"
                      id="project-image-upload"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <label htmlFor="project-image-upload" className="block cursor-pointer space-y-2">
                      {imageFileName ? (
                        <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-600">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>{imageFileName}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600">
                          <Upload className="h-4 w-4 text-blue-600" />
                          <span className="font-semibold text-slate-800">Click to upload a reference house photo or floor plan</span>
                          <span className="text-slate-400">(JPG, PNG, WebP)</span>
                        </div>
                      )}
                    </label>
                  </div>
                  {planFilePath && (
                    <div className="relative flex animate-in flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/80 p-3 duration-200 sm:p-4">
                      <div className="relative flex max-h-80 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-2xs">
                        <img src={planFilePath} alt="Project reference preview" className="max-h-72 w-auto max-w-full rounded-lg object-contain" />
                      </div>
                      <div className="flex w-full items-center justify-between px-1 pt-2.5 text-xs">
                        <div className="flex min-w-0 items-center gap-1.5 truncate text-slate-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          <span className="truncate font-semibold">{imageFileName || 'Project Reference Photo'}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <label
                            htmlFor="project-image-upload"
                            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-2xs transition hover:bg-slate-100"
                          >
                            Change Photo
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setPlanFilePath(null);
                              setImageFileName('');
                            }}
                            className="rounded-lg border border-red-200 bg-white p-1 text-red-600 transition hover:bg-red-50"
                            title="Remove photo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <aside className="space-y-4 lg:sticky lg:top-6 lg:col-span-4">
                <div className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
                  <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
                    <div className="flex items-center gap-2 text-sm font-bold text-blue-950">
                      <Calculator className="h-5 w-5 text-blue-600" />
                      Project Cost Estimator
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                      Live estimate using active construction benchmarks for your selected project details.
                    </p>
                  </div>

                  <div className="space-y-4 p-5">
                    <div>
                      <label htmlFor="homeowner-target-budget" className="mb-1 block text-xs font-semibold text-slate-800">
                        Homeowner&apos;s Target Budget (₱ PHP)
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-400">₱</span>
                        <input
                          id="homeowner-target-budget"
                          type="number"
                          min="0"
                          step="1000"
                          value={budget}
                          onChange={(e) => setBudget(e.target.value)}
                          placeholder="e.g. 4,500,000"
                          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-bold text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        Contractors will use this target when preparing their proposals.
                      </p>
                    </div>

                    {estimateLoading ? (
                      <div role="status" className="rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-500">
                        Updating your estimate…
                      </div>
                    ) : liveEstimate ? (
                      <>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estimated midpoint</div>
                          <div className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">
                            {formatCurrency(liveEstimate.mid)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-blue-50 p-3">
                            <div className="text-[10px] font-semibold uppercase text-blue-700">Low estimate</div>
                            <div className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(liveEstimate.low)}</div>
                          </div>
                          <div className="rounded-xl bg-indigo-50 p-3">
                            <div className="text-[10px] font-semibold uppercase text-indigo-700">High estimate</div>
                            <div className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(liveEstimate.high)}</div>
                          </div>
                        </div>
                        {Number(budget) > 0 && (
                          <div className={`rounded-xl border p-3 text-xs leading-relaxed ${
                            Number(budget) >= liveEstimate.high
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : Number(budget) >= liveEstimate.low
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-rose-200 bg-rose-50 text-rose-800'
                          }`}>
                            {Number(budget) >= liveEstimate.high
                              ? 'Your target budget covers the estimated cost range.'
                              : Number(budget) >= liveEstimate.low
                                ? 'Your target budget is within the estimated range, but below the midpoint.'
                                : 'Your target budget is below the estimated cost range.'}
                          </div>
                        )}
                        <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-500">Floor area</span>
                            <strong className="text-slate-800">{Number(floorArea).toLocaleString()} sq.m</strong>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-500">Construction rate</span>
                            <strong className="text-slate-800">{formatCurrency(liveEstimate.ratePerSqm)}/sq.m</strong>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-500">Project type</span>
                            <strong className="capitalize text-slate-800">{workType.replace('_', ' ')}</strong>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-500">Finish level</span>
                            <strong className="capitalize text-slate-800">{finishLevel}</strong>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-500">Location</span>
                            <strong className="text-right text-slate-800">{province}</strong>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className={`rounded-xl p-4 text-xs leading-relaxed ${
                        estimateError ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-500'
                      }`}>
                        {estimateError || 'Enter floor area and number of floors. Select a location in the previous step to see the estimate.'}
                      </div>
                    )}
                  </div>
                </div>

              </aside>
            </div>
          )}

          {/* Action Footer */}
          {formStep === 1 ? (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleContinueToDetails}
                className="w-full sm:w-auto px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                Continue to Project Details
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-1">
              <div className="flex w-full sm:w-auto gap-3">
                <button
                  type="button"
                  onClick={handleBackToIdentity}
                  disabled={saving}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs transition-colors"
                >
                  Save as Draft
                </button>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{saving ? 'Publishing...' : 'Publish Project to Marketplace'}</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </AppLayout>
  );
}
