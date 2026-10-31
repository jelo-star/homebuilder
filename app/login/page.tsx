'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { normalizeEmail } from '@/lib/utils/email';
import { Building2, ArrowRight, ArrowLeft, Lock, Mail, AlertCircle, ShieldCheck } from 'lucide-react';

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

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-6 sm:px-8 lg:px-12">
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

      <Link
        href="/"
        className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:text-emerald-800 sm:left-8 sm:top-8 lg:left-12"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-10 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-0">
        <section className="hidden lg:block">
          <Link href="/" className="mb-12 inline-flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-900/15">
              <Building2 className="h-6 w-6" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">HomeBuildr</span>
          </Link>

          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
              <ShieldCheck className="h-4 w-4" />
              A trusted place to plan your next project
            </div>
            <h1 className="text-5xl font-black leading-[1.08] tracking-tight text-slate-950 xl:text-6xl">
              Your home project,
              <span className="mt-2 block text-emerald-700">built with confidence.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600">
              Sign in to manage your projects, connect with contractors, and keep every step organized in one workspace.
            </p>
          </div>

          <div className="mt-12 grid max-w-xl grid-cols-3 gap-3">
            {[
              ['01', 'Plan your project'],
              ['02', 'Compare contractors'],
              ['03', 'Track the work'],
            ].map(([step, label]) => (
              <div key={step} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
                <div className="text-[11px] font-bold tracking-widest text-emerald-700">{step}</div>
                <div className="mt-2 text-xs font-semibold leading-5 text-slate-700">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-7 text-center lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-900/15">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="text-lg font-extrabold tracking-tight text-slate-900">HomeBuildr</span>
            </Link>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-9">
            <div className="mb-8">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Welcome back</div>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Access your HomeBuildr account and continue where you left off.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleLogin}>
              <div>
                <label htmlFor="identifier" className="mb-2 block text-sm font-semibold text-slate-700">
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
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                    placeholder="name@domain.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
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
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign in to your account'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
              New to HomeBuildr?{' '}
              <Link href="/register" className="font-bold text-emerald-700 hover:text-emerald-800">
                Create an account
              </Link>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            Secure access for homeowners, contractors, and administrators.
          </p>
        </section>
      </div>
    </main>
  );
}
