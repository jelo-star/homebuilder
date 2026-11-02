'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { normalizeEmail } from '@/lib/utils/email';
import AuthPageBackdrop from '@/components/auth/AuthPageBackdrop';
import { House, ArrowRight, ArrowLeft, Lock, Mail, AlertCircle, ShieldCheck, Home, Users } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  // Always guarantee loading state is false on page load or when navigating back/logout
  React.useEffect(() => {
    const handlePageShow = () => setLoading(false);
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  React.useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(''), 4000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMsg('Please enter your email and password.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const targetEmail = normalizeEmail(identifier);
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profileError) {
          setErrorMsg(profileError.message);
          setLoading(false);
          return;
        }

        if (!profile) {
          const { error: signOutError } = await supabase.auth.signOut();
          setErrorMsg(
            signOutError
              ? `Your app profile is missing and sign-out failed: ${signOutError.message}`
              : 'Your Supabase account is valid, but its app profile is missing. Ask the administrator to apply migration 26, then sign in again.'
          );
          setLoading(false);
          return;
        }

        const role = profile.role;
        const targetRoute = role === 'admin' ? '/admin/dashboard' : role === 'contractor' ? '/contractor/dashboard' : '/homeowner/dashboard';
        router.push(targetRoute);
        return;
      } else {
        setErrorMsg('Authentication succeeded but user record was not found.');
        setLoading(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setErrorMsg(message);
      setLoading(false);
    }
  };

  const loginFeatures = [
    { Icon: Home, label: 'Plan your project' },
    { Icon: Users, label: 'Compare contractors' },
    { Icon: ShieldCheck, label: 'Track the work' },
  ];

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-slate-100 px-5 py-5 sm:px-8 lg:px-10">
      <AuthPageBackdrop />
      {errorMsg && (
        <div role="alert" className="fixed right-4 top-4 z-[99999] w-[calc(100%-2rem)] max-w-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-white p-4 text-xs text-red-700 shadow-xl">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="font-semibold leading-relaxed">{errorMsg}</div>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              aria-label="Dismiss error"
              className="shrink-0 rounded-lg px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-[1360px] items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-3 rounded-xl">
          <span className="flex h-11 w-11 items-center justify-center text-emerald-800 sm:h-12 sm:w-12">
            <House className="h-10 w-10 stroke-[2.4] sm:h-11 sm:w-11" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl">
            HomeBuild<span className="text-emerald-700">r</span>
          </span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-md shadow-slate-900/5 backdrop-blur transition hover:-translate-y-0.5 hover:text-emerald-800 sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-7rem)] w-full max-w-[1360px] items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.72fr)] lg:gap-16 lg:py-0">
        <section className="mx-auto w-full max-w-2xl lg:mx-0">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-emerald-200/70 bg-emerald-100/80 px-4 py-2 text-xs font-bold text-emerald-800 shadow-sm backdrop-blur">
              <ShieldCheck className="h-5 w-5" />
              A trusted place to plan your next project
            </div>
            <h1 className="text-4xl font-black leading-[1.02] tracking-[-0.045em] text-slate-950 sm:text-5xl xl:text-[4.25rem]">
              Your home project,
              <span className="mt-1 block">
                built with <span className="relative inline-block text-emerald-700">confidence<span aria-hidden="true" className="absolute -bottom-2 left-0 h-1 w-full -rotate-2 rounded-full bg-emerald-600" /></span>.
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-base font-semibold leading-7 text-slate-700 sm:text-lg">
              Plan, compare, and work with verified contractors for your dream home.
            </p>
          </div>

          <div className="mt-8 grid max-w-[390px] grid-cols-3 gap-3 sm:mt-10 sm:gap-5">
            {loginFeatures.map(({ Icon, label }) => (
              <div key={label} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[1.4rem] border border-white/80 bg-white/85 px-2 py-3 text-center shadow-lg shadow-slate-900/10 backdrop-blur-md">
                <Icon className="h-7 w-7 text-slate-950" aria-hidden="true" />
                <span className="max-w-20 text-xs font-extrabold leading-tight text-slate-900">{label}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 hidden items-center gap-2 text-xs font-semibold text-slate-600 sm:flex">
            <ShieldCheck className="h-6 w-6 fill-emerald-700 text-emerald-700 [&>path:last-child]:stroke-white" />
            Secure access for homeowners, contractors, and administrators.
          </p>
        </section>

        <section className="mx-auto w-full max-w-[440px]">
          <div className="rounded-[1.4rem] border border-white/90 bg-white/95 p-6 shadow-2xl shadow-slate-950/20 ring-1 ring-slate-900/5 backdrop-blur-xl sm:p-8">
            <div className="mb-7">
              <div className="mb-3 flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-700">
                Welcome back <span className="h-px w-12 bg-emerald-300" />
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Access your HomeBuildr account and continue where you left off.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleLogin}>
              <div>
                <label htmlFor="identifier" className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Email address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="identifier"
                    name="identifier"
                    type="email"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50/90 py-3 pl-11 pr-4 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                    placeholder="name@domain.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50/90 py-3 pl-11 pr-4 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign in to your account'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-600">
              New to HomeBuildr?{' '}
              <Link href="/register" className="font-bold text-emerald-700 hover:text-emerald-800">
                Create an account
              </Link>
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-slate-600 sm:hidden">
            Secure access for homeowners, contractors, and administrators.
          </p>
        </section>
      </div>
    </main>
  );
}
