'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Settings, 
  Save, 
  CheckCircle2, 
  ShieldCheck, 
  DollarSign, 
  Sliders, 
  Lock,
  Globe
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function PlatformSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [platformName, setPlatformName] = React.useState('');
  const [platformFeePct, setPlatformFeePct] = React.useState('');
  const [autoVerifyPcab, setAutoVerifyPcab] = React.useState<boolean | null>(null);
  const [escrowHoldDays, setEscrowHoldDays] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [configuredSettings, setConfiguredSettings] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  React.useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();
      const { data, error: queryError } = await supabase.from('app_settings').select('*');
      if (queryError) {
        setError(queryError.message);
      } else {
        setConfiguredSettings((data || []).map(s => s.key));
        data?.forEach(s => {
          if (s.key === 'platform_name') setPlatformName(String(s.value ?? ''));
          if (s.key === 'platform_fee_percent' || s.key === 'platform_fee_pct') setPlatformFeePct(String(s.value ?? ''));
          if (s.key === 'auto_verify_pcab') setAutoVerifyPcab(Boolean(s.value));
          if (s.key === 'escrow_hold_days') setEscrowHoldDays(String(s.value ?? ''));
        });
      }
      setLoading(false);
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setError(null);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const settings = [
        { key: 'platform_name', value: platformName },
        { key: 'platform_fee_percent', value: Number(platformFeePct) },
        { key: 'auto_verify_pcab', value: autoVerifyPcab },
        { key: 'escrow_hold_days', value: Number(escrowHoldDays) }
      ];

      for (const item of settings) {
        const { error } = await supabase.from('app_settings').upsert({
          key: item.key,
          value: item.value,
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
      }

      const { error: auditError } = await supabase.from('audit_log').insert({
        actor_id: user?.id,
        action: 'update_platform_settings',
        entity: 'app_settings',
        details: { platform_fee_pct: platformFeePct, escrow_hold_days: escrowHoldDays }
      });
      if (auditError) throw auditError;

      setConfiguredSettings(['platform_name', 'platform_fee_percent', 'auto_verify_pcab', 'escrow_hold_days']);
      setSuccessMsg('Platform configuration updated successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save platform settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Platform Settings & Rules"
      subtitle="Escrow fee configurations, license verification criteria, and system dispute deadlines"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {!loading && !error && configuredSettings.length === 0 && <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">No platform settings have been configured yet.</div>}
        {successMsg && (
          <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
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
          </div>
        )}

        {loading ? <div className="p-8 text-center text-xs text-slate-400">Loading platform settings...</div> : <form onSubmit={handleSave} className="space-y-6">
          {/* General Platform Settings */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              General Platform Identity
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Platform Brand Title</label>
                <input
                  type="text"
                  required
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-200"
                />
                {!configuredSettings.includes('platform_name') && <span className="text-[11px] text-slate-400 mt-1 block">Not configured</span>}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Operating Jurisdiction & Timezone</label>
                <input
                  type="text"
                  disabled
                  value="Philippines (Asia/Manila PHT, ₱ PHP)"
                  className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Financial & Escrow Rules */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Financial & Escrow Commission
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Homeowner Platform Commission (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  required
                  value={platformFeePct}
                  onChange={(e) => setPlatformFeePct(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-200"
                />
                {!configuredSettings.includes('platform_fee_percent') && <span className="text-[11px] text-slate-400 mt-1 block">Not configured</span>}
                <span className="text-[11px] text-slate-400 mt-0.5 block">Locked when a project is created, then added to the accepted contractor quote and paid by the homeowner.</span>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Dispute Cooling Period (Days)</label>
                <input
                  type="number"
                  min="3"
                  max="60"
                  required
                  value={escrowHoldDays}
                  onChange={(e) => setEscrowHoldDays(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-200"
                />
                {!configuredSettings.includes('escrow_hold_days') && <span className="text-[11px] text-slate-400 mt-1 block">Not configured</span>}
                <span className="text-[11px] text-slate-400 mt-0.5 block">Disputed funds hold window before default arbitration</span>
              </div>
            </div>
          </div>

          {/* Compliance & Verification */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Contractor Regulatory Standards
            </h3>

            <div className="space-y-3 text-xs">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoVerifyPcab === true}
                  onChange={(e) => setAutoVerifyPcab(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-slate-700 font-medium">Require manual human review for all builder license submissions</span>
                {autoVerifyPcab === null && <span className="text-slate-400">Not configured</span>}
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg shadow-xs transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>}
      </div>
    </AppLayout>
  );
}
