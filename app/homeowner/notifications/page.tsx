'use client';

import React from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { 
  Bell, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  FileText, 
  DollarSign, 
  ShieldCheck, 
  Check, 
  ChevronRight,
  Filter
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Notification } from '@/types/database';
import { formatDate } from '@/lib/utils/formatters';

const NOTIFICATIONS_PAGE_SIZE = 25;

export default function HomeownerNotificationsPage() {
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [actionError, setActionError] = React.useState('');
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');
  const [actionLoading, setActionLoading] = React.useState(false);
  const [allCount, setAllCount] = React.useState(0);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const loadRequestId = React.useRef(0);
  const nextOffset = React.useRef(0);

  const loadNotifications = React.useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadingMore(false);
    setLoadError('');
    setNotifications([]);
    setHasMore(false);
    nextOffset.current = 0;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      if (requestId !== loadRequestId.current) return;
      setLoadError(authError.message);
      setNotifications([]);
      setLoading(false);
      return;
    }

    if (!user) {
      if (requestId !== loadRequestId.current) return;
      setNotifications([]);
      setAllCount(0);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    let pageQuery = supabase
      .from('notifications')
      .select('id, type, title, body, data, read_at, created_at', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(0, NOTIFICATIONS_PAGE_SIZE - 1);
    if (filter === 'unread') pageQuery = pageQuery.is('read_at', null);

    const unreadCountQuery = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);
    const [pageResult, unreadCountResult] = await Promise.all([pageQuery, unreadCountQuery]);

    if (requestId !== loadRequestId.current) return;
    if (pageResult.error) {
      setLoadError(pageResult.error.message);
      setNotifications([]);
      setHasMore(false);
    } else {
      const rows = (pageResult.data || []) as Notification[];
      const count = pageResult.count ?? rows.length;
      setNotifications(rows);
      nextOffset.current = rows.length;
      setHasMore(rows.length < count);
      if (filter === 'all') setAllCount(count);
      else setUnreadCount(count);
    }

    if (unreadCountResult.error) {
      setLoadError(unreadCountResult.error.message);
    } else {
      setUnreadCount(unreadCountResult.count ?? 0);
    }
    setLoading(false);
  }, [filter]);

  React.useEffect(() => {
    loadNotifications();
    return () => { loadRequestId.current += 1; };
  }, [loadNotifications]);

  const handleMarkAsRead = async (id: string) => {
    const notification = notifications.find(item => item.id === id);
    if (!notification || notification.read_at) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('notifications').update({ read_at: now }).eq('id', id).eq('user_id', user.id);
    if (error) {
      setActionError(error.message);
      return;
    }
    setActionError('');
    setUnreadCount(prev => Math.max(0, prev - 1));
    if (filter === 'unread') {
      nextOffset.current = Math.max(0, nextOffset.current - 1);
      setNotifications(prev => prev.filter(item => item.id !== id));
      setHasMore(nextOffset.current < Math.max(0, unreadCount - 1));
    } else {
      setNotifications(prev => prev.map(item => item.id === id ? { ...item, read_at: now } : item));
    }
  };

  const loadMoreNotifications = async () => {
    if (loadingMore || !hasMore) return;
    const requestId = loadRequestId.current;
    const offset = nextOffset.current;
    setLoadingMore(true);
    setLoadError('');

    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Sign in to load notifications.');

      let pageQuery = supabase
        .from('notifications')
        .select('id, type, title, body, data, read_at, created_at', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + NOTIFICATIONS_PAGE_SIZE - 1);
      if (filter === 'unread') pageQuery = pageQuery.is('read_at', null);

      const { data, error, count } = await pageQuery;
      if (error) throw error;
      if (requestId !== loadRequestId.current) return;

      const rows = (data || []) as Notification[];
      nextOffset.current = offset + rows.length;
      setNotifications(prev => {
        const existingIds = new Set(prev.map(item => item.id));
        return [...prev, ...rows.filter(item => !existingIds.has(item.id))];
      });
      const pageCount = count ?? nextOffset.current;
      setHasMore(nextOffset.current < pageCount);
      if (filter === 'all') setAllCount(pageCount);
      else setUnreadCount(pageCount);
    } catch (error) {
      if (requestId === loadRequestId.current) {
        setLoadError(error instanceof Error ? error.message : 'Notifications could not be loaded.');
      }
    } finally {
      if (requestId === loadRequestId.current) setLoadingMore(false);
    }
  };

  const handleMarkAllRead = async () => {
    setActionLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    if (user) {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (error) setActionError(error.message);
      else {
        setActionError('');
        setUnreadCount(0);
        if (filter === 'unread') {
          setNotifications([]);
          nextOffset.current = 0;
          setHasMore(false);
        } else {
          setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || now })));
        }
      }
    } else {
      setActionError('Sign in to update notifications.');
    }
    setActionLoading(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'quote_received':
        return <FileText className="w-5 h-5 text-blue-600" />;
      case 'milestone_submitted':
        return <Clock className="w-5 h-5 text-amber-500" />;
      case 'escrow_confirmed':
        return <ShieldCheck className="w-5 h-5 text-emerald-600" />;
      case 'dispute_update':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default:
        return <Bell className="w-5 h-5 text-indigo-600" />;
    }
  };

  return (
    <AppLayout
      userRole="homeowner"
      title="Notifications"
      subtitle="Stay informed on contractor bids, milestone submissions, and escrow movements"
      backHref="/homeowner/dashboard"
    >
      <div className="w-full space-y-6">
        {loadError && (
          <div className="p-4 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold">
            Notifications could not be loaded: {loadError}
          </div>
        )}
        {actionError && (
          <div className="p-4 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold">
            {actionError}
          </div>
        )}
        {/* Top Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Notifications ({allCount})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'unread'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4 text-emerald-600" />
              Mark all as read
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading notifications...</div>
          ) : notifications.length === 0 && !hasMore ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No notifications</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {filter === 'unread' ? 'You have read all your notifications!' : 'Activity relating to your quotes, milestones, and funds will appear here.'}
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">More notifications are available below.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((item) => {
                const isUnread = !item.read_at;
                const projectId = (item.data as any)?.project_id;

                return (
                  <div
                    key={item.id}
                    className={`p-5 transition-colors flex items-start gap-4 ${
                      isUnread ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs shrink-0">
                      {getIcon(item.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-sm ${isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                            {item.title}
                          </h4>
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {formatDate(item.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {item.body}
                      </p>

                      <div className="flex items-center gap-4 mt-3">
                        {projectId && (
                          <Link
                            href={`/homeowner/projects/${projectId}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            View Project
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                        {isUnread && (
                          <button
                            onClick={() => handleMarkAsRead(item.id)}
                            className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {!loading && hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={loadMoreNotifications}
              disabled={loadingMore}
              className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingMore ? 'Loading notifications...' : 'Load more notifications'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
