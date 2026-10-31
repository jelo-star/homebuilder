import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { UserRole } from '@/types/database';

const publicRoles: UserRole[] = ['homeowner', 'contractor'];

function hashRateLimitIdentifier(identifier: string, secret: string) {
  return createHmac('sha256', secret).update(identifier).digest('hex');
}

async function consumeSignupLimit(
  supabaseUrl: string,
  serviceRoleKey: string,
  identifierHash: string,
  limit: number
) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/consume_public_signup_rate_limit`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_identifier_hash: identifierHash,
        p_limit: limit,
        p_window_seconds: 3600,
      }),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Signup rate limiting is unavailable: ${message || response.statusText}`);
  }
  const data: unknown = await response.json();
  return data === true;
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Provide valid account details.' }, { status: 400 });
    }

    const { email, password, fullName, role, phone, city, businessName } = body as Record<string, unknown>;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedName = typeof fullName === 'string' ? fullName.trim() : '';
    const normalizedRole = typeof role === 'string' ? role : '';
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedCity = typeof city === 'string' ? city.trim() : '';
    const normalizedBusinessName = typeof businessName === 'string' ? businessName.trim() : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (!normalizedName || normalizedName.length > 160) {
      return NextResponse.json({ error: 'Full name is required and must be 160 characters or fewer.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: 'Password must be between 8 and 72 characters.' }, { status: 400 });
    }
    if (!publicRoles.includes(normalizedRole as UserRole)) {
      return NextResponse.json({ error: 'Choose a valid account role.' }, { status: 400 });
    }
    if (normalizedRole === 'contractor' && (!normalizedBusinessName || normalizedBusinessName.length > 200)) {
      return NextResponse.json({ error: 'Business name is required and must be 200 characters or fewer.' }, { status: 400 });
    }
    if (normalizedPhone.length > 40 || normalizedCity.length > 120) {
      return NextResponse.json({ error: 'Phone must be 40 characters or fewer and city must be 120 characters or fewer.' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({
        error: 'Server-side registration is not configured. Set NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY.',
      }, { status: 503 });
    }

    const adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let emailLimitReached: boolean;
    try {
      emailLimitReached = await consumeSignupLimit(
        supabaseUrl,
        serviceRoleKey,
        hashRateLimitIdentifier(`email:${normalizedEmail}`, serviceRoleKey),
        4
      );

      const forwardedFor = request.headers.get('x-forwarded-for');
      const clientIp = request.headers.get('cf-connecting-ip')
        || request.headers.get('x-real-ip')
        || forwardedFor?.split(',').pop()?.trim();
      const ipLimitReached = clientIp
        ? await consumeSignupLimit(
          supabaseUrl,
          serviceRoleKey,
          hashRateLimitIdentifier(`ip:${clientIp}`, serviceRoleKey),
          10
        )
        : true;

      if (!emailLimitReached || !ipLimitReached) {
        return NextResponse.json(
          { error: 'Too many registration attempts. Please wait an hour before trying again.' },
          { status: 429 }
        );
      }
    } catch (rateLimitError) {
      console.error('Public signup rate limit check failed:', rateLimitError);
      return NextResponse.json({
        error: 'Registration is temporarily unavailable. Apply the signup rate-limit database migration and try again.',
      }, { status: 503 });
    }

    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: normalizedName,
        role: normalizedRole,
        phone: normalizedPhone || null,
        city: normalizedCity || null,
        business_name: normalizedRole === 'contractor' ? normalizedBusinessName : normalizedName,
      },
    });

    if (createError) {
      return NextResponse.json({ error: `Could not create account: ${createError.message}` }, { status: 400 });
    }
    if (!createData.user) {
      return NextResponse.json({ error: 'Supabase did not return the created account.' }, { status: 502 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', createData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(createData.user.id);
      const cleanupMessage = cleanupError
        ? ` The partially created account could not be removed: ${cleanupError.message}.`
        : '';
      return NextResponse.json({
        error: `The account profile could not be initialized${profileError ? `: ${profileError.message}` : '.'}${cleanupMessage}`,
      }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Public account registration failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to register the account.',
    }, { status: 500 });
  }
}
