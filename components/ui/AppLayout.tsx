'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage';
import { UserRole } from '@/types/database';
import BrandLogo from '@/components/ui/BrandLogo';
import {
  Building2,
  Briefcase,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  PlusCircle,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  LayoutDashboard,
  HardHat,
  Users,
  Landmark,
  History,
  BarChart3,
  Settings,
  Sliders,
  FolderKanban,
  ArrowLeft,
  UserRound,
  Bell
} from 'lucide-react';

export interface ProjectWorkspaceInfo {
  projectId: string;
  projectTitle: string;
  projectRef?: string;
  backHref?: string;
}

interface SidebarLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
  userName?: string | null;
  unreadCount?: number;
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  backHref?: string;
  workspace?: ProjectWorkspaceInfo;
}

export default function AppLayout(props: SidebarLayoutProps) {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-[#f8fafc]" />}>
      <AppLayoutContent {...props} />
    </React.Suspense>
  );
}

function AppLayoutContent({
  children,
  userRole,
  userName,
  unreadCount = 0,
  title,
  subtitle,
  showBackButton,
  backHref,
  workspace,
}: SidebarLayoutProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [profileName, setProfileName] = React.useState<string | null>(userName || null);
  const [profileImageUrl, setProfileImageUrl] = React.useState('');
  const [profileLoaded, setProfileLoaded] = React.useState(false);
  const displayName = profileName || userName || 'User';
  const roleLabel = `${userRole.charAt(0).toUpperCase()}${userRole.slice(1)}`;

  React.useEffect(() => {
    if (!sidebarOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  React.useEffect(() => {
    let active = true;
    const cacheKey = `homebuildr-profile-${userRole}`;
    try {
      const cached = JSON.parse(window.localStorage.getItem(cacheKey) || 'null') as {
        name?: string;
        imageUrl?: string;
      } | null;
      if (cached?.name) setProfileName(cached.name);
      if (cached?.imageUrl) setProfileImageUrl(cached.imageUrl);
    } catch {
      // Ignore unavailable or malformed browser cache and load the profile normally.
    }

    async function loadCurrentUserName() {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user || !active) return;

      const [profileResult, contractorResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle(),
        userRole === 'contractor'
          ? supabase
          .from('contractor_profiles')
          .select('business_name, profile_image_path')
          .eq('profile_id', user.id)
          .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const profileError = profileResult.error || contractorResult.error;
      if (profileError) {
        console.error(`Unable to load sidebar profile (${profileError.code}): ${profileError.message}`);
        if (active) setProfileLoaded(true);
        return;
      }

      const name = contractorResult.data?.business_name?.trim()
        || profileResult.data?.full_name?.trim()
        || user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email?.split('@')[0]
        || userName
        || null;

      const imageUrl = contractorResult.data?.profile_image_path
        ? resolvePublicStorageUrl('avatars', contractorResult.data.profile_image_path)
        : '';
      if (active && name) setProfileName(name);
      if (active && contractorResult.data?.profile_image_path) {
        setProfileImageUrl(imageUrl);
      }
      if (active) {
        setProfileLoaded(true);
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify({ name, imageUrl }));
        } catch {
          // Ignore unavailable browser storage.
        }
      }
    }

    void loadCurrentUserName();
    return () => {
      active = false;
    };
  }, [userName, userRole]);

  // ONLY WAY TO LOGOUT is via this explicit logout handler
  const handleLogout = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Unable to sign out:', error.message);
      return;
    }
    window.location.replace('/login');
  };

  // Determine user's home dashboard path so the top-left logo navigates to their dashboard, NOT the landing page
  const dashboardHomeHref = React.useMemo(() => {
    if (userRole === 'admin') return '/admin/dashboard';
    if (userRole === 'contractor') return '/contractor/dashboard';
    return '/homeowner/dashboard';
  }, [userRole]);

  // Sidebar navigation items grouped by role or dedicated workspace
  const navGroups = React.useMemo(() => {
    if (workspace) {
      if (userRole === 'homeowner') {
        const projectPath = `/homeowner/projects/${workspace.projectId}`;
        return [
          {
            group: 'This Project',
            items: [
              { id: 'ho-project-overview', label: 'Overview', href: `${projectPath}?tab=overview`, icon: LayoutDashboard, tab: 'overview' },
              { id: 'ho-project-contractors', label: 'Contractors Proposal', href: `${projectPath}?tab=contractors`, icon: HardHat, tab: 'contractors' },
              { id: 'ho-project-plan', label: 'Project Plan', href: `${projectPath}?tab=project_plan`, icon: FolderKanban, tab: 'project_plan' },
              { id: 'ho-project-milestones', label: 'Milestones', href: `${projectPath}?tab=milestones`, icon: CheckCircle2, tab: 'milestones' },
              { id: 'ho-project-payments', label: 'Payments', href: `${projectPath}?tab=payments`, icon: Landmark, tab: 'payments' },
              { id: 'ho-project-disputes', label: 'Complaints & Disputes', href: `${projectPath}?tab=disputes`, icon: AlertTriangle, tab: 'disputes' },
            ]
          }
        ];
      }
      return [
        {
          group: 'Project Workspace',
          items: [
            { id: 'ws-overview', label: 'Overview', href: `/contractor/projects/${workspace.projectId}`, icon: LayoutDashboard },
            { id: 'ws-plan', label: 'Project Plan', href: `/contractor/projects/${workspace.projectId}/plan`, icon: FolderKanban },
            { id: 'ws-milestones', label: 'Milestones', href: `/contractor/projects/${workspace.projectId}/milestones`, icon: HardHat },
            { id: 'ws-payments', label: 'Payments', href: `/contractor/projects/${workspace.projectId}/payments`, icon: Landmark },
          ]
        }
      ];
    }
    if (userRole === 'homeowner') {
      return [
        {
          group: 'Main',
          items: [
            { id: 'ho-dashboard', label: 'Dashboard', href: '/homeowner/dashboard', icon: LayoutDashboard },
            { id: 'ho-projects', label: 'My Projects', href: '/homeowner/projects', icon: Building2 },
            { id: 'ho-completed-projects', label: 'Completed Projects', href: '/homeowner/completed-projects', icon: CheckCircle2 },
            { id: 'ho-estimator', label: 'Create Project', href: '/homeowner/projects/create', icon: PlusCircle },
          ]
        },
        {
          group: 'Account',
          items: [
            { id: 'ho-profile', label: 'Profile & Settings', href: '/homeowner/profile', icon: Users },
          ]
        }
      ];
    }
    if (userRole === 'contractor') {
      return [
        {
          group: 'Work',
          items: [
            { id: 'ct-dashboard', label: 'Dashboard', href: '/contractor/dashboard', icon: LayoutDashboard },
            { id: 'ct-projects', label: 'My Projects', href: '/contractor/projects', icon: HardHat },
            { id: 'ct-portfolio', label: 'Completed Projects & Portfolio', href: '/contractor/portfolio', icon: Briefcase },
            { id: 'ct-leads', label: 'Opportunities', href: '/contractor/opportunities', icon: Building2 },
            { id: 'ct-payments', label: 'Payments & Earnings', href: '/contractor/payments', icon: Landmark },
            { id: 'ct-payout-methods', label: 'Payout Methods', href: '/contractor/settings/payment-methods', icon: DollarSign },
          ]
        },
        {
          group: 'Credentials',
          items: [
            { id: 'ct-profile', label: 'Business Profile', href: '/contractor/profile', icon: Building2 },
            { id: 'ct-verification', label: 'License Verification', href: '/contractor/verification', icon: ShieldCheck },
          ]
        }
      ];
    }
    if (userRole === 'admin') {
      return [
        {
          group: 'Management',
          items: [
            { id: 'adm-dashboard', label: 'Overview', href: '/admin/dashboard', icon: LayoutDashboard },
            { id: 'adm-users', label: 'User Accounts', href: '/admin/users', icon: Users },
            { id: 'adm-verifications', label: 'License Verification', href: '/admin/verifications', icon: ShieldCheck },
            { id: 'adm-projects', label: 'Projects List', href: '/admin/projects', icon: Building2 },
            { id: 'adm-safekeeping-transactions', label: 'Safekeeping & Ledger', href: '/admin/transactions', icon: Landmark },
            { id: 'adm-payment-settings', label: 'Payment Settings', href: '/admin/payment-settings', icon: Settings },
            { id: 'adm-settings', label: 'Platform Share & Rules', href: '/admin/settings', icon: Sliders },
            { id: 'adm-disputes', label: 'Disputes & Claims', href: '/admin/disputes', icon: AlertTriangle },
          ]
        }
      ];
    }
    return [];
  }, [userRole, workspace]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col lg:flex-row w-full font-sans antialiased">
      {/* Mobile Top Header */}
      <div className="lg:hidden bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl text-slate-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors duration-200"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="role-sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href={dashboardHomeHref} className="flex items-center gap-2">
            <BrandLogo className="h-8 w-auto" />
          </Link>
        </div>

        <div className="flex min-w-0 items-center gap-2 pl-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
            <UserRound className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="max-w-24 truncate text-[11px] font-semibold text-slate-800">{displayName}</span>
            <span className="text-[10px] text-slate-500">{roleLabel}</span>
          </span>
        </div>
      </div>

      {/* Persistent role navigation with an independently scrolling menu and anchored logout */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-white/95 backdrop-blur-xl border-r border-slate-200/80 shadow-xl shadow-slate-900/10 flex flex-col
        transition-transform duration-300 ease-in-out
        lg:sticky lg:top-0 lg:h-screen lg:max-h-screen lg:shrink-0 lg:translate-x-0 lg:shadow-none
        ${sidebarOpen ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible'}
      `} id="role-sidebar">
        <div className="flex flex-col h-full min-h-0">
          {/* Brand Header */}
          <div className="h-16 px-5 border-b border-slate-100/90 flex items-center justify-between shrink-0">
            <Link href={dashboardHomeHref} className="flex items-center gap-2.5 group">
              <BrandLogo className="h-10 w-auto transition-transform duration-200 group-hover:scale-105" />
            </Link>

            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation menu"
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors duration-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {workspace && (
            <div className="px-4 pt-3 shrink-0">
              <Link
                href={dashboardHomeHref}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Link>
            </div>
          )}

          {/* Dedicated Project Workspace Header */}
          {workspace && (
            <div className="px-4 pt-4 pb-1 shrink-0">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 shadow-xs">
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-[10px] font-bold text-[#136F48] uppercase tracking-wider">Project Workspace</span>
                  <span className="text-[9px] font-mono text-emerald-800 font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                    {workspace.projectRef || ('PRJ-' + workspace.projectId.slice(-6).toUpperCase())}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 truncate" title={workspace.projectTitle}>
                  {workspace.projectTitle}
                </div>
              </div>
            </div>
          )}

          {/* Categorized Navigation Links */}
          <nav aria-label="Main navigation" className="flex-1 px-4 py-5 space-y-6 overflow-y-auto overscroll-contain min-h-0">
            {navGroups.map((group) => (
              <div key={group.group} className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400 tracking-[0.16em] px-3 py-1.5 uppercase">
                  {group.group}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = workspace
                    ? userRole === 'homeowner' && 'tab' in item
                      ? currentTab === item.tab || (!currentTab && item.tab === 'overview')
                      : pathname === item.href
                    : (
                      pathname === item.href || (
                        item.href !== '/admin/dashboard' &&
                        item.href !== '/homeowner/dashboard' &&
                        item.href !== '/contractor/dashboard' &&
                        !(item.href === '/homeowner/projects' && pathname.startsWith('/homeowner/projects/create')) &&
                        pathname.startsWith(`${item.href}/`)
                      )
                    );

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group/nav flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 ease-out ${
                        isActive
                        ? 'bg-emerald-50 text-emerald-900 font-bold ring-1 ring-emerald-100 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:translate-x-0.5'
                        }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200 ${
                        isActive
                          ? 'bg-white text-[#136F48] shadow-xs'
                          : 'bg-slate-50 text-slate-400 group-hover/nav:bg-white group-hover/nav:text-emerald-700'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="truncate">{item.label}</span>
                      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true" />}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-all duration-200 group/logout"
            >
              <span className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 group-hover/logout:bg-white group-hover/logout:text-rose-600 flex items-center justify-center transition-colors duration-200">
                <LogOut className="w-4 h-4" />
              </span>
              <span>Log out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop for Mobile Sidebar */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/35 backdrop-blur-[2px] z-40 lg:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Main Content Area - Soft Rounded Card Container */}
      <div className="flex-1 flex flex-col min-w-0 w-full">
        {/* Desktop Top Bar */}
        <header className="hidden lg:flex bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-8 py-3.5 items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            {title && (
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight tracking-tight">{title}</h1>
                {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {userRole === 'admin' && (
              <Link
                href="/admin/notifications"
                aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
                className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-2xs transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            )}
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-slate-800 shadow-2xs">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="" className="h-full w-full object-cover" />
              ) : !profileLoaded ? (
                <span className="h-4 w-4 animate-pulse rounded-full bg-slate-300" aria-hidden="true" />
              ) : (
                <UserRound className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="max-w-40 truncate text-xs font-semibold">{displayName}</span>
              <span className="mt-0.5 text-[10px] text-slate-500">{roleLabel}</span>
            </span>
            </div>
          </div>
        </header>

        {/* Page Body: Full-width container consuming all available space */}
        <main className="flex-1 w-full p-4 sm:p-6 lg:p-8 max-w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
