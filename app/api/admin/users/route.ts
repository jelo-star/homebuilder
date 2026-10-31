import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/types/database';

const allowedRoles: UserRole[] = ['homeowner', 'contractor', 'admin'];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Sign in as an administrator to create users.' }, { status: 401 });
    }

    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: `Could not verify administrator role: ${profileError.message}` }, { status: 500 });
    }
    if (currentProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Only administrators can create user accounts.' }, { status: 403 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Provide valid account details.' }, { status: 400 });
    }

    const { email, fullName, role, phone, city, businessName, password } = body as Record<string, unknown>;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedName = typeof fullName === 'string' ? fullName.trim() : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (!normalizedName || normalizedName.length > 160) {
      return NextResponse.json({ error: 'Full name is required and must be 160 characters or fewer.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: 'Password must be between 8 and 72 characters.' }, { status: 400 });
    }
    if (typeof role !== 'string' || !allowedRoles.includes(role as UserRole)) {
      return NextResponse.json({ error: 'Choose a valid account role.' }, { status: 400 });
    }

    const normalizedBusinessName = typeof businessName === 'string' ? businessName.trim() : '';
    if (role === 'contractor' && !normalizedBusinessName) {
      return NextResponse.json({ error: 'Business name is required for contractor accounts.' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({
        error: 'Admin user creation is not configured. Set NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY.',
      }, { status: 503 });
    }

    const adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: normalizedName,
        role,
        phone: typeof phone === 'string' ? phone.trim() : '',
        city: typeof city === 'string' ? city.trim() : '',
        business_name: role === 'contractor' ? normalizedBusinessName : normalizedName,
      },
    });

    if (createError) {
      return NextResponse.json({ error: `Could not create user: ${createError.message}` }, { status: 400 });
    }
    if (!createData.user) {
      return NextResponse.json({ error: 'Supabase did not return the created user account.' }, { status: 502 });
    }

    const { error: roleUpdateError } = await adminClient
      .from('profiles')
      .update({ role: role as UserRole })
      .eq('id', createData.user.id);

    if (roleUpdateError) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(createData.user.id);
      const cleanupMessage = cleanupError
        ? ` The partially created account could not be removed (user ID ${createData.user.id}): ${cleanupError.message}.`
        : '';
      return NextResponse.json({
        error: `The account was created, but its role could not be assigned: ${roleUpdateError.message}.${cleanupMessage}`,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: createData.user.id,
        email: createData.user.email,
        fullName: normalizedName,
        role,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Admin user creation failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to create the account.',
    }, { status: 500 });
  }
}

