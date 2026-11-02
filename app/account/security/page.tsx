'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/ui/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/types/database';
import { AlertCircle, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';

const roleTitles: Record<UserRole, string> = {
  homeowner: 'Homeowner Account Security',
  contractor: 'Contractor Account Security',
  admin: 'Administrator Account Security',
};

export default function AccountSecurityPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [role, setRole] = React.useState<UserRole | null>(null);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  React.useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user?.email) {
          router.replace('/login');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!profile || !['homeowner', 'contractor', 'admin'].includes(profile.role)) {
          throw new Error('Your account role could not be verified.');
        }

        if (profile.role === 'homeowner') {
          router.replace('/homeowner/profile#security');
          return;
        }

        if (active) {
          setRole(profile.role as UserRole);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Account details could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAccount();
    return () => { active = false; };
  }, [router]);

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8 || newPassword.length > 72) {
      setError('New password must be between 8 and 72 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Your password has been changed.');
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Password could not be changed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !role) {
    return (
      <AppLayout userRole="homeowner" title="Account Security" subtitle="Loading your account…" showBackButton={false}>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {error || 'Loading account security…'}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      userRole={role}
      title={roleTitles[role]}
      subtitle="Change your sign-in password"
      showBackButton={false}
    >
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Update password</h2>
              <p className="text-xs text-slate-500">Choose a new password for your account.</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
              New password
              <input
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <span className="block font-normal text-slate-500">Use 8–72 characters.</span>
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
              Confirm new password
              <input
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              {saving ? 'Updating password…' : 'Change password'}
            </button>
          </form>
        </section>
      </div>
    </AppLayout>
  );
}
