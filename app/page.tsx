'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import DreamHomeEstimator from '@/components/landing/DreamHomeEstimator';
import { createClient } from '@/lib/supabase/client';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage';
import { ArrowRight, BarChart3, CreditCard, MapPin, Search, ShieldCheck, Wrench } from 'lucide-react';

type FeaturedContractor = {
  profile_id: string;
  business_name: string;
  trade_name: string | null;
  bio: string | null;
  years_experience: number | null;
  service_cities: string[] | null;
  work_types: string[] | null;
  business_address: string | null;
  province: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  min_project_budget: number | null;
  max_project_budget: number | null;
  profile_image_path: string | null;
  cover_image_path: string | null;
  portfolio_count: number;
};

type PopularService = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  filter_key: 'service' | 'search';
  filter_value: string;
  sort_order: number;
};

const benefits = [
  {
    title: 'Verified Professionals',
    text: 'Every profile is reviewed for quality, licensing and local experience before appearing on the platform.',
  },
  {
    title: 'Clear Project Planning',
    text: 'Compare quotes, track milestones and stay aligned with the right timeline and budget expectations.',
  },
  {
    title: 'Trusted Local Experts',
    text: 'Design and building specialists matched to your suburb, style and home improvement goals.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Tell us about your project',
    text: 'Share your goals, home type and budget to start with a clear brief.',
  },
  {
    number: '02',
    title: 'Compare trusted contractors',
    text: 'Review experience, reviews and service fit before choosing the right team.',
  },
  {
    number: '03',
    title: 'Manage the build with confidence',
    text: 'Track progress, approvals and milestones in one simple place from start to handover.',
  },
];

const workTypeOptions = [
  { value: 'new_build', label: 'New build' },
  { value: 'renovation', label: 'Renovation' },
  { value: 'extension', label: 'Extension' },
] as const;

