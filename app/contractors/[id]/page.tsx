'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { createClient } from '@/lib/supabase/client';
import { resolvePortfolioImageUrl } from '@/lib/supabase/storage';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  UserRound,
  WalletCards,
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
  const [reviews, setReviews] = React.useState<ReviewItem[]>([]);
  const [reviewCount, setReviewCount] = React.useState<number | null>(null);
  const [portfolioCount, setPortfolioCount] = React.useState<number | null>(null);
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
      setPortfolioCount(null);
      const supabase = createClient();

      const [authResult, directoryResult, portfolioResult, portfolioCountResult, reviewResult, reviewCountResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('contractor_directory')
          .select('profile_id, business_name, bio, years_experience, service_cities, specialties, work_types, license_no, verification_status, rating_avg, rating_count, projects_completed, business_type, trade_name, authorized_representative, business_email, business_phone, business_address, province, pcab_category, pcab_license_no, dti_sec_no, team_capacity, min_project_budget, max_project_budget')
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
      ]);

      if (!active) return;
      let contractorData = directoryResult.data as ContractorRecord | null;
      if (!contractorData && authResult.data.user) {
        const quotedContractorResult = await supabase
          .from('homeowner_contractor_profiles')
          .select('profile_id, business_name, bio, years_experience, service_cities, specialties, work_types, license_no, verification_status, rating_avg, rating_count, projects_completed, business_type, trade_name, authorized_representative, business_email, business_phone, business_address, province, pcab_category, pcab_license_no, dti_sec_no, team_capacity, min_project_budget, max_project_budget')
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
    { key: 'portfolio', label: `Portfolio${portfolioCount == null ? '' : ` (${portfolioCount})`}` },
    { key: 'reviews', label: `Reviews${reviewCount == null ? '' : ` (${reviewCount})`}` },
    { key: 'credentials', label: 'Credentials' },
  ] as const;

  return (
    <main className="min-h-screen bg-[#eef4f1] text-slate-800">
      <Navbar />
      <section className="bg-gradient-to-br from-emerald-950 to-emerald-800 py-10 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-10 2xl:px-14">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-100 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
          <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                <ShieldCheck className="h-4 w-4" />
                {contractor.verification_status === 'approved' ? 'Approved contractor' : 'Credentials not verified'}
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{contractor.business_name}</h1>
              {contractor.trade_name && <p className="mt-1 text-emerald-100">{contractor.trade_name}</p>}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-emerald-100">
                {ratingCount > 0 && <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-amber-300 text-amber-300" />{Number(contractor.rating_avg ?? 0).toFixed(1)} ({ratingCount} reviews)</span>}
                {cities.length > 0 && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{cities.join(', ')}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full px-4 py-8 sm:px-6 lg:px-10 2xl:px-14">
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-200" aria-label="Contractor profile sections">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold ${activeTab === tab.key ? 'border-[#136F48] text-[#136F48]' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && (
          <div className="space-y-6 py-7">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                {
                  label: 'Experience',
                  value: contractor.years_experience != null ? `${contractor.years_experience} years` : 'Not provided',
                  icon: Award,
                  tone: 'bg-amber-50 text-amber-700',
                },
                {
                  label: 'Portfolio projects',
                  value: portfolioCount ?? 'Not available',
                  icon: BriefcaseBusiness,
                  tone: 'bg-blue-50 text-blue-700',
                },
                {
                  label: 'Typical project budget',
                  value: minBudget != null || maxBudget != null
                    ? `${minBudget != null ? formatCurrency(minBudget) : 'Not specified'} – ${maxBudget != null ? formatCurrency(maxBudget) : 'Not specified'}`
                    : 'Contact for pricing',
                  icon: WalletCards,
                  tone: 'bg-emerald-50 text-emerald-700',
                },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                        <p className="mt-1 break-words text-sm font-bold text-slate-900">{metric.value}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-6 py-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Contractor introduction</p>
                    <h2 className="mt-1 text-xl font-extrabold text-slate-900">About {contractor.business_name}</h2>
                  </div>
                  <p className="whitespace-pre-wrap px-6 py-5 text-sm leading-7 text-slate-600">
                    {contractor.bio || 'This contractor has not added a profile description yet.'}
                  </p>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                          {item.replaceAll('_', ' ')}
                        </span>
                      ))
                    ) : (
                      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No services or specialties listed.</p>
                    )}
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <MapPin className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-extrabold text-slate-900">Service areas</h2>
                      <p className="text-xs text-slate-500">Locations listed by this contractor</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {cities.length ? cities.map((city) => (
                      <span key={city} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">{city}</span>
                    )) : <p className="text-sm text-slate-500">No service areas listed.</p>}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-extrabold text-slate-900">Business contact</h2>
                      <p className="text-xs text-slate-500">Details from the contractor profile</p>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-semibold text-slate-500">Authorized representative</dt>
                      <dd className="mt-1 break-words font-medium text-slate-800">
                        {contractor.authorized_representative?.trim() || 'Not provided'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-slate-500">Business type</dt>
                      <dd className="mt-1 break-words font-medium capitalize text-slate-800">
                        {formatBusinessType(contractor.business_type)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-slate-500">Business email</dt>
                      <dd className="mt-1 break-words font-medium text-slate-800">
                        {contractor.business_email || 'Not provided'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-slate-500">Business phone</dt>
                      <dd className="mt-1 break-words font-medium text-slate-800">
                        {contractor.business_phone || 'Not provided'}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className={`rounded-2xl border p-5 ${
                  contractor.verification_status === 'approved'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
                }`}>
                  <div className="flex items-start gap-3">
                    {contractor.verification_status === 'approved'
                      ? <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                      : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
                    <div>
                      <h2 className={`text-sm font-bold ${
                        contractor.verification_status === 'approved' ? 'text-emerald-900' : 'text-amber-900'
                      }`}>
                        {contractor.verification_status === 'approved' ? 'Approved contractor' : 'Credentials not verified'}
                      </h2>
                      <p className={`mt-1 text-xs leading-relaxed ${
                        contractor.verification_status === 'approved' ? 'text-emerald-800' : 'text-amber-800'
                      }`}>
                        {contractor.verification_status === 'approved'
                          ? `Verification status: ${contractor.verification_status}.`
                          : `Verification status: ${contractor.verification_status}. Review credentials before proceeding.`}
                      </p>
                    </div>
                  </div>
                </section>
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
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {portfolio.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    {item.portfolio_images?.[0]?.file_path && (
                      <img
                        src={resolvePortfolioImageUrl(item.portfolio_images[0].file_path)}
                        alt={`${item.title} portfolio project`}
                        className="mb-4 aspect-video w-full rounded-xl object-cover"
                      />
                    )}
                    <h2 className="font-extrabold text-slate-900">{item.title}</h2>
                    {item.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{item.description}</p>}
                    <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
                      {item.house_type && <div><dt className="inline font-semibold">Type: </dt><dd className="inline capitalize">{item.house_type.replaceAll('_', ' ')}</dd></div>}
                      {item.floors != null && <div><dt className="inline font-semibold">Floors: </dt><dd className="inline">{item.floors}</dd></div>}
                      {item.floor_area_sqm != null && <div><dt className="inline font-semibold">Area: </dt><dd className="inline">{item.floor_area_sqm} m²</dd></div>}
                      {item.year_completed != null && <div><dt className="inline font-semibold">Completed: </dt><dd className="inline">{item.year_completed}</dd></div>}
                    </dl>
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
          <section className="space-y-6 py-7">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 px-6 py-7 text-white sm:px-8">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Company information</p>
                    <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">Business credentials</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-emerald-100">
                      Registration and contact details shared by {contractor.business_name}.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-bold text-slate-900">Business registration</h3>
                      <p className="text-xs text-slate-500">Business and licensing details</p>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-4">
                    {[
                      ['Business type', formatBusinessType(contractor.business_type)],
                      ['Trade name', contractor.trade_name],
                      ['PCAB category', contractor.pcab_category],
                      ['PCAB license', contractor.pcab_license_no || contractor.license_no],
                      ['DTI / SEC number', contractor.dti_sec_no],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value || 'Not provided'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <div className="space-y-6">
                  <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                    <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
                        <UserRound className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-bold text-slate-900">Authorized representative</h3>
                        <p className="text-xs text-slate-500">Primary business contact</p>
                      </div>
                    </div>
                    <dl className="mt-4 space-y-4">
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Representative name</dt>
                        <dd className="mt-1 break-words text-sm font-medium text-slate-800">{contractor.authorized_representative || 'Not provided'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Business address</dt>
                        <dd className="mt-1 break-words text-sm font-medium text-slate-800">
                          {[contractor.business_address, contractor.province].filter(Boolean).join(', ') || 'Not provided'}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                    <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm">
                        <Phone className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-bold text-slate-900">Contact details</h3>
                        <p className="text-xs text-slate-500">Business phone and email</p>
                      </div>
                    </div>
                    <dl className="mt-4 space-y-4">
                      <div>
                        <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          <Phone className="h-3.5 w-3.5" /> Business phone
                        </dt>
                        <dd className="mt-1 break-words text-sm font-medium text-slate-800">{contractor.business_phone || 'Not provided'}</dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          <Mail className="h-3.5 w-3.5" /> Business email
                        </dt>
                        <dd className="mt-1 break-words text-sm font-medium text-slate-800">{contractor.business_email || 'Not provided'}</dd>
                      </div>
                    </dl>
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
