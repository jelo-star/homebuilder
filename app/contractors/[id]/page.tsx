'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { createClient } from '@/lib/supabase/client';
import { resolvePortfolioImageUrl, resolvePublicStorageUrl } from '@/lib/supabase/storage';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  MapPin,
  ShieldCheck,
  Star,
} from 'lucide-react';

type ContractorRecord = {
  profile_id: string;
  business_name: string;
  bio: string | null;
  years_experience: number | null;
  service_cities: string[] | null;
  specialties: string[] | null;
  work_types: string[] | null;
  license_no: string | null;
  verification_status: string;
  rating_avg: number | null;
  rating_count: number | null;
  projects_completed: number | null;
  business_type: string | null;
  trade_name: string | null;
  authorized_representative: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  province: string | null;
  pcab_category: string | null;
  pcab_license_no: string | null;
  dti_sec_no: string | null;
  team_capacity: number | null;
  min_project_budget: number | null;
  max_project_budget: number | null;
  profile_image_path: string | null;
  cover_image_path: string | null;
  cover_image_position: string | null;
};

type PortfolioItem = {
  id: string;
  title: string;
  description: string | null;
  house_type: string | null;
  floors: number | null;
  floor_area_sqm: number | null;
  year_completed: number | null;
  portfolio_images?: Array<{
    id: string;
    file_path: string;
    sort_order: number;
  }>;
};

