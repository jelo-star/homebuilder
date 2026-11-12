'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Save, 
  CheckCircle2, 
  ShieldCheck, 
  DollarSign, 
  Globe
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { optimizeImage } from '@/lib/image-optimization';
import { ImagePlus, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';

type PopularService = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  filter_key: 'service' | 'search';
  filter_value: string;
  sort_order: number;
  is_active: boolean;
};

type PopularServiceForm = Omit<PopularService, 'id'>;

const emptyService: PopularServiceForm = {
  title: '',
  description: '',
  image_url: '',
  filter_key: 'service' as const,
  filter_value: 'renovation',
  sort_order: 0,
  is_active: true,
};

export default function PlatformSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [platformName, setPlatformName] = React.useState('');
  const [platformFeePct, setPlatformFeePct] = React.useState('');
  const [autoVerifyPcab, setAutoVerifyPcab] = React.useState<boolean | null>(null);
  const [escrowHoldDays, setEscrowHoldDays] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [configuredSettings, setConfiguredSettings] = React.useState<string[]>([]);
  const [popularServices, setPopularServices] = React.useState<PopularService[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState(true);
  const [serviceSaving, setServiceSaving] = React.useState(false);
  const [serviceError, setServiceError] = React.useState('');
  const [serviceSuccess, setServiceSuccess] = React.useState('');
  const [editingServiceId, setEditingServiceId] = React.useState<string | null>(null);
  const [serviceForm, setServiceForm] = React.useState<PopularServiceForm>(emptyService);
  const [serviceImageFile, setServiceImageFile] = React.useState<File | null>(null);
  const [serviceImagePreview, setServiceImagePreview] = React.useState('');
  const [serviceModalOpen, setServiceModalOpen] = React.useState(false);
  const serviceImagePreviewUrl = React.useRef<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (serviceImagePreviewUrl.current) URL.revokeObjectURL(serviceImagePreviewUrl.current);
    };
  }, []);

  React.useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  React.useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();
      const { data, error: queryError } = await supabase.from('app_settings').select('*');
      if (queryError) {
        setError(queryError.message);
      } else {
        setConfiguredSettings((data || []).map(s => s.key));
        data?.forEach(s => {
          if (s.key === 'platform_name') setPlatformName(String(s.value ?? ''));
          if (s.key === 'platform_fee_percent' || s.key === 'platform_fee_pct') setPlatformFeePct(String(s.value ?? ''));
          if (s.key === 'auto_verify_pcab') setAutoVerifyPcab(Boolean(s.value));
          if (s.key === 'escrow_hold_days') setEscrowHoldDays(String(s.value ?? ''));
        });
      }
      setLoading(false);
    }
    loadSettings();
  }, []);

  React.useEffect(() => {
    async function loadPopularServices() {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from('popular_services')
        .select('*')
        .order('sort_order')
        .order('created_at');

      if (queryError) {
        setServiceError(queryError.code === 'PGRST205'
          ? 'Popular services are not set up in Supabase yet. Apply migration 103_popular_services_management.sql, then reload this page.'
          : `Popular services could not be loaded: ${queryError.message}`);
      } else {
        setPopularServices(data ?? []);
      }
      setServicesLoading(false);
    }

    void loadPopularServices();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setError(null);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const settings = [
        { key: 'platform_name', value: platformName },
        { key: 'platform_fee_percent', value: Number(platformFeePct) },
        { key: 'auto_verify_pcab', value: autoVerifyPcab },
        { key: 'escrow_hold_days', value: Number(escrowHoldDays) }
      ];

      for (const item of settings) {
        const { error } = await supabase.from('app_settings').upsert({
          key: item.key,
          value: item.value,
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
      }

      const { error: auditError } = await supabase.from('audit_log').insert({
        actor_id: user?.id,
        action: 'update_platform_settings',
        entity: 'app_settings',
        details: { platform_fee_pct: platformFeePct, escrow_hold_days: escrowHoldDays }
      });
      if (auditError) throw auditError;

      setConfiguredSettings(['platform_name', 'platform_fee_percent', 'auto_verify_pcab', 'escrow_hold_days']);
      setSuccessMsg('Platform configuration updated successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save platform settings.');
    } finally {
      setSaving(false);
    }
  };

  const resetServiceForm = () => {
    setEditingServiceId(null);
    setServiceForm({ ...emptyService, sort_order: popularServices.length + 1 });
    setServiceImageFile(null);
    setServiceImagePreview('');
    setServiceError('');
    setServiceSuccess('');
    setServiceModalOpen(true);
  };

  const handleServiceImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (serviceImagePreviewUrl.current) URL.revokeObjectURL(serviceImagePreviewUrl.current);
    serviceImagePreviewUrl.current = file ? URL.createObjectURL(file) : null;
    setServiceImageFile(file);
    setServiceImagePreview(serviceImagePreviewUrl.current || serviceForm.image_url);
  };

  const closeServiceModal = React.useCallback(() => {
    if (serviceImagePreviewUrl.current) URL.revokeObjectURL(serviceImagePreviewUrl.current);
    serviceImagePreviewUrl.current = null;
    setServiceImageFile(null);
    setServiceImagePreview('');
    setServiceModalOpen(false);
  }, []);

  React.useEffect(() => {
    if (!serviceModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !serviceSaving) closeServiceModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [serviceModalOpen, serviceSaving, closeServiceModal]);

  const handleServiceSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServiceError('');
    setServiceSuccess('');

    const title = serviceForm.title.trim();
    const description = serviceForm.description.trim();
    const filterValue = serviceForm.filter_value.trim();
    if (!serviceImageFile && !serviceForm.image_url) {
      setServiceError('Choose a photo for this service.');
      return;
    }
    if (serviceImageFile && !['image/jpeg', 'image/png', 'image/webp'].includes(serviceImageFile.type)) {
      setServiceError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (serviceImageFile && serviceImageFile.size > 10 * 1024 * 1024) {
      setServiceError('Choose an image smaller than 10 MB.');
      return;
    }

    setServiceSaving(true);
    try {
      const supabase = createClient();
      let imageUrl = serviceForm.image_url;
      if (serviceImageFile) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('Sign in as an administrator to upload a service photo.');

        const optimizedServiceImage = await optimizeImage(serviceImageFile, 'portfolio');
        const storagePath = `${user.id}/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('popular-services')
          .upload(storagePath, optimizedServiceImage, { contentType: 'image/webp', upsert: false });
        if (uploadError) throw uploadError;

        imageUrl = supabase.storage.from('popular-services').getPublicUrl(storagePath).data.publicUrl;
      }

      const values = {
        title,
        description,
        image_url: imageUrl,
        filter_key: serviceForm.filter_key,
        filter_value: filterValue,
        sort_order: Number(serviceForm.sort_order),
        is_active: serviceForm.is_active,
      };

      if (editingServiceId) {
        const { data, error: updateError } = await supabase
          .from('popular_services')
          .update(values)
          .eq('id', editingServiceId)
          .select()
          .single();
        if (updateError) throw updateError;
        setPopularServices((current) => current.map((item) => item.id === editingServiceId ? data : item).sort((a, b) => a.sort_order - b.sort_order));
        setServiceSuccess('Popular service updated.');
      } else {
        const { data, error: insertError } = await supabase
          .from('popular_services')
          .insert(values)
          .select()
          .single();
        if (insertError) throw insertError;
        setPopularServices((current) => [...current, data].sort((a, b) => a.sort_order - b.sort_order));
        setServiceSuccess('Popular service added.');
      }

      setEditingServiceId(null);
      setServiceForm({ ...emptyService, sort_order: popularServices.length + (editingServiceId ? 1 : 2) });
      closeServiceModal();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Popular service could not be saved.';
      setServiceError(
        message.toLowerCase().includes('permission denied') || message.toLowerCase().includes('row-level security')
          ? 'Supabase denied this change. Re-run migration 103_popular_services_management.sql to apply table and photo-storage permissions, and make sure you are signed in as an administrator.'
          : `Popular service could not be saved: ${message}`,
      );
    } finally {
      setServiceSaving(false);
    }
  };

  const handleEditService = (service: PopularService) => {
    setEditingServiceId(service.id);
    setServiceForm({
      title: service.title,
      description: service.description,
      image_url: service.image_url,
      filter_key: service.filter_key,
      filter_value: service.filter_value,
      sort_order: service.sort_order,
      is_active: service.is_active,
    });
    setServiceImageFile(null);
    setServiceImagePreview(service.image_url);
    setServiceError('');
    setServiceSuccess('');
    setServiceModalOpen(true);
  };

  const handleDeleteService = async (service: PopularService) => {
    if (!window.confirm(`Remove "${service.title}" from popular services?`)) return;

    setServiceError('');
    setServiceSuccess('');
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('popular_services')
      .delete()
      .eq('id', service.id);

    if (deleteError) {
      setServiceError(`Popular service could not be removed: ${deleteError.message}`);
      return;
    }
    setPopularServices((current) => current.filter((item) => item.id !== service.id));
    if (editingServiceId === service.id) resetServiceForm();
    setServiceSuccess('Popular service removed.');
  };

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Platform Settings & Rules"
      subtitle="Escrow fee configurations, license verification criteria, and system dispute deadlines"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {!loading && !error && configuredSettings.length === 0 && <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">No platform settings have been configured yet.</div>}
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

        {loading ? <div className="p-8 text-center text-xs text-slate-400">Loading platform settings...</div> : <form onSubmit={handleSave} className="space-y-6">
          {/* General Platform Settings */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              General Platform Identity
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Platform Brand Title</label>
                <input
                  type="text"
                  required
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-200"
                />
                {!configuredSettings.includes('platform_name') && <span className="text-[11px] text-slate-400 mt-1 block">Not configured</span>}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Operating Jurisdiction & Timezone</label>
                <input
                  type="text"
                  disabled
                  value="Philippines (Asia/Manila PHT, ₱ PHP)"
                  className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Financial & Escrow Rules */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Financial & Escrow Commission
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Homeowner Platform Commission (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  required
                  value={platformFeePct}
                  onChange={(e) => setPlatformFeePct(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-200"
                />
                {!configuredSettings.includes('platform_fee_percent') && <span className="text-[11px] text-slate-400 mt-1 block">Not configured</span>}
                <span className="text-[11px] text-slate-400 mt-0.5 block">Locked when a project is created, then added to the accepted contractor quote and paid by the homeowner.</span>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Dispute Cooling Period (Days)</label>
                <input
                  type="number"
                  min="3"
                  max="60"
                  required
                  value={escrowHoldDays}
                  onChange={(e) => setEscrowHoldDays(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-200"
                />
                {!configuredSettings.includes('escrow_hold_days') && <span className="text-[11px] text-slate-400 mt-1 block">Not configured</span>}
                <span className="text-[11px] text-slate-400 mt-0.5 block">Disputed funds hold window before default arbitration</span>
              </div>
            </div>
          </div>

          {/* Compliance & Verification */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Contractor Regulatory Standards
            </h3>

            <div className="space-y-3 text-xs">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoVerifyPcab === true}
                  onChange={(e) => setAutoVerifyPcab(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-slate-700 font-medium">Require manual human review for all builder license submissions</span>
                {autoVerifyPcab === null && <span className="text-slate-400">Not configured</span>}
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg shadow-xs transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>}

        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Popular Home Services</h3>
              <p className="mt-1 text-xs text-slate-500">Manage the service cards shown on the public homepage.</p>
            </div>
            <button
              type="button"
              onClick={resetServiceForm}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add service
            </button>
          </div>

          {serviceError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{serviceError}</div>}
          {serviceSuccess && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{serviceSuccess}</div>}
          {servicesLoading ? (
            <p className="text-xs text-slate-500">Loading popular services...</p>
          ) : popularServices.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">No popular services yet. Add one to show it on the homepage.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {popularServices.map((service) => (
                <article key={service.id} className={`overflow-hidden rounded-xl border ${service.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
                  <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url("${service.image_url}")` }} />
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{service.title}</h4>
                        <p className="mt-1 text-xs text-slate-600">{service.description}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${service.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {service.is_active ? 'Live' : 'Hidden'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-[11px] text-slate-500">Order {service.sort_order}</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleEditService(service)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button type="button" onClick={() => void handleDeleteService(service)} aria-label={`Remove ${service.title}`} className="inline-flex items-center rounded-md border border-red-200 px-2 py-1.5 text-red-600 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

        </section>

        {serviceModalOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !serviceSaving) closeServiceModal();
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="popular-service-modal-title"
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-7">
                <div>
                  <h3 id="popular-service-modal-title" className="text-base font-bold text-slate-900">
                    {editingServiceId ? 'Edit service card' : 'Add a service card'}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">Choose a photo and set how homeowners find this service.</p>
                </div>
                <button
                  type="button"
                  disabled={serviceSaving}
                  onClick={closeServiceModal}
                  aria-label="Close dialog"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleServiceSubmit} className="space-y-5 p-5 sm:p-7">
                {serviceError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{serviceError}</div>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium text-slate-700">
                    Service title
                    <input required maxLength={80} value={serviceForm.title} onChange={(event) => setServiceForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm" />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-700">
                    Short description
                    <input required maxLength={180} value={serviceForm.description} onChange={(event) => setServiceForm((current) => ({ ...current, description: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm" />
                  </label>

                  <div className="space-y-2 sm:col-span-2">
                    <span className="block text-xs font-medium text-slate-700">Service photo</span>
                    {serviceImagePreview ? (
                      <div className="relative h-48 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={serviceImagePreview} alt="Service preview" className="h-full w-full object-cover" />
                        <label className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-md hover:bg-slate-50">
                          <Upload className="h-4 w-4" />
                          Change photo
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleServiceImageChange}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
                        <ImagePlus className="h-8 w-8 text-slate-400" />
                        <span className="mt-2 text-sm font-semibold text-slate-700">Select a photo</span>
                        <span className="mt-1 text-xs text-slate-500">JPG, PNG, or WebP · up to 10 MB</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleServiceImageChange}
                          className="sr-only"
                        />
                      </label>
                    )}
                    {serviceImageFile && <p className="text-xs text-slate-500">{serviceImageFile.name}</p>}
                  </div>

                  <label className="space-y-1 text-xs font-medium text-slate-700">
                    Contractor filter
                    <select value={serviceForm.filter_key} onChange={(event) => setServiceForm((current) => ({ ...current, filter_key: event.target.value as 'service' | 'search', filter_value: event.target.value === 'service' ? 'renovation' : '' }))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
                      <option value="service">Work type</option>
                      <option value="search">Keyword search</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-700">
                    {serviceForm.filter_key === 'service' ? 'Work type' : 'Search keyword'}
                    {serviceForm.filter_key === 'service' ? (
                      <select required value={serviceForm.filter_value} onChange={(event) => setServiceForm((current) => ({ ...current, filter_value: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
                        <option value="new_build">New build</option>
                        <option value="renovation">Renovation</option>
                        <option value="extension">Extension</option>
                      </select>
                    ) : (
                      <input required maxLength={100} value={serviceForm.filter_value} onChange={(event) => setServiceForm((current) => ({ ...current, filter_value: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm" />
                    )}
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-700">
                    Display order
                    <input required type="number" min={0} step={1} value={serviceForm.sort_order} onChange={(event) => setServiceForm((current) => ({ ...current, sort_order: Number(event.target.value) }))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm" />
                  </label>
                  <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium text-slate-700">
                    <input type="checkbox" checked={serviceForm.is_active} onChange={(event) => setServiceForm((current) => ({ ...current, is_active: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    Show on homepage
                  </label>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                  <button type="button" disabled={serviceSaving} onClick={closeServiceModal} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={serviceSaving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                    <Save className="h-4 w-4" />
                    {serviceSaving ? 'Saving...' : editingServiceId ? 'Save changes' : 'Add service'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
