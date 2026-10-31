-- Supabase Auth requires token fields on manually seeded auth.users rows
-- to contain an empty string rather than NULL.

update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  recovery_token = coalesce(recovery_token, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where email is not null;

update auth.users
set
  encrypted_password = extensions.crypt('123123', extensions.gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  aud = coalesce(aud, 'authenticated'),
  role = coalesce(role, 'authenticated')
where lower(email) in ('admin@gmail.com', 'home@gmail.com', 'cont@gmail.com');
