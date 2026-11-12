-- Notify homeowners when a contractor submits a quotation.
create or replace function public.notify_quote_status()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_homeowner uuid;
  v_is_submission boolean;
begin
  v_is_submission := new.status = 'submitted';
  if tg_op = 'UPDATE' then
    v_is_submission := v_is_submission and old.status is distinct from new.status;
  end if;

  select homeowner_id into v_homeowner
  from public.projects
  where id = new.project_id;

  if v_homeowner is not null and v_is_submission then
    insert into public.notifications(user_id, type, title, body, data)
    values (
      v_homeowner,
      'quote_submitted',
      'New contractor quotation',
      'A contractor submitted a quotation for your project.',
      jsonb_build_object('project_id', new.project_id, 'quote_id', new.id, 'status', new.status)
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if v_homeowner is not null then
      insert into public.notifications(user_id, type, title, body, data)
      values (
        v_homeowner,
        'quote_status',
        'Quote update',
        'A quote status changed to ' || new.status::text,
        jsonb_build_object('project_id', new.project_id, 'quote_id', new.id, 'status', new.status)
      );
    end if;

    insert into public.notifications(user_id, type, title, body, data)
    values (
      new.contractor_id,
      'quote_status',
      'Quote update',
      'Your quote status changed to ' || new.status::text,
      jsonb_build_object('project_id', new.project_id, 'quote_id', new.id, 'status', new.status)
    );
  end if;

  return new;
end
$$;

drop trigger if exists quotes_notify_status on public.quotes;
create trigger quotes_notify_status
after insert or update on public.quotes
for each row execute function public.notify_quote_status();
