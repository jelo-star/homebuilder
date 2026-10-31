'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Settings, 
  Bell, 
  ShieldCheck, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Key,
  Globe,
  Sliders
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ContractorSettingsPage() {
  const [emailAlerts, setEmailAlerts] = React.useState(false);
  const [leadAlerts, setLeadAlerts] = React.useState(false);
  const [payoutAlerts, setPayoutAlerts] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [savedSuccess, setSavedSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  React.useEffect(() => {
    async function loadPreferences() {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        setErrorMessage('Sign in to manage your contractor preferences.');
        setLoading(false);
        return;
      }

      const preferences = user.user_metadata?.contractor_preferences;
      setEmailAlerts(preferences?.emailAlerts === true);
      setLeadAlerts(preferences?.leadAlerts === true);
      setPayoutAlerts(preferences?.payoutAlerts === true);
      setLoading(false);
    }

    loadPreferences();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage('');
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Sign in to save your contractor preferences.');
      const { error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          contractor_preferences: { emailAlerts, leadAlerts, payoutAlerts },
        },
      });
      if (error) throw error;
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout
      userRole="contractor"
      title="Contractor Account Settings"
      subtitle="Configure notification preferences, security, and project lead alert settings"
      backHref="/contractor/dashboard"
    >
      <div className="w-full space-y-6">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{errorMessage}</div>
        )}
        {savedSuccess && (
          <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-4 rounded-xl bg-white border border-emerald-200 shadow-xl text-emerald-800 flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                <div className="font-semibold leading-relaxed">Preferences saved successfully.</div>
              </div>
              <button
                type="button"
                onClick={() => setSavedSuccess(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
              >
                ?
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Notification Preferences */}
          <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" />
              Real-Time Lead & Milestone Notifications
            </h2>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">New Matching Project Opportunities</div>
                  <div className="text-slate-500 text-[11px]">Receive alerts when homeowners publish projects in your service cities.</div>
                </div>
                <input
                  type="checkbox"
                  checked={leadAlerts}
                  onChange={(e) => setLeadAlerts(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">Milestone Sign-Off & Escrow Releases</div>
                  <div className="text-slate-500 text-[11px]">Instant notifications when homeowners approve submitted work or payouts are disbursed.</div>
                </div>
                <input
                  type="checkbox"
                  checked={payoutAlerts}
                  onChange={(e) => setPayoutAlerts(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">Email Summaries</div>
                  <div className="text-slate-500 text-[11px]">Weekly digests of new construction opportunities and market rate benchmark trends.</div>
                </div>
                <input
                  type="checkbox"
                  checked={emailAlerts}
                  onChange={(e) => setEmailAlerts(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </label>
            </div>
          </div>

          {/* Account Security */}
          <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600" />
              Account Security & Role Authorization
            </h2>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
              <div><strong>Authenticated Contractor Account:</strong> Multi-tenant isolation active.</div>
              <p className="text-[11px] text-slate-400">
                Your quotations, bank disbursements, and client submissions are encrypted and isolated via Supabase Row-Level Security.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || loading}
              className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover:shadow flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
