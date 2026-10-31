'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  BarChart3, 
  Calendar, 
  Download, 
  TrendingUp, 
  Building2, 
  DollarSign, 
  ShieldAlert,
  Users
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/formatters';

export default function ReportsAndAnalyticsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState({
    totalContractors: 0,
    approvedContractors: 0,
    totalProjects: 0,
    activeProjects: 0,
    totalDisputes: 0,
    resolvedDisputes: 0,
    escrowVolume: 0,
    payoutVolume: 0,
  });

  React.useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const [
        { data: cData, error: contractorsError },
        { data: pData, error: projectsError },
        { data: dData, error: disputesError },
        { data: lData, error: ledgerError },
      ] = await Promise.all([
        supabase.from('contractor_profiles').select('verification_status'),
        supabase.from('projects').select('status, est_mid'),
        supabase.from('disputes').select('status'),
        supabase.from('escrow_ledger').select('amount, entry_type'),
      ]);
      const queryErrors = [contractorsError, projectsError, disputesError, ledgerError].filter(Boolean);
      if (queryErrors.length) {
        setError(queryErrors.map(queryError => queryError!.message).join('; '));
        setLoading(false);
        return;
      }

      const totalC = cData?.length || 0;
      const approvedC = cData?.filter(c => c.verification_status === 'approved').length || 0;
      const totalP = pData?.length || 0;
      const activeP = pData?.filter(p => p.status === 'in_progress').length || 0;
      const totalD = dData?.length || 0;
      const resolvedD = dData?.filter(d => d.status.startsWith('resolved')).length || 0;

      const escrowVol = lData?.filter(l => l.entry_type === 'deposit').reduce((sum, item) => sum + Number(item.amount), 0) || 0;
      const payoutVol = lData?.filter(l => l.entry_type === 'release').reduce((sum, item) => sum + Number(item.amount), 0) || 0;

      setStats({
        totalContractors: totalC,
        approvedContractors: approvedC,
        totalProjects: totalP,
        activeProjects: activeP,
        totalDisputes: totalD,
        resolvedDisputes: resolvedD,
        escrowVolume: escrowVol,
        payoutVolume: payoutVol,
      });

      setLoading(false);
    }
    loadData();
  }, []);

  const handleExportCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "Metric,Value\n" +
      `Total Registered Contractors,${stats.totalContractors}\n` +
      `Approved Licensed Contractors,${stats.approvedContractors}\n` +
      `Total Construction Projects,${stats.totalProjects}\n` +
      `Active Ongoing Projects,${stats.activeProjects}\n` +
      `Total Volume Inflow,${stats.escrowVolume}\n` +
      `Total Builder Payouts,${stats.payoutVolume}\n` +
      `Total Disputes Recorded,${stats.totalDisputes}\n` +
      `Resolved Disputes,${stats.resolvedDisputes}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `platform_owner_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Platform Reports & Executive Intelligence"
      subtitle="Data-driven aggregates on marketplace velocity, contractor approval ratios, financial liquidity, and dispute resolution"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
        {/* Header with Export CTA */}
        <div className="flex justify-between items-center bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">Monthly Construction & Financial Summary</h2>
            <p className="text-xs text-slate-500">Calculated in real-time from PostgreSQL ledger tables</p>
          </div>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV Report
          </button>
        </div>

        {/* Aggregate Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs font-medium text-slate-500">Contractor Accreditation Rate</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {stats.totalContractors > 0 ? `${Math.round((stats.approvedContractors / stats.totalContractors) * 100)}%` : '0%'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {stats.approvedContractors} of {stats.totalContractors} builders approved
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs font-medium text-slate-500">Active Construction Velocity</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{stats.activeProjects}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Projects currently under construction</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs font-medium text-slate-500">Cumulative Escrow Flow</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(stats.escrowVolume)}</div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
              {formatCurrency(stats.payoutVolume)} successfully disbursed
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs font-medium text-slate-500">Arbitration Clearance Rate</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {stats.totalDisputes > 0 ? `${Math.round((stats.resolvedDisputes / stats.totalDisputes) * 100)}%` : '100%'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {stats.resolvedDisputes} of {stats.totalDisputes} disputes arbitrated
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
