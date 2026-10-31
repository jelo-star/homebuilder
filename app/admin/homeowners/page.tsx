'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Users, 
  Search, 
  MapPin, 
  Phone, 
  Calendar, 
  CheckCircle2, 
  XCircle,
  Building2,
  RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Profile, Project } from '@/types/database';
import { formatDate } from '@/lib/utils/formatters';

export default function HomeownersManagementPage() {
  const [loading, setLoading] = React.useState(true);
  const [homeowners, setHomeowners] = React.useState<Profile[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: profs, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'homeowner')
      .order('created_at', { ascending: false });
    
    if (profilesError) setError(profilesError.message);
    setHomeowners((profs || []) as Profile[]);

    const { data: projs, error: projectsError } = await supabase
      .from('projects')
      .select('*');
    if (projectsError) setError(current => current ? `${current}; ${projectsError.message}` : projectsError.message);
    setProjects((projs || []) as Project[]);

    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = homeowners.filter(h => {
    return search === '' ||
      h.full_name.toLowerCase().includes(search.toLowerCase()) ||
      h.city?.toLowerCase().includes(search.toLowerCase()) ||
      h.phone?.includes(search);
  });

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Homeowner Directory"
      subtitle="Registered property owners, residential project history, and platform communication records"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {/* Search Bar */}
        <div className="flex justify-between items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search homeowner, city, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => loadData()}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Homeowners Directory Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm">Property Owners ({filtered.length})</h2>
          </div>

          {error && <div role="alert" className="p-4 text-xs text-red-700 bg-red-50">{error}</div>}
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading homeowners...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">No homeowners registered yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Homeowner</th>
                    <th className="px-4 py-3">City / Location</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Projects Posted</th>
                    <th className="px-4 py-3">Member Since</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((h) => {
                    const userProjects = projects.filter(p => p.homeowner_id === h.id);
                    return (
                      <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900">{h.full_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">ID: {h.id.slice(0, 8)}</div>
                        </td>
                        <td className="px-4 py-3.5">{h.city || '—'}</td>
                        <td className="px-4 py-3.5 font-mono">{h.phone || '—'}</td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-slate-900">{userProjects.length}</span>
                          <span className="text-slate-400 text-[11px]"> ({userProjects.filter(p => p.status === 'in_progress').length} active)</span>
                        </td>
                        <td className="px-4 py-3.5">{formatDate(h.created_at)}</td>
                        <td className="px-4 py-3.5 text-right">
                          <Link
                            href={`/admin/projects?homeowner=${h.id}`}
                            className="px-2.5 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                          >
                            View Projects
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
