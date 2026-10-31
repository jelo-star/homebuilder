'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Bell, 
  Send, 
  CheckCircle2, 
  Users, 
  HardHat, 
  MessageSquare,
  Clock,
  RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Notification } from '@/types/database';
import { formatDate } from '@/lib/utils/formatters';

export default function NotificationsBroadcastPage() {
  const [loading, setLoading] = React.useState(true);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [targetRole, setTargetRole] = React.useState<'all' | 'contractor' | 'homeowner'>('all');
  const [submitting, setSubmitting] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (queryError) setError(queryError.message);
    setNotifications((data || []) as Notification[]);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    setSuccessMsg('');
    setError(null);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Find recipients
      let query = supabase.from('profiles').select('id');
      if (targetRole !== 'all') {
        query = query.eq('role', targetRole);
      }
      const { data: users, error: usersError } = await query;
      if (usersError) throw usersError;

      if (users && users.length > 0) {
        const rows = users.map(u => ({
          user_id: u.id,
          type: 'platform_announcement',
          title: title.trim(),
          body: body.trim(),
          data: { sender: 'Platform Administrator', broadcast: true }
        }));

        const { error: insertError } = await supabase.from('notifications').insert(rows);
        if (insertError) throw insertError;
      }

      const { error: auditError } = await supabase.from('audit_log').insert({
        actor_id: user?.id,
        action: 'broadcast_platform_notification',
        entity: 'notifications',
        details: { title, target_role: targetRole, recipients_count: users?.length || 0 }
      });
      if (auditError) throw auditError;

      setSuccessMsg(`Announcement sent to ${users?.length || 0} users!`);
      setTitle('');
      setBody('');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout
      userRole="admin"
      userName="Platform Administrator"
      title="Platform Alerts & Announcements"
      subtitle="Broadcast notifications to homeowners and accredited builders, track system alerts and delivery logs"
      showBackButton={false}
    >
      <div className="w-full space-y-6">
        {error && <div role="alert" className="p-4 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Send Broadcast Form */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-600" />
              Publish Announcement
            </h3>

            <form onSubmit={handleBroadcast} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Target Audience</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as any)}
                  className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                >
                  <option value="all">All Platform Users (Builders & Owners)</option>
                  <option value="contractor">Contractors Only</option>
                  <option value="homeowner">Homeowners Only</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notice Title *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter announcement title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notice Body *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Message content broadcasted to recipient mobile apps and dashboards..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-xs transition-colors"
              >
                {submitting ? 'Broadcasting...' : 'Send Broadcast'}
              </button>
            </form>
          </div>

          {/* Recent Broadcasts Feed */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden lg:col-span-2 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="font-semibold text-slate-900 text-sm">Recent Platform Notifications</h2>
              <button onClick={() => loadData()} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            <div className="p-4 flex-1">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading notifications...</div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No recent notifications in queue.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <div key={n.id} className="py-3 flex items-start gap-3 text-xs first:pt-0 last:pb-0">
                      <Bell className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">{n.title}</div>
                        <p className="text-slate-600 mt-0.5">{n.body}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">{formatDate(n.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
