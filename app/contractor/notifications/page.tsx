'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Bell, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileCheck, 
  Building2, 
  DollarSign,
  ChevronRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Notification } from '@/types/database';
import { formatDate } from '@/lib/utils/formatters';

export default function ContractorNotificationsPage() {
  const [loading, setLoading] = React.useState(true);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [loadError, setLoadError] = React.useState('');

  const loadData = React.useCallback(async () => {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;

    let notifs: Notification[] = [];
    if (user) {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) notifs = data as Notification[];
    }

    setNotifications(notifs);
    setLoadError('');
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData().catch(error => {
      setLoadError(error instanceof Error ? error.message : 'Could not load notifications.');
      setLoading(false);
    });
  }, [loadData]);

  const markAllAsRead = async () => {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoadError(authError.message);
      return;
    }
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (error) {
      setLoadError(error.message);
      return;
    }

    await loadData();
  };

  return (
    <AppLayout
      userRole="contractor"
      title="Notifications & Alerts"
      subtitle="Real-time alerts for project bids, milestone reviews, escrow updates, and compliance"
      backHref="/contractor/dashboard"
    >
      <div className="w-full space-y-6">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500 font-medium">
            {notifications.filter(n => !n.read_at).length} Unread Alerts
          </span>

          <button
            onClick={markAllAsRead}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Mark all as read</span>
          </button>
        </div>

        {loading ? (
          <div className="p-16 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">
            Loading notifications...
          </div>
        ) : loadError ? (
          <div className="p-16 text-center text-xs text-red-600 bg-white rounded-2xl border border-red-200">{loadError}</div>
        ) : notifications.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-2">
            <Bell className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-800 text-sm">No notifications yet</div>
            <p className="text-slate-400">You will be notified when homeowners accept bids or when escrow payments are released.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-5 flex items-start gap-4 transition-colors ${
                  !n.read_at ? 'bg-blue-50/30' : 'hover:bg-slate-50/50'
                }`}
              >
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  n.type.includes('quote')
                    ? 'bg-blue-50 text-blue-600'
                    : n.type.includes('payment') || n.type.includes('payout')
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-amber-50 text-amber-600'
                }`}>
                  <Bell className="w-4 h-4" />
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 text-sm">{n.title}</span>
                    <span className="text-[11px] text-slate-400">{formatDate(n.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{n.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
