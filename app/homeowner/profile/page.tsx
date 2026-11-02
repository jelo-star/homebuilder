'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  Calendar,
  KeyRound
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types/database';
import { formatDate } from '@/lib/utils/formatters';

export default function HomeownerProfilePage() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [city, setCity] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState('');
  const [passwordSuccess, setPasswordSuccess] = React.useState('');

  React.useEffect(() => {
    if (!errorMsg && !successMsg) return;
    const t = setTimeout(() => {
      setErrorMsg('');
      setSuccessMsg('');
    }, 4000);
    return () => clearTimeout(t);
  }, [errorMsg, successMsg]);

  React.useEffect(() => {
    async function loadProfile() {
      setLoadError('');
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        if (!user) {
          setProfile(null);
          setEmail('');
          setFullName('');
          setPhone('');
          setCity('');
          setAddress('');
          return;
        }

        setEmail(user.email || '');

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (error) throw error;

        const p = (data as Profile | null);
        setProfile(p);
        setFullName(p?.full_name || '');
        setPhone(p?.phone || '');
        setCity(p?.city || '');
        setAddress(p?.address || '');
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Profile could not be loaded.');
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error('Sign in to update your profile.');

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          city: city.trim() || null,
          address: address.trim() || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (error) throw error;
      setProfile(prev => prev ? { ...prev, full_name: fullName.trim(), phone: phone.trim() || null, city: city.trim() || null, address: address.trim() || null } : prev);

      setSuccessMsg('Profile updated successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      setErrorMsg(message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 8 || newPassword.length > 72) {
      setPasswordError('New password must be between 8 and 72 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setPasswordSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Your password has been changed.');
    } catch (changeError) {
      setPasswordError(changeError instanceof Error ? changeError.message : 'Password could not be changed.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <AppLayout
      userRole="homeowner"
      title="Homeowner Profile"
      subtitle="Manage your personal details and verified contact information"
      backHref="/homeowner/dashboard"
    >
      <div className="w-full space-y-6">
        {loading && (
          <div className="p-4 rounded-xl bg-white border border-slate-200 text-slate-500 text-xs">
            Loading profile...
          </div>
        )}
        {loadError && (
          <div className="p-4 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold">
            Profile could not be loaded: {loadError}
          </div>
        )}
        {(errorMsg || successMsg) && (
          <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200 space-y-2">
            {errorMsg && (
              <div className="p-4 rounded-xl bg-white border border-red-200 shadow-xl text-red-700 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                  <div className="font-semibold leading-relaxed">{errorMsg}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
                >
                  ?
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
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
                >
                  ?
                </button>
              </div>
            )}
          </div>
        )}

        {/* Profile Card Summary */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 font-bold text-xl flex items-center justify-center border border-blue-200">
              {fullName ? fullName.charAt(0).toUpperCase() : 'H'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">{fullName || 'Homeowner'}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                  Homeowner Account
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                {email}
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1.5 self-end sm:self-center">
            <Calendar className="w-3.5 h-3.5" />
            Member since {profile?.created_at ? formatDate(profile.created_at) : 'Not available'}
          </div>
        </div>

        {/* Edit Form */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-1">Account & Contact Information</h3>
          <p className="text-xs text-slate-500 mb-6">
            Contractors will use these details to coordinate site inspections once you award a bid.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Maria Santos"
                    className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address (Sign-In)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    disabled
                    value={email}
                    className="w-full pl-10 pr-3.5 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-slate-500 text-sm cursor-not-allowed"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Managed via Supabase Auth</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Philippine Mobile Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+63 9XX XXX XXXX"
                    className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Primary City / Municipality
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Antipolo, Rizal"
                    className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Home / Site Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, barangay, city, and province"
                    className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-all hover:shadow disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving changes...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>

        <section id="security" className="scroll-mt-6 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Account Security</h3>
              <p className="text-xs text-slate-500">Update the password you use to sign in to HomeBuilder.</p>
            </div>
          </div>

          {passwordError && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}
          {passwordSuccess && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={passwordSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" />
                {passwordSaving ? 'Updating password...' : 'Change Password'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppLayout>
  );
}
