create or replace function public.mark_milestone_funding_transactions_released()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if new.project_id is null or new.milestone_id is null or new.gross_amount <= 0 then
    return new;
  end if;

  with eligible_transactions as (
    select
      tx.id,
      coalesce(
        sum(coalesce(tx.verified_amount, tx.amount_centavos::numeric / 100)) over (
          order by
            case when tx.milestone_id = new.milestone_id then 0 else 1 end,
            tx.created_at,
            tx.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as allocated_before
    from public.payment_transactions tx
    where tx.project_id = new.project_id
      and tx.recipient_id = new.contractor_id
      and tx.payment_status in ('PAID', 'SUCCEEDED')
      and (tx.milestone_id = new.milestone_id or tx.milestone_id is null)
  )
  update public.payment_transactions tx
     set payout_status = 'PAID'
    from eligible_transactions eligible
   where tx.id = eligible.id
     and eligible.allocated_before < new.gross_amount;

  return new;
end;
$$;

revoke all on function public.mark_milestone_funding_transactions_released() from public, anon, authenticated;

drop trigger if exists mark_milestone_funding_transactions_released on public.payouts;
create trigger mark_milestone_funding_transactions_released
after insert on public.payouts
for each row
execute function public.mark_milestone_funding_transactions_released();

with payout_funding_transactions as (
  select
    tx.id,
    payout.gross_amount,
    coalesce(
      sum(coalesce(tx.verified_amount, tx.amount_centavos::numeric / 100)) over (
        partition by payout.id
        order by
          case when tx.milestone_id = payout.milestone_id then 0 else 1 end,
          tx.created_at,
          tx.id
        rows between unbounded preceding and 1 preceding
      ),
      0
    ) as allocated_before
  from public.payouts payout
  join public.payment_transactions tx
    on tx.project_id = payout.project_id
   and tx.recipient_id = payout.contractor_id
   and tx.payment_status in ('PAID', 'SUCCEEDED')
   and (tx.milestone_id = payout.milestone_id or tx.milestone_id is null)
  where payout.status = 'sent'
    and payout.milestone_id is not null
    and payout.gross_amount > 0
)
update public.payment_transactions tx
   set payout_status = 'PAID'
  from payout_funding_transactions funded
 where tx.id = funded.id
   and funded.allocated_before < funded.gross_amount;

notify pgrst, 'reload schema';
