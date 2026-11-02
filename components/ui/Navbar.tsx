'use client';

import React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/types/database';
import { 
  Building2, 
  Home, 
  Briefcase, 
  ShieldCheck, 
  LogOut, 
  User, 
  Bell, 
  Menu, 
  X,
  FileText,
  DollarSign,
  AlertTriangle
} from 'lucide-react';

interface NavbarProps {
  userRole?: UserRole | null;
  userName?: string | null;
  unreadCount?: number;
}

export default function Navbar({ userRole, userName, unreadCount = 0 }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [authenticatedUser, setAuthenticatedUser] = React.useState<{ id: string; email: string | null; name: string | null } | null>(null);
  const [profileRole, setProfileRole] = React.useState<UserRole | null>(null);
  const [profileName, setProfileName] = React.useState<string | null>(null);
  const effectiveRole = userRole ?? profileRole;
  const effectiveName = userName || profileName || authenticatedUser?.name || authenticatedUser?.email?.split('@')[0] || 'User';
  const isAuthenticated = Boolean(userRole || authenticatedUser);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  React.useEffect(() => {
    const supabase = createClient();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user) {
        setAuthenticatedUser(null);
        setProfileName(null);
        setProfileRole(null);
        return;
      }

      const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
      setAuthenticatedUser({
        id: user.id,
        email: user.email ?? null,
        name: typeof metadataName === 'string' ? metadataName : null,
      });
      setProfileName(null);
      setProfileRole(null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!authenticatedUser) return;
    let active = true;

    const loadProfileSummary = async () => {
      const { data, error } = await createClient()
        .from('profiles')
        .select('full_name, role')
        .eq('id', authenticatedUser.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        console.error(`Unable to load navbar profile (${error.code}): ${error.message}`, error.details, error.hint);
        return;
      }

      setProfileName(data?.full_name?.trim() || null);
      if (data?.role === 'homeowner' || data?.role === 'contractor' || data?.role === 'admin') {
        setProfileRole(data.role);
      }
    };

    void loadProfileSummary();
    return () => {
      active = false;
    };
  }, [authenticatedUser]);

  const handleLogout = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Unable to sign out:', error.message);
      return;
    }
    window.location.replace('/login');
  };

  const navLinks = React.useMemo(() => {
    if (effectiveRole === 'homeowner') {
      return [
        { label: 'Dashboard', href: '/homeowner/dashboard', icon: Home },
        { label: 'My Projects', href: '/homeowner/projects', icon: FileText },
        { label: 'Cost Calculator', href: '/homeowner/cost-calculator', icon: DollarSign },
      ];
    }
    if (effectiveRole === 'contractor') {
      return [
        { label: 'Dashboard', href: '/contractor/dashboard', icon: Briefcase },
        { label: 'Opportunities', href: '/contractor/opportunities', icon: Building2 },
        { label: 'My Quotes', href: '/contractor/quotes', icon: FileText },
        { label: 'Verification', href: '/contractor/verification', icon: ShieldCheck },
        { label: 'Portfolio', href: '/contractor/portfolio', icon: Home },
      ];
    }
    if (effectiveRole === 'admin') {
      return [
        { label: 'Admin Overview', href: '/admin/dashboard', icon: ShieldCheck },
        { label: 'Verification', href: '/admin/contractors', icon: ShieldCheck },
        { label: 'Projects', href: '/admin/projects', icon: FileText },
        { label: 'Disputes', href: '/admin/disputes', icon: AlertTriangle },
        { label: 'Rates & Settings', href: '/admin/settings', icon: DollarSign },
        { label: 'Audit Log', href: '/admin/audit', icon: FileText },
      ];
    }
    return [
      { label: 'Find Contractors', href: '/contractors' },
      { label: 'How It Works', href: '/#how-it-works' },
      { label: 'Post a Project', href: '/homeowner/projects/new' },
      { label: 'Become a Contractor', href: '/register' },
    ];
  }, [effectiveRole]);

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-[#136F48] flex items-center justify-center text-white shadow-md shadow-emerald-900/10 group-hover:scale-105 transition-transform">
                <Home className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-slate-900 leading-tight tracking-tight text-xl">HomeBuildr</span>
                <span className="text-[10px] text-emerald-700 font-semibold tracking-wider">Your Home. Our Trusted Experts.</span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:ml-8 md:flex md:space-x-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-slate-50 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right Header / User Area */}
          <div className="hidden md:flex md:items-center md:space-x-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Link
                  href={effectiveRole === 'admin' ? '/admin/notifications' : effectiveRole === 'contractor' ? '/contractor/notifications' : '/homeowner/notifications'}
                  className="relative p-2 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-slate-50 transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                  )}
                </Link>

                <div className="flex items-center gap-2.5 rounded-xl px-2 py-1">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="max-w-36 truncate text-xs font-semibold text-slate-800">{effectiveName}</span>
                    <span className="mt-0.5 text-[10px] capitalize text-slate-500">{effectiveRole || 'Account'}</span>
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-emerald-700 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="px-5 py-2 text-sm font-bold text-white bg-[#136F48] hover:bg-[#0f5738] rounded-xl shadow-xs transition-all hover:scale-102"
                >
                  Join
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="navbar-mobile-menu"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        id="navbar-mobile-menu"
        aria-hidden={!mobileMenuOpen}
        className={`${mobileMenuOpen ? 'block' : 'hidden'} md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1`}
      >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50"
            >
              {link.label}
            </Link>
          ))}
          {isAuthenticated ? (
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="flex items-center gap-3 px-3 py-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                  <User className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-slate-800">{effectiveName}</span>
                  <span className="text-xs capitalize text-slate-500">{effectiveRole || 'Account'}</span>
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          ) : (
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-center px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-50"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-center px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#136F48] hover:bg-[#0f5738]"
              >
                Join
              </Link>
            </div>
          )}
      </div>
    </nav>
  );
}