export default function HomePage() {
  const router = useRouter();
  const [service, setService] = React.useState('all');
  const [location, setLocation] = React.useState('');
  const [contractors, setContractors] = React.useState<FeaturedContractor[]>([]);
  const [contractorsLoading, setContractorsLoading] = React.useState(true);
  const [contractorsError, setContractorsError] = React.useState('');
  const [isContractorCarouselPaused, setIsContractorCarouselPaused] = React.useState(false);
  const contractorCarouselRef = React.useRef<HTMLDivElement>(null);
  const [services, setServices] = React.useState<PopularService[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState(true);
  const [servicesError, setServicesError] = React.useState('');

  React.useEffect(() => {
    let active = true;

    async function loadPopularServices() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('popular_services')
        .select('id, title, description, image_url, filter_key, filter_value, sort_order')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');

      if (!active) return;
      if (error) {
        if (error.code === 'PGRST205') {
          setServicesError('Popular services are not available in Supabase yet. Apply migration 103_popular_services_management.sql, then reload this page.');
          setServicesLoading(false);
          return;
        }
        console.error(
          `Unable to load popular services (${error.code}): ${error.message}`,
          error.details,
          error.hint,
        );
        setServicesError('Popular services could not be loaded. Please try again later.');
      } else {
        setServices(data ?? []);
      }
      setServicesLoading(false);
    }

    void loadPopularServices();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (contractors.length < 2 || isContractorCarouselPaused) return;

    const interval = window.setInterval(() => {
      const carousel = contractorCarouselRef.current;
      const firstCard = carousel?.firstElementChild as HTMLElement | null;
      if (!carousel || !firstCard) return;

      const step = firstCard.offsetWidth + 12;
      const isAtEnd = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 2;
      carousel.scrollTo({
        left: isAtEnd ? 0 : carousel.scrollLeft + step,
        behavior: 'smooth',
      });
    }, 4500);

    return () => window.clearInterval(interval);
  }, [contractors.length, isContractorCarouselPaused]);

  React.useEffect(() => {
    let active = true;

    const loadFeaturedContractors = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('contractor_directory')
        .select('profile_id, business_name, trade_name, bio, years_experience, service_cities, work_types, business_address, province, rating_avg, rating_count, min_project_budget, max_project_budget, profile_image_path, cover_image_path')
        .order('rating_avg', { ascending: false, nullsFirst: false })
        .order('rating_count', { ascending: false });

      if (!active) return;

      if (error) {
        console.error(
          `Unable to load featured contractors (${error.code}): ${error.message}`,
          error.details,
          error.hint,
        );
        setContractorsError('Featured contractors could not be loaded. Please try again later.');
      } else {
        const portfolioCounts = await Promise.all(
          (data ?? []).map(async (contractor) => {
            const { count, error: countError } = await supabase
              .from('portfolio_items')
              .select('id', { count: 'exact', head: true })
              .eq('contractor_id', contractor.profile_id);

            return { contractor, count, error: countError };
          }),
        );

        if (!active) return;

        const countFailure = portfolioCounts.find((result) => result.error);
        if (countFailure?.error) {
          console.error(
            `Unable to load featured contractor portfolio count (${countFailure.error.code}): ${countFailure.error.message}`,
            countFailure.error.details,
            countFailure.error.hint,
          );
          setContractorsError('Featured contractor project counts could not be loaded. Please try again later.');
        } else {
          setContractors(
            portfolioCounts.map(({ contractor, count }) => ({
              ...contractor,
              portfolio_count: count ?? 0,
            })),
          );
        }
      }

      setContractorsLoading(false);
    };

    void loadFeaturedContractors();
    return () => {
      active = false;
    };
  }, []);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = new URLSearchParams();
    if (service !== 'all') query.set('service', service);
    if (location.trim()) query.set('location', location.trim());
    router.push(`/contractors${query.size ? `?${query.toString()}` : ''}`);
  };

  return (
    <main className="min-h-screen bg-white text-slate-800">
      <Navbar />

      <div className="w-full px-0 pb-10">
        <section
          className="relative overflow-hidden bg-[#e8f0ed] bg-cover bg-[center_55%]"
          style={{
            backgroundImage:
              'url("https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2200&q=90")',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[1] bg-[#e8f0ed]/35 lg:bg-[linear-gradient(90deg,rgba(255,255,255,0.94)_0%,rgba(255,255,255,0.86)_24%,rgba(255,255,255,0.48)_43%,rgba(255,255,255,0.08)_67%,rgba(255,255,255,0)_100%)]"
          />
          <div className="relative z-10 mx-auto grid h-[620px] w-full max-w-[1440px] items-center gap-8 overflow-hidden px-5 py-10 sm:px-8 lg:grid-cols-[0.96fr_1.04fr] lg:px-12 lg:py-10 xl:px-20">
            <div className="max-w-[660px] rounded-[28px] bg-white/25 px-5 py-5 backdrop-blur-[2px] lg:px-7 lg:py-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Your home. Our trusted experts.</p>
              <h1 className="mt-4 max-w-[600px] text-[2.65rem] font-extrabold leading-[0.94] tracking-[-0.05em] text-slate-950 sm:text-[3.8rem] lg:text-[4.25rem]">
                Find trusted home contractors near you
              </h1>
              <p className="mt-5 max-w-[440px] text-[0.9rem] leading-[1.45] text-slate-600">
                Discover verified contractors, compare portfolios, track progress and manage payments — all in one place.
              </p>

              <form onSubmit={handleSearch} className="mt-6 flex max-w-[610px] flex-col gap-2 rounded-2xl bg-white/90 p-2.5 shadow-[0_10px_28px_rgba(15,23,42,0.14)] backdrop-blur-sm md:flex-row md:items-center">
                <label className="flex min-w-[185px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <select
                    value={service}
                    onChange={(event) => setService(event.target.value)}
                    className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none"
                  >
                    <option value="all">e.g. Renovation, Plumbing, Roofing</option>
                    {workTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-[185px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Enter your city or postal code"
                    className="w-full bg-transparent text-xs text-slate-700 placeholder:text-slate-400 outline-none"
                  />
                </label>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#268463] px-6 py-2.5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(19,111,72,0.22)] transition hover:bg-[#136f48]"
                >
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </form>

              <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-600">
                <MapPin className="h-3.5 w-3.5 text-slate-500" />
                <span>Search within:</span>
                {['10 km', '25 km', '50 km'].map((distance, index) => (
                  <span key={distance} className={`rounded-md px-2 py-1 ${index === 0 ? 'bg-[#dff2e9] font-semibold text-[#136f48]' : 'bg-white/70'}`}>{distance}</span>
                ))}
              </div>
            </div>

            <div aria-hidden="true" className="hidden min-h-[620px] lg:block" />
          </div>
        </section>

        <section className="bg-white px-4 py-3 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold tracking-[-0.03em] text-slate-900">Popular Home Services</h2>
              <Link href="/contractors" className="hidden items-center gap-1 text-[10px] font-bold text-[#136f48] sm:inline-flex">View all services <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </div>

          <div className="mx-auto mt-4 grid w-full max-w-[1320px] grid-cols-[repeat(auto-fit,minmax(290px,1fr))] gap-4">
            {servicesError ? (
              <p role="alert" className="col-span-full text-center text-sm text-red-700">{servicesError}</p>
            ) : servicesLoading ? (
              <p className="col-span-full text-center text-sm text-slate-600">Loading popular services...</p>
            ) : services.length === 0 ? (
              <p className="col-span-full text-center text-sm text-slate-600">Popular services will appear here soon.</p>
            ) : (
              services.map((item) => {
                const query = new URLSearchParams({ [item.filter_key]: item.filter_value });

                return (
                  <Link
                    key={item.id}
                    href={`/contractors?${query.toString()}`}
                    className="group flex h-[132px] w-full items-center gap-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-[0_3px_10px_rgba(15,23,42,0.04)] transition hover:border-[#b8d7c6] hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)]"
                  >
                    <div className="relative h-full w-[104px] shrink-0 overflow-hidden rounded-lg">
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.04]"
                        style={{ backgroundImage: `url("${item.image_url}")` }}
                      />
                    </div>

                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-extrabold text-slate-900">{item.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-snug text-slate-500">{item.description}</p>
                    </div>
                    <div className="ml-auto hidden shrink-0 text-[#136f48] sm:block">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="bg-[#f1f8f5] px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-[1440px] gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Verified Contractors', text: 'All contractors are vetted, licensed and reviewed by Admins.', Icon: ShieldCheck },
              { title: 'Location-Based Matching', text: 'Find the best contractors near you for faster, more reliable service.', Icon: MapPin },
              { title: 'Progress Payments', text: 'Pay securely in milestones — only when work is completed.', Icon: CreditCard },
              { title: 'Project Tracking', text: 'Track updates, messages, documents and payments all in one place.', Icon: BarChart3 },
            ].map(({ title, text, Icon }) => (
              <div key={title} className="flex min-h-[92px] items-center gap-4 rounded-xl bg-white/80 px-5 py-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#e8f6ef] text-[#136f48]"><Icon className="h-7 w-7" /></span>
                <div>
                  <h3 className="text-xs font-extrabold text-slate-900">{title}</h3>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">
            <div className="flex flex-col gap-3 text-center">
              <div className="flex items-center justify-between text-left">
                <div>
                  <h2 className="text-base font-extrabold tracking-[-0.03em] text-slate-900">Featured Contractors</h2>
                  <p className="mt-0.5 text-[10px] text-slate-500">Top-rated professionals, ready for your next project.</p>
                </div>
                <Link href="/contractors" className="hidden items-center gap-1 text-[10px] font-bold text-[#136f48] sm:inline-flex">View all contractors <ArrowRight className="h-3 w-3" /></Link>
              </div>
            </div>

            {contractorsLoading ? (
              <p className="mt-8 text-center text-sm text-slate-600">Loading contractor profiles…</p>
            ) : contractorsError ? (
              <p role="alert" className="mt-8 text-center text-sm text-red-700">{contractorsError}</p>
            ) : contractors.length === 0 ? (
              <p className="mt-8 text-center text-sm text-slate-600">No approved contractor profiles are available yet.</p>
            ) : (
              <div
                ref={contractorCarouselRef}
                className="mt-4 flex w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label="Featured contractors"
                onMouseEnter={() => setIsContractorCarouselPaused(true)}
                onMouseLeave={() => setIsContractorCarouselPaused(false)}
                onFocus={() => setIsContractorCarouselPaused(true)}
                onBlur={() => setIsContractorCarouselPaused(false)}
              >
                {contractors.map((contractor, index) => {
                  const name = contractor.business_name.trim() || contractor.trade_name?.trim() || 'Contractor';
                  const contractorServices = (contractor.work_types ?? [])
                    .map((workType) => workType.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()));
                  const services = contractorServices.slice(0, 4);
                  const additionalServices = contractorServices.length - services.length;
                  const serviceLocation = contractor.service_cities?.find((city) => city.trim() && !city.includes('@'));
                  const businessLocation = [contractor.business_address, contractor.province]
                    .filter((part): part is string => Boolean(part?.trim()) && !part?.includes('@'))
                    .join(', ');
                  const location = serviceLocation || businessLocation || 'Location not listed';
                  const coverImages = [
                    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=85',
                    'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=800&q=85',
                    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=85',
                    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=85',
                  ];
                  const minBudget = contractor.min_project_budget == null ? null : Number(contractor.min_project_budget);
                  const maxBudget = contractor.max_project_budget == null ? null : Number(contractor.max_project_budget);
                  return (
                    <article key={contractor.profile_id} className="group min-w-[calc(100%_-_12px)] snap-start overflow-visible rounded-xl border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition duration-200 hover:border-[#b8d7c6] hover:shadow-[0_12px_26px_rgba(15,23,42,0.1)] sm:min-w-[calc(50%_-_6px)] lg:min-w-[calc(33.333%_-_8px)] xl:min-w-[calc(20%_-_10px)]">
                      <div className="relative h-28 overflow-visible rounded-t-xl bg-slate-100">
                        <img src={resolvePublicStorageUrl('avatars', contractor.cover_image_path) || coverImages[index % coverImages.length]} alt="" className="h-full w-full rounded-t-xl object-cover transition duration-300 group-hover:scale-105" />
                        <span className="absolute left-2 top-2 rounded-md bg-white px-2 py-1 text-[10px] font-bold text-[#136f48]"><ShieldCheck className="mr-1 inline h-3 w-3" /> Verified</span>
                        <span className="absolute bottom-[-20px] left-3 z-20 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#113d3b] text-lg font-bold text-white shadow-sm">
                          {contractor.profile_image_path ? <img src={resolvePublicStorageUrl('avatars', contractor.profile_image_path)} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
                        </span>
                      </div>
                      <div className="p-3 pt-7">
                        <h3 className="mt-2 truncate text-center text-sm font-bold text-slate-900">{name}</h3>
                        <div className="mt-2 border-b border-slate-100 pb-2">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Services</p>
                          <div className="mt-1.5 flex min-h-6 flex-wrap gap-1">
                          {services.length > 0 ? services.map((item) => (
                            <span key={item} className="rounded border border-[#dce8e2] bg-[#f4f8f5] px-2 py-1 text-[9px] font-medium text-slate-700">
                              {item}
                            </span>
                          )) : (
                            <span className="text-xs font-medium text-slate-600">Services not listed</span>
                          )}
                          {additionalServices > 0 && (
                            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[9px] font-medium text-slate-500">
                              +{additionalServices} more
                            </span>
                          )}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 border-b border-slate-100 pb-2">
                          <div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Location</p><p className="mt-1 truncate text-[10px] text-slate-700"><MapPin className="mr-1 inline h-3 w-3 text-[#136F48]" />{location}</p></div>
                          {minBudget != null || maxBudget != null ? (
                            <div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Budget</p><p className="mt-1 truncate text-[10px] text-slate-700">{minBudget != null ? `₱${minBudget.toLocaleString()}` : 'Contact'} – {maxBudget != null ? `₱${maxBudget.toLocaleString()}` : 'up'}</p></div>
                          ) : null}
                        </div>
                        <Link href={`/contractors/${contractor.profile_id}`} className="mt-2 flex min-h-7 items-center justify-center rounded border border-[#d6e8de] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#136f48] transition hover:bg-[#f0f7f3]">View Profile</Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="bg-[#f4f7f4] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1320px]">
            <div className="text-center">
              <h2 className="text-[2.4rem] font-extrabold leading-tight tracking-[-0.06em] text-slate-900">Why homeowners choose HomeBuilder</h2>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf4ee] text-[#136F48]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-[1.45rem] font-extrabold tracking-[-0.04em] text-slate-900">{benefit.title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">{benefit.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#edf4f0] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1320px]">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#136F48]">How it works</p>
              <h2 className="mt-2 text-[2.4rem] font-extrabold leading-tight tracking-[-0.06em] text-slate-900">A simple way to plan your home project</h2>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                  <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#136F48]">{step.number}</span>
                  <h3 className="mt-4 text-[1.5rem] font-extrabold tracking-[-0.04em] text-slate-900">{step.title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <DreamHomeEstimator />
      </div>

      <footer className="bg-[#0f172a] px-4 py-8 text-slate-200 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[1.6rem] font-extrabold tracking-[-0.05em] text-white">HomeBuilder</p>
            <p className="mt-2 text-sm text-slate-300">New builds, renovations and trusted local experts for every stage of your project.</p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm text-slate-300">
            <Link href="/contractors" className="transition hover:text-white">Contractors</Link>
            <Link href="/#estimate" className="transition hover:text-white">Cost Calculator</Link>
            <Link href="/login" className="transition hover:text-white">Login</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