async function authorizeAdministrator() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { response: NextResponse.json({ error: 'Sign in as an administrator to manage users.' }, { status: 401 }) };
  }

  const { data: currentProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return { response: NextResponse.json({ error: `Could not verify administrator role: ${profileError.message}` }, { status: 500 }) };
  }
  if (currentProfile?.role !== 'admin') {
    return { response: NextResponse.json({ error: 'Only administrators can manage user accounts.' }, { status: 403 }) };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { response: NextResponse.json({
      error: 'Admin user management is not configured. Set NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY.',
    }, { status: 503 }) };
  }

  return {
    user,
    adminClient: createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

function isValidUserId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function PATCH(request: Request) {
  try {
    const authorization = await authorizeAdministrator();
    if ('response' in authorization) return authorization.response;

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Provide valid profile details.' }, { status: 400 });
    }

    const { id, fullName, phone, city, address, contractorProfile } = body as Record<string, unknown>;
    const normalizedName = typeof fullName === 'string' ? fullName.trim() : '';
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedCity = typeof city === 'string' ? city.trim() : '';
    const normalizedAddress = typeof address === 'string' ? address.trim() : '';

    if (!isValidUserId(id)) {
      return NextResponse.json({ error: 'Choose a valid user profile.' }, { status: 400 });
    }
    if (!normalizedName || normalizedName.length > 160) {
      return NextResponse.json({ error: 'Full name is required and must be 160 characters or fewer.' }, { status: 400 });
    }
    if (normalizedPhone.length > 40 || normalizedCity.length > 120 || normalizedAddress.length > 300) {
      return NextResponse.json({ error: 'Phone must be 40 characters or fewer, city 120 or fewer, and address 300 or fewer.' }, { status: 400 });
    }

    const { data: targetProfile, error: targetError } = await authorization.adminClient
      .from('profiles')
      .select('role')
      .eq('id', id)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: `Could not verify the user profile: ${targetError.message}` }, { status: 500 });
    }
    if (!targetProfile) {
      return NextResponse.json({ error: 'The user profile was not found.' }, { status: 404 });
    }
    if (targetProfile.role === 'contractor' && (!contractorProfile || typeof contractorProfile !== 'object')) {
      return NextResponse.json({ error: 'Contractor business details are required for contractor accounts.' }, { status: 400 });
    }
    if (targetProfile.role !== 'contractor' && contractorProfile !== undefined) {
      return NextResponse.json({ error: 'Business details can only be updated for contractor accounts.' }, { status: 400 });
    }

    if (contractorProfile && typeof contractorProfile === 'object') {
      const contractor = contractorProfile as Record<string, unknown>;
      const businessName = typeof contractor.business_name === 'string' ? contractor.business_name.trim() : '';
      const optionalTextFields = [
        'trade_name', 'business_type', 'authorized_representative', 'business_email',
        'business_phone', 'business_address', 'province', 'bio', 'pcab_category',
        'pcab_license_no', 'pcab_expiration_date', 'dti_sec_no', 'bir_tin',
      ] as const;
      const values: Record<string, string | null> = {};
      for (const field of optionalTextFields) {
        const value = contractor[field];
        if (value !== undefined && typeof value !== 'string') {
          return NextResponse.json({ error: `Invalid contractor field: ${field}.` }, { status: 400 });
        }
        values[field] = typeof value === 'string' ? value.trim() || null : null;
      }

      const yearsExperience = Number(contractor.years_experience);
      const teamCapacity = contractor.team_capacity === '' || contractor.team_capacity == null
        ? null
        : Number(contractor.team_capacity);
      const minBudget = contractor.min_project_budget === '' || contractor.min_project_budget == null
        ? null
        : Number(contractor.min_project_budget);
      const maxBudget = contractor.max_project_budget === '' || contractor.max_project_budget == null
        ? null
        : Number(contractor.max_project_budget);
      const serviceCities = contractor.service_cities;
      const specialties = contractor.specialties;
      const finishLevels = contractor.finish_levels;
      const workTypes = contractor.work_types;
      const validArrays = (
        Array.isArray(serviceCities) && serviceCities.length <= 100
        && serviceCities.every(city => typeof city === 'string' && city.trim().length <= 120)
        && Array.isArray(specialties) && specialties.every(value => ['one_storey', 'two_storey', 'townhouse'].includes(String(value)))
        && Array.isArray(finishLevels) && finishLevels.every(value => ['basic', 'standard', 'premium'].includes(String(value)))
        && Array.isArray(workTypes) && workTypes.every(value => ['new_build', 'renovation', 'extension'].includes(String(value)))
      );

      if (!businessName || businessName.length > 200) {
        return NextResponse.json({ error: 'Business name is required and must be 200 characters or fewer.' }, { status: 400 });
      }
      if (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 150) {
        return NextResponse.json({ error: 'Years in business must be a whole number between 0 and 150.' }, { status: 400 });
      }
      if (teamCapacity !== null && (!Number.isInteger(teamCapacity) || teamCapacity < 1)) {
        return NextResponse.json({ error: 'Team capacity must be a positive whole number.' }, { status: 400 });
      }
      if ([minBudget, maxBudget].some(value => value !== null && (!Number.isFinite(value) || value < 0))) {
        return NextResponse.json({ error: 'Project budgets must be zero or greater.' }, { status: 400 });
      }
      if (!validArrays) {
        return NextResponse.json({ error: 'Contractor service areas or matching preferences are invalid.' }, { status: 400 });
      }
      if (values.business_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.business_email)) {
        return NextResponse.json({ error: 'Enter a valid contractor business email.' }, { status: 400 });
      }
      if (values.pcab_expiration_date) {
        const expiryDate = new Date(`${values.pcab_expiration_date}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(values.pcab_expiration_date)
          || !Number.isFinite(expiryDate.getTime())
          || expiryDate.toISOString().slice(0, 10) !== values.pcab_expiration_date) {
          return NextResponse.json({ error: 'PCAB license expiry date must be a valid calendar date.' }, { status: 400 });
        }
      }
      const overlongField = Object.entries(values).find(([, value]) => value && value.length > 3000);
      if (overlongField) {
        return NextResponse.json({ error: 'Contractor text fields must be 3000 characters or fewer.' }, { status: 400 });
      }

      const { error: contractorError } = await authorization.adminClient
        .from('contractor_profiles')
        .upsert({
          profile_id: id,
          business_name: businessName,
          ...values,
          pcab_license_no: values.pcab_license_no,
          license_no: values.pcab_license_no,
          years_experience: yearsExperience,
          team_capacity: teamCapacity,
          min_project_budget: minBudget,
          max_project_budget: maxBudget,
          service_cities: (serviceCities as string[]).map(city => city.trim()).filter(Boolean),
          specialties,
          finish_levels: finishLevels,
          work_types: workTypes,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'profile_id' });

      if (contractorError) {
        return NextResponse.json({ error: `Could not update contractor business details: ${contractorError.message}` }, { status: 500 });
      }
    }

    const { data, error } = await authorization.adminClient
      .from('profiles')
      .update({
        full_name: normalizedName,
        phone: normalizedPhone || null,
        city: normalizedCity || null,
        address: normalizedAddress || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: `Could not update profile: ${error.message}` }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'The user profile was not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin profile update failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to update the profile.',
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeAdministrator();
    if ('response' in authorization) return authorization.response;

    const body: unknown = await request.json();
    const id = body && typeof body === 'object'
      ? (body as Record<string, unknown>).id
      : undefined;

    if (!isValidUserId(id)) {
      return NextResponse.json({ error: 'Choose a valid user profile.' }, { status: 400 });
    }
    if (id === authorization.user.id) {
      return NextResponse.json({ error: 'You cannot delete your own administrator account.' }, { status: 400 });
    }

    const { data: targetProfile, error: targetError } = await authorization.adminClient
      .from('profiles')
      .select('role')
      .eq('id', id)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: `Could not verify the user profile: ${targetError.message}` }, { status: 500 });
    }
    if (!targetProfile) {
      return NextResponse.json({ error: 'The user profile was not found.' }, { status: 404 });
    }

    if (targetProfile.role === 'admin') {
      const { count, error: countError } = await authorization.adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');

      if (countError) {
        return NextResponse.json({ error: `Could not verify administrator accounts: ${countError.message}` }, { status: 500 });
      }
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'The last administrator account cannot be deleted.' }, { status: 400 });
      }
    }

    const { error: deleteError } = await authorization.adminClient.auth.admin.deleteUser(id);
    if (deleteError) {
      return NextResponse.json({ error: `Could not delete the account: ${deleteError.message}` }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin user deletion failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to delete the account.',
    }, { status: 500 });
  }
}
