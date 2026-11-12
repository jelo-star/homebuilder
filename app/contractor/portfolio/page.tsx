'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Building2, 
  Plus, 
  Trash2, 
  Upload, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Sparkles,
  X,
  Pencil
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { resolvePortfolioImageUrl } from '@/lib/supabase/storage';
import { optimizeImage } from '@/lib/image-optimization';
import { PortfolioItem, HouseType } from '@/types/database';

export default function ContractorPortfolioPage() {
  return (
    <React.Suspense fallback={<div className="p-16 text-center text-xs text-slate-500">Loading portfolio...</div>}>
      <ContractorPortfolioContent />
    </React.Suspense>
  );
}

function ContractorPortfolioContent() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [portfolioItems, setPortfolioItems] = React.useState<PortfolioItem[]>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);

  // Portfolio Modal Form State
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [houseType, setHouseType] = React.useState<HouseType | ''>('');
  const [floors, setFloors] = React.useState('');
  const [floorArea, setFloorArea] = React.useState('');
  const [yearCompleted, setYearCompleted] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');
  const [imageFile, setImageFile] = React.useState<File | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');
  const portfolioImageUrls = React.useMemo(() => {
    return new Map(
      portfolioItems.flatMap(item => {
        const filePath = item.portfolio_images?.[0]?.file_path;
        return filePath ? [[item.id, resolvePortfolioImageUrl(filePath)] as const] : [];
      }),
    );
  }, [portfolioItems]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setHouseType('');
    setFloors('');
    setFloorArea('');
    setYearCompleted('');
    setImageUrl('');
    setImageFile(null);
    setEditingItemId(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (item: PortfolioItem) => {
    setEditingItemId(item.id);
    setTitle(item.title);
    setDescription(item.description || '');
    setHouseType(item.house_type || '');
    setFloors(item.floors?.toString() || '');
    setFloorArea(item.floor_area_sqm?.toString() || '');
    setYearCompleted(item.year_completed?.toString() || '');
    setImageUrl(item.portfolio_images?.[0]?.file_path || '');
    setImageFile(null);
    setShowAddModal(true);
  };

  const loadData = React.useCallback(async () => {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoadError(authError.message);
      setLoading(false);
      return;
    }

    let dbItems: PortfolioItem[] = [];
    if (user) {
      const { data, error } = await supabase
        .from('portfolio_items')
        .select('*, portfolio_images(*)')
        .eq('contractor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      if (data) {
        dbItems = data as PortfolioItem[];
      }
    }
    setPortfolioItems(dbItems);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  React.useEffect(() => {
    if (!successMsg && !errorMsg) return;
    const timer = setTimeout(() => {
      setSuccessMsg('');
      setErrorMsg('');
    }, 4000);
    return () => clearTimeout(timer);
  }, [successMsg, errorMsg]);

  const handleSavePortfolioItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Project title is required.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to manage your portfolio.');

      // Resolve image path from the uploaded file or an explicitly provided URL.
      let finalImagePath = imageUrl.trim();
      if (imageFile) {
        const optimizedImage = await optimizeImage(imageFile, 'portfolio');
        const storagePath = `${user.id}/${Date.now()}_portfolio.webp`;
        const { error: uploadErr } = await supabase.storage
          .from('portfolio')
          .upload(storagePath, optimizedImage, { cacheControl: '31536000', contentType: 'image/webp', upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(storagePath);
        finalImagePath = publicUrl;
      }

      const values = {
        title: title.trim(),
        description: description.trim() || null,
        house_type: houseType || null,
        floors: Number(floors) || null,
        floor_area_sqm: Number(floorArea) || null,
        year_completed: Number(yearCompleted) || null,
      };

      let itemId = editingItemId;
      if (editingItemId) {
        const { error: itemErr } = await supabase
          .from('portfolio_items')
          .update(values)
          .eq('id', editingItemId)
          .eq('contractor_id', user.id);
        if (itemErr) throw itemErr;
        if (imageFile) {
          const { error: deleteImageErr } = await supabase.from('portfolio_images').delete().eq('portfolio_item_id', editingItemId);
          if (deleteImageErr) throw deleteImageErr;
        }
      } else {
        const { data: item, error: itemErr } = await supabase
          .from('portfolio_items')
          .insert({ contractor_id: user.id, ...values })
          .select()
          .single();
        if (itemErr) throw itemErr;
        if (!item) throw new Error('Portfolio project could not be saved.');
        itemId = item.id;
      }

      if (imageFile && finalImagePath && itemId) {
        const { error: imageErr } = await supabase.from('portfolio_images').insert({
          portfolio_item_id: itemId,
          file_path: finalImagePath,
          sort_order: 1,
        });
        if (imageErr) throw imageErr;
      }

      setSuccessMsg(`"${title}" ${editingItemId ? 'updated' : 'added'} in your verified project portfolio!`);
      setShowAddModal(false);
      resetForm();
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error && err.message.toLowerCase().includes('bucket not found')
        ? 'Portfolio image storage is not set up in Supabase. Apply migration 34_repair_portfolio_storage_bucket.sql, then try again.'
        : err instanceof Error ? err.message : 'Failed to save project';
      setErrorMsg(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}" from your portfolio?`)) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.from('portfolio_items').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not remove portfolio project.');
      return;
    }
    setSuccessMsg('Portfolio project removed.');
    await loadData();
  };

  return (
    <AppLayout
      userRole="contractor"
      title="Past Projects Portfolio"
      subtitle="Showcase your successfully completed residential houses, renovations, and construction craftsmanship to homeowners"
      backHref="/contractor/dashboard"
    >
      <div className="w-full space-y-6">
        {/* Floating Upper-Right Toast Pop-up Notification */}
        {(errorMsg || successMsg) && (
          <div className="fixed top-5 right-5 z-[100] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
            {errorMsg && (
              <div className="p-4 rounded-xl bg-white border border-red-200 shadow-xl text-red-700 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                  <div className="font-semibold leading-relaxed">{errorMsg}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0"
                >
                  <X className="w-4 h-4" />
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
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <section
          className="relative overflow-hidden rounded-3xl bg-[#083b72] px-6 py-8 text-white shadow-sm sm:px-9"
          style={{
            backgroundImage: 'linear-gradient(90deg, rgba(4,38,81,.96), rgba(7,62,121,.7), rgba(7,62,121,.12)), url("https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=85")',
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div className="relative max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-100">
              <Sparkles className="h-4 w-4" />
              Showcase your craftsmanship
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your completed work, presented professionally.</h1>
            <p className="mt-2 max-w-xl text-sm text-blue-100">
              Help homeowners see the quality of your builds when they review your contractor profile and proposals.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              Add Successful Project
            </button>
          </div>
        </section>

        <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Verified Completed Builds</h2>
            <p className="mt-1 text-xs text-slate-500">Homeowners can inspect your past builds when reviewing quotes.</p>
          </div>
          <span className="text-xs font-semibold text-slate-400">{portfolioItems.length} showcase {portfolioItems.length === 1 ? 'project' : 'projects'}</span>
        </div>

        {/* Portfolio Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
          </div>
        ) : loadError ? (
          <div className="p-12 text-center text-xs text-red-600 bg-white rounded-2xl border border-red-200">{loadError}</div>
        ) : portfolioItems.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-3">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-800 text-base">No completed projects added yet</div>
            <p className="text-slate-400 max-w-md mx-auto">
              Add your completed residential builds, renovations, or structural works so homeowners can review your craftsmanship before awarding bids.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={openAddModal}
                className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs"
              >
                + Add Your First Project
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {portfolioItems.map((item) => {
              const primaryImg = portfolioImageUrls.get(item.id);

              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    {/* Project Image */}
                    <div className="relative h-48 w-full overflow-hidden bg-slate-100 flex items-center justify-center">
                      {primaryImg ? (
                        <img
                          src={primaryImg}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="text-center text-slate-400 p-4 space-y-1">
                          <ImageIcon className="w-8 h-8 mx-auto text-slate-300" />
                          <div className="text-[11px]">Completed Build</div>
                        </div>
                      )}
                      <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-800 shadow-xs backdrop-blur-xs">
                        {item.house_type ? item.house_type.replace('_', ' ') : 'Residential'}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-3 p-5">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.year_completed ? `Completed in ${item.year_completed}` : 'Completion year not provided'}</span>
                        </div>
                      </div>

                      {item.description && (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 py-2 text-xs text-slate-600">
                        {item.floor_area_sqm && (
                          <div>
                            <span className="text-slate-400">Area:</span> <strong className="text-slate-900">{item.floor_area_sqm} sq.m</strong>
                          </div>
                        )}
                        {item.floors && (
                          <div>
                            <span className="text-slate-400">Floors:</span> <strong className="text-slate-900">{item.floors} Storey</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 p-4 text-xs">
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Verified Showcase
                    </span>

                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      className="rounded-lg p-1 text-slate-400 transition-colors hover:text-blue-600"
                      title="Edit portfolio project"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id, item.title)}
                      className="rounded-lg p-1 text-slate-400 transition-colors hover:text-rose-600"
                      title="Remove from portfolio"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ADD SUCCESSFUL PROJECT MODAL */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{editingItemId ? 'Edit Portfolio Project' : 'Add Successful Project to Portfolio'}</h3>
                  <p className="text-xs text-slate-500">{editingItemId ? 'Update the details homeowners see in your portfolio' : 'Showcase past construction works to prospective homeowners'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSavePortfolioItem} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1">
                    Project Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter project title"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">House Type</label>
                    <select
                      value={houseType}
                      onChange={(e) => setHouseType(e.target.value as HouseType | '')}
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white text-slate-900"
                    >
                      <option value="">Select house type</option>
                      <option value="one_storey">1-Storey Bungalow</option>
                      <option value="two_storey">2-Storey House</option>
                      <option value="townhouse">Townhouse / Multi-Unit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">Year Completed</label>
                    <input
                      type="number"
                      min="1990"
                      max={new Date().getFullYear()}
                      value={yearCompleted}
                      onChange={(e) => setYearCompleted(e.target.value)}
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">Floor Area (sq.m)</label>
                    <input
                      type="number"
                      min="20"
                      value={floorArea}
                      onChange={(e) => setFloorArea(e.target.value)}
                      placeholder="Enter floor area"
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">Number of Floors</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={floors}
                      onChange={(e) => setFloors(e.target.value)}
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1">Project Description & Scope</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe construction highlights, reinforced concrete framing, premium architectural tile finishes, custom kitchen cabinetry..."
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Photo Upload or Image URL */}
                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1">
                    Upload Completed Project Photo
                  </label>
                  <div className="border border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
                    <input
                      type="file"
                      id="portfolio-file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="portfolio-file" className="cursor-pointer block">
                      {imageFile ? (
                        <div className="text-xs font-bold text-blue-600 flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>{imageFile.name} ({(imageFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-600 flex items-center justify-center gap-1.5">
                          <Upload className="w-4 h-4 text-slate-400" />
                          <span>Select JPG or PNG photo of completed home</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !title.trim()}
                    className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all hover:shadow disabled:opacity-50"
                  >
                    {saving ? 'Saving Project...' : editingItemId ? 'Save Changes' : 'Publish to Portfolio'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
