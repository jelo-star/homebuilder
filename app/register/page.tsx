'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { normalizeEmail } from '@/lib/utils/email';
import { Building2, ArrowRight, Lock, Mail, User, Phone, MapPin, AlertCircle } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = React.useState<'homeowner' | 'contractor'>('homeowner');
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [city, setCity] = React.useState('');
  const [businessName, setBusinessName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  React.useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => {
      setErrorMsg('');
    }, 4000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const normalizedEmail = normalizeEmail(email);
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          fullName,
          role,
          phone,
          city,
          businessName,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Account registration failed.');

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) {
        throw new Error(`Account created, but automatic sign-in failed: ${signInError.message}. Please sign in with your new account.`);
      }

      router.replace(role === 'homeowner' ? '/homeowner/dashboard' : '/contractor/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setErrorMsg(message);
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-slate-50 px-4 py-6 sm:px-8 lg:px-10 lg:py-4">
      <Link
        href="/"
        className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:text-emerald-800 sm:left-8 sm:top-8 lg:left-12"
      >
        <ArrowRight className="h-4 w-4 rotate-180" />
        Back to home
      </Link>

      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl items-center gap-10 pt-16 lg:grid-cols-2 lg:gap-12 lg:pt-0">
        <section className="hidden lg:block">
          <Link href="/" className="mb-12 inline-flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-900/15">
              <Building2 className="h-6 w-6" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">HomeBuildr</span>
          </Link>
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
              <Building2 className="h-4 w-4" />
              A trusted place to plan your next project
            </div>
            <h1 className="text-5xl font-black leading-[1.08] tracking-tight text-slate-950 xl:text-6xl">
              Start your home project,
              <span className="mt-2 block text-emerald-700">with the right team.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600">
              Create an account to plan projects, connect with contractors, and keep every step organized in one workspace.
            </p>
          </div>
          <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
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

        <section className="mx-auto w-full max-w-2xl">
          <div className="mb-7 text-center lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-900/15">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="text-lg font-extrabold tracking-tight text-slate-900">HomeBuildr</span>
            </Link>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-7 lg:p-6">
            <div className="mb-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Join HomeBuildr</div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Create your account</h2>
              <p className="mt-1 text-sm leading-5 text-slate-500">Choose how you’ll use HomeBuildr and set up your account.</p>
            </div>
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

          <form className="space-y-3.5 lg:space-y-3" onSubmit={handleRegister}>
            {/* Account Role Selector */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                I want to join as:
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRole('homeowner')}
                  aria-pressed={role === 'homeowner'}
                  className={`p-2.5 text-left rounded-xl border transition-all focus:outline-none focus:ring-4 focus:ring-emerald-700/10 ${
                    role === 'homeowner'
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-700'
                      : 'border-slate-200 bg-white hover:border-emerald-200 text-slate-700'
                  }`}
                >
                  <div className="font-semibold text-sm">Homeowner</div>
                  <div className="text-xs text-slate-500 mt-0.5">Build or renovate house</div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('contractor')}
                  aria-pressed={role === 'contractor'}
                  className={`p-2.5 text-left rounded-xl border transition-all focus:outline-none focus:ring-4 focus:ring-emerald-700/10 ${
                    role === 'contractor'
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-700'
                      : 'border-slate-200 bg-white hover:border-emerald-200 text-slate-700'
                  }`}
                >
                  <div className="font-semibold text-sm">Contractor</div>
                  <div className="text-xs text-slate-500 mt-0.5">Find construction jobs</div>
                </button>
              </div>
            </div>

            <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
            <div>
              <label htmlFor="full-name" className="mb-2 block text-sm font-semibold text-slate-700">Full name</label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="full-name"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                  placeholder="Juan Dela Cruz"
                />
              </div>
            </div>

            {role === 'contractor' && (
                <div>
                  <label htmlFor="business-name" className="mb-2 block text-sm font-semibold text-slate-700">Business / trade name</label>
                  <input
                    id="business-name"
                    name="businessName"
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                    placeholder="Apex Builders & Design Co."
                  />
                </div>
            )}

            <div>
              <label htmlFor="register-email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="register-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => setEmail(normalizeEmail(e.target.value))}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div className="contents">
              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-700">Phone number</label>
                <div className="relative rounded-lg shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <Phone className="h-3.5 w-3.5" />
                  </div>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                    placeholder="09170000000"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="city" className="mb-2 block text-sm font-semibold text-slate-700">City</label>
                <div className="relative rounded-lg shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <MapPin className="h-3.5 w-3.5" />
                  </div>
                  <input
                    id="city"
                    name="city"
                    type="text"
                    required
                    autoComplete="address-level2"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                    placeholder="Quezon City"
                  />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="register-password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="register-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm text-slate-900 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
                  placeholder="At least 8 characters"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">Use at least 8 characters.</p>
            </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Creating account…' : `Create ${role === 'homeowner' ? 'homeowner' : 'contractor'} account`}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </form>

            <div className="mt-4 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link href="/login" className="font-bold text-emerald-700 hover:text-emerald-800">Sign in</Link>
            </div>
          </div>
          <p className="mt-0 text-center text-[10px] leading-3 text-slate-400">
            Administrator privileges cannot be registered here. Admin roles are provisioned exclusively through authorized server-side administrative access.
          </p>
        </section>
      </div>
    </main>
  );
}
