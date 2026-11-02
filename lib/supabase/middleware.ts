import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { UserRole } from '@/types/database';

function isUserRole(role: unknown): role is UserRole {
  return role === 'homeowner' || role === 'contractor' || role === 'admin';
}

function redirectWithSessionCookies(
  url: URL,
  supabaseResponse: NextResponse
) {
  const response = NextResponse.redirect(url);
  for (const cookie of supabaseResponse.cookies.getAll()) {
    const { name, value, ...options } = cookie;
    response.cookies.set(name, value, options);
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const requiredRole: UserRole | null =
    pathname === '/homeowner' || pathname.startsWith('/homeowner/')
      ? 'homeowner'
      : pathname === '/contractor' || pathname.startsWith('/contractor/')
        ? 'contractor'
        : pathname === '/admin' || pathname.startsWith('/admin/')
          ? 'admin'
          : null;
  const requiresAccount = requiredRole !== null || pathname === '/account/security';

  if (requiresAccount && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', pathname);
    return redirectWithSessionCookies(loginUrl, supabaseResponse);
  }

  if (requiresAccount && user) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error(`Unable to verify access role for ${pathname}:`, error.message);
      return new NextResponse('Account access could not be verified. Please try again later.', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (!profile || !isUserRole(profile.role)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      loginUrl.searchParams.set('next', pathname);
      return redirectWithSessionCookies(loginUrl, supabaseResponse);
    }

    if (requiredRole && profile.role !== requiredRole) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = `/${profile.role}/dashboard`;
      dashboardUrl.search = '';
      return redirectWithSessionCookies(dashboardUrl, supabaseResponse);
    }
  }

  return supabaseResponse;
}
