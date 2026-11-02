-- Add safely labeled, non-valid demo credentials for cont@gmail.com.
-- Demo files are static examples and do not represent official documents.
update public.contractor_profiles cp
set dti_sec_no = 'DEMO-ONLY-NOT-A-VALID-BUSINESS-REGISTRATION',
    bir_tin = 'DEMO-ONLY-NOT-A-VALID-TIN',
    updated_at = now()
from auth.users u
where cp.profile_id = u.id
  and lower(u.email) = lower('cont@gmail.com');

with demo_contractor as (
  select cp.profile_id
  from auth.users u
  join public.contractor_profiles cp on cp.profile_id = u.id
  where lower(u.email) = lower('cont@gmail.com')
),
demo_documents(id, doc_type, doc_title, doc_number, issuing_authority, file_path) as (
  values
    (
      '36000000-0000-0000-0000-000000000001'::uuid,
      'license'::public.doc_type,
      'Demo PCAB credential example (not a real license)',
      'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE',
      'None - demonstration only',
      '/demo-credentials/pcab-sample.png'
    ),
    (
      '36000000-0000-0000-0000-000000000002'::uuid,
      'other'::public.doc_type,
      'Demo DTI / SEC business registration (not valid)',
      'DEMO-ONLY-NOT-A-VALID-BUSINESS-REGISTRATION',
      'None - demonstration only',
      '/demo-credentials/business-registration-sample.png'
    ),
    (
      '36000000-0000-0000-0000-000000000003'::uuid,
      'permit'::public.doc_type,
      'Demo Mayor''s business permit (not valid)',
      'DEMO-ONLY-NOT-A-VALID-MAYORS-PERMIT',
      'None - demonstration only',
      '/demo-credentials/mayors-permit-sample.png'
    ),
    (
      '36000000-0000-0000-0000-000000000004'::uuid,
      'other'::public.doc_type,
      'Demo BIR certificate of registration (not valid)',
      'DEMO-ONLY-NOT-A-VALID-TIN',
      'None - demonstration only',
      '/demo-credentials/bir-registration-sample.png'
    )
)
insert into public.contractor_documents (
  id, contractor_id, doc_type, doc_title, doc_number, issuing_authority, file_path, status
)
select d.id, c.profile_id, d.doc_type, d.doc_title, d.doc_number, d.issuing_authority, d.file_path,
       'pending'::public.verification_status
from demo_contractor c
cross join demo_documents d
on conflict (id) do update
set contractor_id = excluded.contractor_id,
    doc_type = excluded.doc_type,
    doc_title = excluded.doc_title,
    doc_number = excluded.doc_number,
    issuing_authority = excluded.issuing_authority,
    file_path = excluded.file_path,
    status = 'pending'::public.verification_status,
    reject_reason = null,
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now();
