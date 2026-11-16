-- One dollar wallet for the whole business.
-- Dollars come in through usd_savings (SSP profit exchanged into USD) and go
-- out through usd_spending (devices, other purchases, or cash taken out).
-- Spending dollars lowers the dollar balance only; it doesn't change profit.

create table if not exists public.usd_spending (
  id          bigint generated always as identity primary key,
  spent_on    date not null default current_date,
  amount_usd  numeric(12, 2) not null check (amount_usd > 0),
  category    text not null default 'Devices / equipment',
  description text not null,
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

alter table public.usd_spending enable row level security;
drop policy if exists "usd spending: read" on public.usd_spending;
drop policy if exists "usd spending: add" on public.usd_spending;
drop policy if exists "usd spending: change" on public.usd_spending;
drop policy if exists "usd spending: delete" on public.usd_spending;
-- Everyone except site staff can see the wallet.
create policy "usd spending: read" on public.usd_spending
  for select to authenticated using (public.my_role() in ('admin', 'manager', 'viewer'));
create policy "usd spending: add" on public.usd_spending
  for insert to authenticated with check (public.my_role() in ('admin', 'manager'));
create policy "usd spending: change" on public.usd_spending
  for update to authenticated using (public.my_role() in ('admin', 'manager')) with check (public.my_role() in ('admin', 'manager'));
create policy "usd spending: delete" on public.usd_spending
  for delete to authenticated using (public.my_role() = 'admin');
revoke all on public.usd_spending from anon;
grant select, insert, update, delete on public.usd_spending to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Every record must belong to a real Hotzonex Cloud site (stops old app tabs
-- from saving under the retired HQ/SUB/GOROM/HOME codes).
alter table public.daily_entries  drop constraint if exists daily_entries_site_fk;
alter table public.other_expenses drop constraint if exists other_expenses_site_fk;
alter table public.usd_savings    drop constraint if exists usd_savings_site_fk;
alter table public.daily_entries  add constraint daily_entries_site_fk  foreign key (location) references public.sites (id) on update cascade;
alter table public.other_expenses add constraint other_expenses_site_fk foreign key (location) references public.sites (id) on update cascade;
alter table public.usd_savings    add constraint usd_savings_site_fk    foreign key (location) references public.sites (id) on update cascade;
