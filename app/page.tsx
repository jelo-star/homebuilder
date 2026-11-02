'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import DreamHomeEstimator from '@/components/landing/DreamHomeEstimator';
import { createClient } from '@/lib/supabase/client';
import { ArrowRight, Check, MapPin, Search, ShieldCheck, Star } from 'lucide-react';

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
    let active = true;

    const loadFeaturedContractors = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('contractor_directory')
        .select('profile_id, business_name, trade_name, bio, years_experience, service_cities, work_types, business_address, province, rating_avg, rating_count')
        .order('rating_avg', { ascending: false, nullsFirst: false })
        .order('rating_count', { ascending: false })
        .limit(3);

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
    <main className="min-h-screen bg-[#edf2ee] text-slate-800">
      <Navbar />

      <div className="w-full px-0 pt-0 pb-10">
        <section
          className="relative overflow-hidden bg-[#dfeee7] bg-cover bg-[center_55%]"
          style={{
            backgroundImage:
              'url("https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2200&q=90")',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[1] bg-[#dfeee7]/40 lg:bg-[linear-gradient(90deg,rgba(223,238,231,0.84)_0%,rgba(223,238,231,0.72)_30%,rgba(223,238,231,0.52)_44%,rgba(223,238,231,0.24)_58%,rgba(223,238,231,0.04)_78%,rgba(223,238,231,0.02)_100%)]"
          />
          <div className="relative z-10 grid items-center gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[1.06fr_1.14fr] lg:px-8 lg:py-8">
            <div className="pl-0 lg:pl-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#136F48] shadow-sm">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#136F48] text-white">
                  <Check className="h-3 w-3" />
                </span>
                Your Home. Your Project. Our Choice.
              </div>

              <h1 className="mt-5 max-w-[560px] text-[3.2rem] font-extrabold leading-[0.88] tracking-[-0.06em] text-slate-900 sm:text-[4.5rem] lg:text-[5.2rem]">
                Find a contractor for your next home project
              </h1>

              <p className="mt-5 max-w-[500px] text-[1.1rem] leading-relaxed text-slate-700">
                Browse contractor profiles, compare listed services and portfolios, and manage your project in one place.
              </p>

              <form onSubmit={handleSearch} className="mt-8 flex flex-col gap-3 rounded-[20px] bg-white/65 p-3 shadow-sm backdrop-blur-sm md:flex-row md:items-center">
                <label className="flex min-w-[180px] items-center gap-2 rounded-[14px] border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-700 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Service</span>
                  <select
                    value={service}
                    onChange={(event) => setService(event.target.value)}
                    className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
                  >
                    <option value="all">All services</option>
                    {workTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-[210px] flex-1 items-center gap-2 rounded-[14px] border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-700 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Service Area</span>
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Enter a city or area"
                    className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                  />
                </label>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[#136F48] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(19,111,72,0.28)] transition hover:bg-[#0f5738]"
                >
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </form>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {['Trusted Contractors', 'Secure & Reliable', 'Manage Projects'].map((item) => (
                  <div key={item} className="inline-flex items-center gap-2 rounded-full border border-[#dfeee7] bg-white/55 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                    <ShieldCheck className="h-4 w-4 text-[#136F48]" />
                    {item}
                  </div>
                ))}
              </div>
              <Link
                href="#estimate"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#136F48] px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0f5a3b]"
              >
                Estimate your dream home
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div aria-hidden="true" className="hidden min-h-[420px] lg:block" />
          </div>
        </section>

        <section className="bg-[#f5f8f5] px-4 py-12 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-[2.5rem] font-extrabold leading-tight tracking-[-0.06em] text-slate-900">Popular Home Services</h2>
            <p className="mt-2 text-base text-slate-600">Explore work types available in the contractor directory.</p>
          </div>

          <div
            className="popular-services-marquee relative left-1/2 mt-8 w-screen -translate-x-1/2 overflow-hidden"
            role="region"
            aria-label="Popular home services"
            aria-roledescription="carousel"
          >
            {servicesError ? (
              <p role="alert" className="text-center text-sm text-red-700">{servicesError}</p>
            ) : servicesLoading ? (
              <p className="text-center text-sm text-slate-600">Loading popular services...</p>
            ) : services.length === 0 ? (
              <p className="text-center text-sm text-slate-600">Popular services will appear here soon.</p>
            ) : (
              <div
                className="popular-services-track flex w-max"
                style={{ animationDuration: `${Math.max(12, services.length * 3)}s` }}
              >
                {[false, true].map((isDuplicate) => (
                  <div
                    key={isDuplicate ? 'duplicate' : 'services'}
                    aria-hidden={isDuplicate || undefined}
                    className="flex w-max shrink-0 gap-5 pr-5"
                  >
                    {services.map((item) => {
                      const query = new URLSearchParams({ [item.filter_key]: item.filter_value });

                      return (
                        <Link
                          key={item.id}
                          href={`/contractors?${query.toString()}`}
                          tabIndex={isDuplicate ? -1 : undefined}
                          className="popular-service-card group min-w-[280px] shrink-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)]"
                        >
                          <div className="relative h-[290px] overflow-hidden">
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.04]"
                              style={{ backgroundImage: `url("${item.image_url}")` }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/15 via-transparent to-transparent" />
                            <div className="absolute left-4 top-4 rounded-full border border-white/40 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 backdrop-blur-sm">
                              {item.title}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 px-5 py-4">
                            <div>
                              <h3 className="text-[1.2rem] font-extrabold tracking-[-0.04em] text-slate-900">{item.title}</h3>
                              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                            </div>

                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#edf4ef] text-[#136F48]">
                              <ArrowRight className="h-4 w-4" />
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1320px]">
            <div className="flex flex-col gap-3 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#136F48]">Trusted by homeowners</p>
              <h2 className="text-[2.4rem] font-extrabold leading-tight tracking-[-0.06em] text-slate-900">Professional contractors built for serious projects</h2>
            </div>

            {contractorsLoading ? (
              <p className="mt-8 text-center text-sm text-slate-600">Loading contractor profiles…</p>
            ) : contractorsError ? (
              <p role="alert" className="mt-8 text-center text-sm text-red-700">{contractorsError}</p>
            ) : contractors.length === 0 ? (
              <p className="mt-8 text-center text-sm text-slate-600">No approved contractor profiles are available yet.</p>
            ) : (
              <div className="mx-auto mt-8 grid w-full max-w-4xl gap-4 md:grid-cols-2">
                {contractors.map((contractor) => {
                  const name = contractor.business_name.trim() || contractor.trade_name?.trim() || 'Contractor';
                  const contractorServices = (contractor.work_types ?? [])
                    .map((workType) => workType.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()));
                  const services = contractorServices.slice(0, 2);
                  const additionalServices = contractorServices.length - services.length;
                  const serviceLocation = contractor.service_cities?.find((city) => city.trim() && !city.includes('@'));
                  const businessLocation = [contractor.business_address, contractor.province]
                    .filter((part): part is string => Boolean(part?.trim()) && !part?.includes('@'))
                    .join(', ');
                  const location = serviceLocation || businessLocation || 'Location not listed';
                  return (
                    <article key={contractor.profile_id} className="group grid h-full grid-cols-1 content-start gap-x-5 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,0.035)] transition duration-200 hover:border-[#b8d7c6] hover:shadow-[0_12px_26px_rgba(15,23,42,0.07)] md:grid-cols-2">
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 md:col-span-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d6e8de] bg-[#f0f7f3] text-base font-bold text-[#136F48]">
                            {name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Approved contractor</p>
                            <h3 className="mt-1 truncate text-lg font-bold tracking-[-0.03em] text-slate-900">{name}</h3>
                          </div>
                        </div>
                        {contractor.rating_count ? (
                          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700" aria-label={`${Number(contractor.rating_avg ?? 0).toFixed(1)} out of 5 from ${contractor.rating_count} reviews`}>
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                            {Number(contractor.rating_avg ?? 0).toFixed(1)}
                            <span className="font-normal text-slate-500">({contractor.rating_count})</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 md:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Services</p>
                        <div className="mt-2 flex min-h-7 flex-wrap items-center gap-2">
                          {services.length > 0 ? services.map((item) => (
                            <span key={item} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                              {item}
                            </span>
                          )) : (
                            <span className="text-sm font-medium text-slate-600">Services not listed</span>
                          )}
                          {additionalServices > 0 && (
                            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                              +{additionalServices} more
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 md:col-span-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Service location</p>
                          <p className="mt-1.5 flex items-start gap-2 text-sm leading-5 text-slate-700">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#136F48]" />
                            <span className="line-clamp-2">{location}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Industry experience</p>
                          <p className="mt-1.5 text-sm font-medium text-slate-700">
                            {contractor.years_experience != null
                              ? `${contractor.years_experience} ${contractor.years_experience === 1 ? 'year' : 'years'}`
                              : 'Not provided'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 md:col-span-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Portfolio</p>
                          <p className="mt-1 text-sm font-semibold text-slate-800">
                            {contractor.portfolio_count} {contractor.portfolio_count === 1 ? 'project' : 'projects'}
                          </p>
                        </div>
                        <Link href={`/contractors/${contractor.profile_id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#136F48] bg-[#136F48] px-4 py-2 text-sm font-semibold text-white transition hover:border-[#0f5738] hover:bg-[#0f5738] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#136F48]">
                          View company
                          <ArrowRight className="h-4 w-4" />
                        </Link>
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
