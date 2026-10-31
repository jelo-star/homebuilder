'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Settings, 
  Bell, 
  Shield, 
  Mail, 
  MessageSquare, 
  Smartphone, 
  Save, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function HomeownerSettingsPage() {
  const [emailBids, setEmailBids] = React.useState(false);
  const [emailMilestones, setEmailMilestones] = React.useState(false);
  const [smsAlerts, setSmsAlerts] = React.useState(false);
  const [escrowAlerts, setEscrowAlerts] = React.useState(false);
  const [disputeAlerts, setDisputeAlerts] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState('');
  const [hasSavedPreferences, setHasSavedPreferences] = React.useState(false);
  const [loadingPreferences, setLoadingPreferences] = React.useState(true);

  React.useEffect(() => {
    async function loadPreferences() {
      setError('');
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const preferences = user?.user_metadata?.homeowner_notification_preferences;
        if (!preferences || typeof preferences !== 'object') return;

        setEmailBids(preferences.emailBids === true);
        setEmailMilestones(preferences.emailMilestones === true);
        setSmsAlerts(preferences.smsAlerts === true);
        setEscrowAlerts(preferences.escrowAlerts === true);
        setDisputeAlerts(preferences.disputeAlerts === true);
        setHasSavedPreferences(true);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Notification preferences could not be loaded.');
      } finally {
        setLoadingPreferences(false);
      }
    }

    loadPreferences();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to save notification preferences.');

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          homeowner_notification_preferences: {
            emailBids,
            emailMilestones,
            smsAlerts,
            escrowAlerts,
            disputeAlerts,
          },
        },
      });
      if (updateError) throw updateError;

      setHasSavedPreferences(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout
      userRole="homeowner"
      title="Account Settings"
      subtitle="Configure notification alerts, escrow safeguards, and communication preferences"
      backHref="/homeowner/dashboard"
    >
      <div className="w-full space-y-6">
        {loadingPreferences && (
          <div className="p-4 rounded-xl bg-white border border-slate-200 text-slate-500 text-xs">
            Loading notification preferences...
          </div>
        )}
        {error && (
          <div className="p-4 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold">
            {error}
          </div>
        )}
        {!hasSavedPreferences && (
          <div className="p-4 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs">
            No saved notification preferences yet. Select your choices and save them to your account.
          </div>
        )}
        {saved && (
          <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-4 rounded-xl bg-white border border-emerald-200 shadow-xl text-emerald-800 flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                <div className="font-semibold leading-relaxed">Settings updated successfully.</div>
              </div>
              <button
                type="button"
                onClick={() => setSaved(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg shrink-0 font-bold"
              >
                ?
              </button>
            </div>
          </div>
        )}

        {/* Notifications Card */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Communication & Alert Preferences</h3>
              <p className="text-xs text-slate-500">Choose how and when you receive updates regarding your construction projects</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-900">New Bid & Quotation Alerts</div>
                  <div className="text-xs text-slate-500">Receive instant email notifications when vetted contractors quote on your project</div>
                </div>
                <input
                  type="checkbox"
                  checked={emailBids}
                  onChange={(e) => setEmailBids(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-900">Milestone Submission & Photo Proofs</div>
                  <div className="text-xs text-slate-500">Be notified when construction milestones are submitted for your inspection</div>
                </div>
                <input
                  type="checkbox"
                  checked={emailMilestones}
                  onChange={(e) => setEmailMilestones(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-900">Escrow & Payment Confirmations</div>
                  <div className="text-xs text-slate-500">Receive receipt confirmation whenever milestone funds are deposited or released</div>
                </div>
                <input
                  type="checkbox"
                  checked={escrowAlerts}
                  onChange={(e) => setEscrowAlerts(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-900">Dispute & Mediation Updates</div>
                  <div className="text-xs text-slate-500">Immediate notifications if an issue or inspection hold is raised</div>
                </div>
                <input
                  type="checkbox"
                  checked={disputeAlerts}
                  onChange={(e) => setDisputeAlerts(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-900">SMS Urgent Notifications</div>
                  <div className="text-xs text-slate-500">Receive SMS text alerts on critical site deadlines (Standard telecom rates apply)</div>
                </div>
                <input
                  type="checkbox"
                  checked={smsAlerts}
                  onChange={(e) => setSmsAlerts(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-all hover:shadow disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </form>
        </div>

        {/* Security & Data Protection */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Privacy & Escrow Safeguards</h3>
              <p className="text-xs text-slate-500">How your property location and project plans are protected</p>
            </div>
          </div>

          <div className="text-xs text-slate-600 space-y-3 leading-relaxed">
            <p>
              • <strong>Address Confidentiality:</strong> Your exact street address is kept hidden during open bidding. Only the city/municipality is visible to prospective contractors until you formally award a bid.
            </p>
            <p>
              • <strong>Architectural Plans Security:</strong> Blueprints and site sketches are stored in access-restricted storage buckets and accessible only by you and contractors invited to quote.
            </p>
            <p>
              • <strong>Escrow Multi-Step Release:</strong> Milestone payments are never transferred immediately upon deposit. Funds are held in escrow and released only after you review and approve photographic proof of completion.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