type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type VerifiedLicense = {
  id: string;
  doc_title: string | null;
  doc_number: string | null;
  issuing_authority: string | null;
  file_path: string;
  created_at: string;
};

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function formatCurrency(value: number) {
  return `₱${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(value)}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatBusinessType(value: string | null) {
  if (!value) return 'Not provided';
  const labels: Record<string, string> = {
    sole_proprietorship: 'Sole Proprietorship',
    partnership: 'Partnership',
    corporation: 'Corporation',
  };
  const normalized = value.trim().toLowerCase();
  return labels[normalized] ?? normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
}

export default function ContractorPublicProfilePage() {
  return (
    <React.Suspense fallback={<main className="min-h-screen bg-slate-50"><Navbar /><p className="mx-auto max-w-7xl px-4 py-12 text-sm text-slate-600">Loading contractor profile…</p></main>}>
      <ContractorPublicProfileContent />
    </React.Suspense>
  );
}

function ContractorPublicProfileContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = String(params?.id ?? '');
  const requestedReturnTo = searchParams.get('returnTo');
  const backHref = requestedReturnTo?.startsWith('/') &&
    !requestedReturnTo.startsWith('//') &&
    !requestedReturnTo.includes('\\')
    ? requestedReturnTo
    : '/contractors';
  const backLabel = backHref.startsWith('/homeowner/projects/')
    ? 'Back to project'
    : backHref === '/contractors'
      ? 'Back to contractors'
      : 'Back to previous page';
  const validId = isUuid(id);
  const [contractor, setContractor] = React.useState<ContractorRecord | null>(null);
  const [portfolio, setPortfolio] = React.useState<PortfolioItem[]>([]);
  const [portfolioCount, setPortfolioCount] = React.useState(0);
  const [reviews, setReviews] = React.useState<ReviewItem[]>([]);
  const [verifiedLicenses, setVerifiedLicenses] = React.useState<VerifiedLicense[]>([]);
  const [reviewCount, setReviewCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [portfolioError, setPortfolioError] = React.useState('');
  const [reviewsError, setReviewsError] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'overview' | 'portfolio' | 'reviews' | 'credentials'>('overview');

  React.useEffect(() => {
    let active = true;
    if (!validId) return () => { active = false; };

    const loadProfile = async () => {
      setLoading(true);
      setLoadError('');
      setPortfolioError('');
      setReviewsError('');
      setReviewCount(null);
      const supabase = createClient();

      const [authResult, directoryResult, portfolioResult, portfolioCountResult, reviewResult, reviewCountResult, documentsResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('contractor_directory')
          .select('profile_id, business_name, bio, years_experience, service_cities, specialties, work_types, license_no, verification_status, rating_avg, rating_count, projects_completed, business_type, trade_name, authorized_representative, business_email, business_phone, business_address, province, pcab_category, pcab_license_no, dti_sec_no, team_capacity, min_project_budget, max_project_budget, profile_image_path, cover_image_path, cover_image_position')
          .eq('profile_id', id)
          .maybeSingle(),
        supabase
          .from('portfolio_items')
          .select('id, title, description, house_type, floors, floor_area_sqm, year_completed, portfolio_images(id, file_path, sort_order)')
          .eq('contractor_id', id)
          .order('year_completed', { ascending: false, nullsFirst: false })
          .limit(50),
        supabase
          .from('portfolio_items')
          .select('id', { count: 'exact', head: true })
          .eq('contractor_id', id),
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at')
          .eq('contractor_id', id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .eq('contractor_id', id),
        supabase
          .from('public_verified_contractor_licenses')
          .select('id, doc_title, doc_number, issuing_authority, file_path, created_at')
          .eq('contractor_id', id)
          .order('created_at', { ascending: true }),
      ]);

      if (!active) return;
      let contractorData = directoryResult.data as ContractorRecord | null;
      if (!contractorData && authResult.data.user) {
        const quotedContractorResult = await supabase
          .from('homeowner_contractor_profiles')
          .select('profile_id, business_name, bio, years_experience, service_cities, specialties, work_types, license_no, verification_status, rating_avg, rating_count, projects_completed, business_type, trade_name, authorized_representative, business_email, business_phone, business_address, province, pcab_category, pcab_license_no, dti_sec_no, team_capacity, min_project_budget, max_project_budget, profile_image_path, cover_image_path, cover_image_position')
          .eq('profile_id', id)
          .maybeSingle();
        if (!active) return;
        if (quotedContractorResult.error) {
          const errorMessage = quotedContractorResult.error.message;
          setLoadError(
            errorMessage.includes('homeowner_contractor_profiles')
              ? 'This contractor submitted a proposal, but quote-only profile access is not available in the database yet. Apply Supabase migration 72, then reload this page.'
              : `This contractor profile could not be loaded: ${errorMessage}`
          );
        } else {
          contractorData = quotedContractorResult.data as ContractorRecord | null;
        }
      } else if (directoryResult.error) {
        setLoadError(`This contractor profile could not be loaded: ${directoryResult.error.message}`);
      }

      setContractor(contractorData);
      if (!documentsResult.error) {
        const licenses = (documentsResult.data ?? []) as VerifiedLicense[];
        setVerifiedLicenses(licenses);
      }
      if (portfolioResult.error || portfolioCountResult.error) {
        const errorMessage = portfolioResult.error?.message ?? portfolioCountResult.error?.message;
        setPortfolioError(`Portfolio information could not be loaded: ${errorMessage}. Apply Supabase migration 73, then reload this page.`);
      } else {
        setPortfolio((portfolioResult.data ?? []) as PortfolioItem[]);
        setPortfolioCount(portfolioCountResult.count ?? 0);
      }
      if (reviewResult.error || reviewCountResult.error) {
        setReviewsError('Review information could not be loaded.');
      } else {
        setReviews((reviewResult.data ?? []) as ReviewItem[]);
        setReviewCount(reviewCountResult.count ?? 0);
      }
      setLoading(false);
    };

    void loadProfile();
    return () => {
      active = false;
    };
  }, [id, validId]);

  if (!validId) {
    return (
      <main className="min-h-screen bg-slate-50">
        <Navbar />
        <section className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-2xl font-extrabold text-slate-900">Contractor not found</h1>
          <p className="mt-3 text-sm text-slate-600">The contractor profile ID is invalid.</p>
          <Link href={backHref} className="mt-6 inline-flex rounded-xl bg-[#136F48] px-5 py-3 text-sm font-bold text-white">{backLabel}</Link>
        </section>
      </main>
    );
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-50"><Navbar /><p className="mx-auto max-w-7xl px-4 py-12 text-sm text-slate-600">Loading contractor profile…</p></main>;
  }

  if (!contractor || loadError) {
    return (
      <main className="min-h-screen bg-slate-50">
        <Navbar />
        <section className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-2xl font-extrabold text-slate-900">{loadError ? 'Profile unavailable' : 'Contractor not found'}</h1>
          <p role={loadError ? 'alert' : undefined} className="mt-3 text-sm text-slate-600">
            {loadError || 'No active, approved contractor profile exists for this profile ID.'}
          </p>
          <Link href={backHref} className="mt-6 inline-flex rounded-xl bg-[#136F48] px-5 py-3 text-sm font-bold text-white">{backLabel}</Link>
        </section>
      </main>
    );
  }

  const cities = contractor.service_cities ?? [];
  const specialties = contractor.specialties ?? [];
  const workTypes = contractor.work_types ?? [];
  const minBudget = contractor.min_project_budget == null ? null : Number(contractor.min_project_budget);
  const maxBudget = contractor.max_project_budget == null ? null : Number(contractor.max_project_budget);
  const ratingCount = reviewCount ?? 0;
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'portfolio', label: 'Portfolio' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'credentials', label: 'Credentials' },
  ] as const;

  const profileHeroImage = resolvePublicStorageUrl('avatars', contractor.cover_image_path) || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=85';
  const profileAvatarImage = resolvePublicStorageUrl('avatars', contractor.profile_image_path);

  return (
    <main className="min-h-screen bg-[#f7f9f8] text-slate-800">
      <Navbar />
      <section className="mx-auto w-full px-2 pt-2 sm:px-3 lg:px-4">
        <Link href={backHref} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#136f48]">
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>
        <div className="relative mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="relative min-h-[300px] overflow-hidden sm:min-h-[340px]">
            <div className="absolute inset-0 bg-[length:115%_auto] bg-center bg-no-repeat" style={{ backgroundImage: `url("${profileHeroImage}")`, backgroundPosition: contractor.cover_image_position || 'center' }} />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/75 via-45% to-slate-950/15" />
            <div className="relative z-10 flex min-h-[300px] items-center gap-4 p-4 sm:min-h-[340px] sm:p-5 lg:w-[62%]">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-[#113d3b] text-5xl font-bold text-white shadow-sm">
                {profileAvatarImage ? <img src={profileAvatarImage} alt="" className="h-full w-full rounded-full object-cover" /> : contractor.business_name.trim().slice(0, 1).toUpperCase() || 'C'}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{contractor.business_name}</h1>
                  {contractor.verification_status === 'approved' && <BadgeCheck className="h-6 w-6 text-[#136f48]" />}
                </div>
                <p className="mt-1 text-base text-slate-500">{contractor.bio || 'Quality craftsmanship. Stronger homes.'}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
                  {ratingCount > 0 && <span className="inline-flex items-center gap-1 font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{Number(contractor.rating_avg ?? 0).toFixed(1)} ({ratingCount} reviews)</span>}
                  {contractor.years_experience != null && <span className="inline-flex items-center gap-1"><Award className="h-4 w-4 text-[#136f48]" />{contractor.years_experience}+ years experience</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full px-2 py-2 sm:px-3 lg:px-4">
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-2" aria-label="Contractor profile sections">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-bold ${activeTab === tab.key ? 'border-[#136F48] text-[#136F48]' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && (
          <div className="space-y-4 py-4">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(280px,.8fr)]">
              <div className="space-y-4">
                <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#136f48]">Featured portfolio</p>
                      <h2 className="mt-1 text-2xl font-extrabold text-slate-950">Recent projects</h2>
                      <p className="mt-1 text-base text-slate-500">A selection of {contractor.business_name}&apos;s completed work.</p>
                    </div>
                    <button type="button" onClick={() => setActiveTab('portfolio')} className="hidden text-sm font-bold text-[#136f48] sm:block">View all projects →</button>
                  </div>
                  {portfolio.length === 0 ? (
                    <p className="mt-5 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No portfolio projects have been shared yet.</p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {portfolio.slice(0, 3).map((item) => (
                        <article key={item.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          {item.portfolio_images?.[0]?.file_path ? (
                            <img src={resolvePortfolioImageUrl(item.portfolio_images[0].file_path)} alt={`${item.title} portfolio project`} className="aspect-[2.15] w-full object-cover" />
                          ) : <div className="aspect-[1.45] w-full bg-gradient-to-br from-[#dce9e3] to-[#a9cbb9]" />}
                          <div className="p-1.5">
                          <h3 className="truncate text-[10px] font-bold text-slate-900">{item.title}</h3>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.house_type && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-500">{formatLabel(item.house_type)}</span>}
                            {item.year_completed != null && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-500">{item.year_completed}</span>}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                <section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-6 py-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Contractor introduction</p>
                    <h2 className="mt-1 text-xl font-extrabold text-slate-900">About {contractor.business_name}</h2>
                  </div>
                  <p className="whitespace-pre-wrap px-6 py-5 text-sm leading-7 text-slate-600">
                    {contractor.bio || 'This contractor has not added a profile description yet.'}
                  </p>
                </section>

                <section className="hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900">Services and specialties</h2>
                      <p className="mt-1 text-sm text-slate-500">Areas of work this contractor has listed on their profile.</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {[...workTypes, ...specialties].length ? (
                      [...workTypes, ...specialties].map((item, index) => (
                        <span key={`${item}-${index}`} className="rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-xs font-semibold capitalize text-emerald-900">
                          {formatLabel(item)}
                        </span>
                      ))
                    ) : (
                      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No services or specialties listed.</p>
                    )}
                  </div>
                </section>
              </div>

              <aside className="space-y-2">
                {contractor.verification_status === 'approved' && <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-6 w-6" /></span>
                    <div>
                      <h2 className="font-extrabold text-slate-900">Verified Contractor</h2>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">All credentials are vetted, licensed and reviewed by HomeBuildr.</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Verified licenses</p>
                  <div className="mt-2 space-y-2">
                    {verifiedLicenses.map((license) => (
                      <article key={license.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
                        <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded bg-emerald-50 text-[8px] font-bold text-emerald-700">LICENSE</div>
                        <div className="min-w-0 text-sm text-slate-600">
                          <p className="truncate font-bold text-slate-800">{license.doc_title || 'Verified license'}</p>
                          <p className="mt-0.5 text-xs uppercase tracking-wide text-emerald-700">LICENSE <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 font-bold">APPROVED</span></p>
                        </div>
                      </article>
                    ))}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {[
                      ...(contractor.license_no ? [{ id: 'profile-license', label: 'License', value: contractor.license_no }] : []),
                      ...(contractor.pcab_license_no ? [{ id: 'profile-pcab', label: 'PCAB license', value: contractor.pcab_license_no }] : []),
                      ...(contractor.dti_sec_no ? [{ id: 'profile-dti-sec', label: 'DTI / SEC', value: contractor.dti_sec_no }] : []),
                    ].map((license) => (
                      <li key={license.id} className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" /><span>{license.label}: {license.value}</span></li>
                    ))}
                  </ul>
                  {!contractor.license_no && !contractor.pcab_license_no && !contractor.dti_sec_no && verifiedLicenses.length === 0 && (
                    <p className="mt-1 text-sm text-slate-500">License approved, but no license number is available in the public database record.</p>
                  )}
                </section>}

                {(minBudget != null || maxBudget != null || cities.length > 0 || workTypes.length > 0 || specialties.length > 0) && <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  {[
                    ...(minBudget != null || maxBudget != null ? [[CalendarDays, 'Typical Project Budget', `${minBudget != null ? formatCurrency(minBudget) : 'Contact'} – ${maxBudget != null ? formatCurrency(maxBudget) : 'up'}`]] : []),
                    ...(cities.length > 0 ? [[MapPin, 'Service Areas', cities.join(', ')]] : []),
                  ].map(([Icon, label, value]) => {
                    const DetailIcon = Icon as typeof CalendarDays;
                    return <div key={label as string} className="flex items-start gap-3"><DetailIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><p className="text-sm font-bold text-slate-800">{label as string}</p><p className="mt-1 text-sm text-slate-600">{value as string}</p></div></div>;
                  })}
                  {(workTypes.length > 0 || specialties.length > 0) && <div className="flex items-start gap-3"><Building2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><p className="text-sm font-bold text-slate-800">Services</p><p className="mt-1 text-sm capitalize text-slate-600">{[...new Set([...workTypes, ...specialties])].map(formatLabel).join(', ')}</p></div></div>}
                </section>}
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'portfolio' && (
          <section className="py-7">
            {portfolioError ? <p role="alert" className="rounded-xl bg-rose-50 p-5 text-sm text-rose-800">{portfolioError}</p> : portfolio.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <BriefcaseBusiness className="mx-auto h-8 w-8 text-slate-400" />
                <h2 className="mt-3 font-bold text-slate-900">No portfolio items yet</h2>
                <p className="mt-2 text-sm text-slate-600">This contractor has not shared portfolio projects.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {portfolio.map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    {item.portfolio_images?.[0]?.file_path && (
                      <img
                        src={resolvePortfolioImageUrl(item.portfolio_images[0].file_path)}
                        alt={`${item.title} portfolio project`}
                        className="aspect-[1.4] w-full object-cover"
                      />
                    )}
                    <div className="p-4">
                    <h2 className="font-extrabold text-slate-900">{item.title}</h2>
                    {item.description && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{item.description}</p>}
                    <dl className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-slate-600">
                      {item.house_type && <div><dt className="inline font-semibold">Type: </dt><dd className="inline capitalize">{formatLabel(item.house_type)}</dd></div>}
                      {item.floors != null && <div><dt className="inline font-semibold">Floors: </dt><dd className="inline">{item.floors}</dd></div>}
                      {item.floor_area_sqm != null && <div><dt className="inline font-semibold">Area: </dt><dd className="inline">{item.floor_area_sqm} m²</dd></div>}
                      {item.year_completed != null && <div><dt className="inline font-semibold">Completed: </dt><dd className="inline">{item.year_completed}</dd></div>}
                    </dl>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'reviews' && (
          <section className="space-y-4 py-7">
            {reviewsError ? <p role="alert" className="rounded-xl bg-rose-50 p-5 text-sm text-rose-800">{reviewsError}</p> : reviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <Star className="mx-auto h-8 w-8 text-slate-400" />
                <h2 className="mt-3 font-bold text-slate-900">No reviews yet</h2>
                <p className="mt-2 text-sm text-slate-600">Reviews will appear here when homeowners share feedback.</p>
              </div>
            ) : (
              <>
                {reviewCount != null && <p className="text-sm text-slate-600">Showing {reviews.length} of {reviewCount} reviews</p>}
                {reviews.map((review) => (
                  <article key={review.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
                        {Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-4 w-4 ${index < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />)}
                        <span className="ml-1 text-sm font-bold text-slate-800">{review.rating}/5</span>
                      </div>
                      <time className="text-xs text-slate-500" dateTime={review.created_at}>{formatDate(review.created_at)}</time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{review.comment || 'No written comment provided.'}</p>
                  </article>
                ))}
              </>
            )}
          </section>
        )}

        {activeTab === 'credentials' && (
          <section className="overflow-hidden py-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-3 bg-slate-50/60 p-3 sm:p-4 lg:grid-cols-[1.15fr_.85fr]">
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">Business registration</h3>
                      <p className="text-xs text-slate-500">Business and licensing details</p>
                    </div>
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Profile</span>
                  </div>
                  <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                    {[
                      ['Business type', formatBusinessType(contractor.business_type)],
                      ['Trade name', contractor.trade_name],
                      ['PCAB category', contractor.pcab_category],
                      ['PCAB license', contractor.pcab_license_no || contractor.license_no || verifiedLicenses[0]?.doc_title],
                      ['DTI / SEC number', contractor.dti_sec_no],
                    ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
                        <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-bold text-slate-800">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-slate-900">Company profile</h4>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">At a glance</span>
                    </div>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      {contractor.years_experience != null && <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Years of experience</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-800">{contractor.years_experience}+ years</dd>
                      </div>}
                      {contractor.team_capacity != null && <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Team capacity</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-800">{contractor.team_capacity} team members</dd>
                      </div>}
                      <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Completed projects</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-800">{portfolioCount}</dd>
                      </div>
                      {(minBudget != null || maxBudget != null) && <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Typical project budget</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-800">{minBudget != null ? formatCurrency(minBudget) : 'Contact'} – {maxBudget != null ? formatCurrency(maxBudget) : 'up'}</dd>
                      </div>}
                    </dl>
                  </div>
                </section>

                <div className="grid content-start gap-3">
                  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900">Authorized representative</h3>
                        <p className="text-xs text-slate-500">Primary business contact</p>
                      </div>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="Available contact" />
                    </div>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      {contractor.authorized_representative && <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Representative name</dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-slate-800">{contractor.authorized_representative}</dd>
                      </div>}
                      {(contractor.business_address || contractor.province) && <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Business address</dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
                          {[contractor.business_address, contractor.province].filter(Boolean).join(', ')}
                        </dd>
                      </div>}
                    </dl>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900">Contact details</h3>
                        <p className="text-xs text-slate-500">Business phone and email</p>
                      </div>
                    </div>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      {contractor.business_phone && <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Business phone</dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-slate-800">{contractor.business_phone}</dd>
                      </div>}
                      {contractor.business_email && <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Business email</dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-slate-800">{contractor.business_email}</dd>
                      </div>}
                    </dl>
                    {(cities.length > 0 || workTypes.length > 0 || specialties.length > 0 || verifiedLicenses.length > 0) && <div className="mt-4 border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-extrabold text-slate-900">Services and coverage</h4>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Work profile</span>
                      </div>
                      <dl className="mt-3 grid gap-3">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Service areas</dt>
                        <dd className="mt-1 flex flex-wrap gap-1.5">{cities.map(city => <span key={city} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">{city}</span>)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Services</dt>
                        <dd className="mt-1 flex flex-wrap gap-1.5">{[...new Set([...workTypes, ...specialties])].map(service => <span key={service} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold capitalize text-slate-700">{formatLabel(service)}</span>)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Approved licenses</dt>
                        <dd className="mt-1 space-y-1.5">
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{verifiedLicenses.length} approved {verifiedLicenses.length === 1 ? 'license' : 'licenses'}</span>
                          {verifiedLicenses.length > 0 && (
                            <ul className="space-y-1">
                              {verifiedLicenses.map(license => (
                                <li key={license.id} className="rounded-md border border-emerald-100 bg-white px-2.5 py-2 text-xs text-slate-700">
                                  <span className="font-semibold">{license.doc_title || 'Approved license'}</span>
                                  {license.doc_number && <span className="ml-1 text-slate-500">· {license.doc_number}</span>}
                                  {license.issuing_authority && <span className="block mt-0.5 text-[10px] text-slate-500">Issued by {license.issuing_authority}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </dd>
                      </div>
                      </dl>
                    </div>}
                  </section>
                </div>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
