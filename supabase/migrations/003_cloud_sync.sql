-- Connect the tracker to Hotzonex Cloud.
-- Income and Cloud expenses are written by the sync job (api/sync.js, using the
-- service-role key). People can no longer type income; they can still adjust a
-- day's running costs, add purchases and record USD exchanges.

-- 1. Sites mirror Hotzonex Cloud (id = the Cloud site id).
create table if not exists public.sites (
  id        text primary key,
  name      text not null,
  active    boolean not null default true,
  sort      integer not null default 0,
  synced_at timestamptz not null default now()
);
alter table public.sites enable row level security;
drop policy if exists "sites: signed-in staff can read" on public.sites;
create policy "sites: signed-in staff can read" on public.sites
  for select to authenticated using (public.my_role() is not null);
revoke all on public.sites from anon;
grant select on public.sites to authenticated;

-- 2. Fixed daily costs per site, added on days the site had income.
create table if not exists public.fixed_costs (
  site_id    text not null references public.sites (id) on delete cascade,
  cost_key   text not null check (cost_key in ('internet', 'power', 'feeding', 'wages')),
  amount     numeric not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (site_id, cost_key)
);
alter table public.fixed_costs enable row level security;
drop policy if exists "fixed costs: read" on public.fixed_costs;
drop policy if exists "fixed costs: admin writes" on public.fixed_costs;
create policy "fixed costs: read" on public.fixed_costs
  for select to authenticated using (public.my_role() is not null);
create policy "fixed costs: admin writes" on public.fixed_costs
  for all to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
revoke all on public.fixed_costs from anon;
grant select, insert, update, delete on public.fixed_costs to authenticated;

-- 3. When the sync last ran.
create table if not exists public.sync_status (
  id           integer primary key default 1 check (id = 1),
  last_run_at  timestamptz,
  last_ok_at   timestamptz,
  last_error   text,
  rows_written integer,
  window_from  date,
  window_to    date
);
insert into public.sync_status (id) values (1) on conflict do nothing;
alter table public.sync_status enable row level security;
drop policy if exists "sync status: read" on public.sync_status;
create policy "sync status: read" on public.sync_status
  for select to authenticated using (public.my_role() is not null);
revoke all on public.sync_status from anon;
grant select on public.sync_status to authenticated;

-- 4. Day records: where the income came from, and hand-adjusted costs.
alter table public.daily_entries
  add column if not exists from_cloud   boolean not null default false,
  add column if not exists costs_edited boolean not null default false,
  add column if not exists synced_at    timestamptz;

-- Income comes only from Hotzonex Cloud: signed-in people can't set or change it.
create or replace function public.keep_cloud_income()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.income := 0;
      new.from_cloud := false;
    else
      new.income := old.income;
      new.from_cloud := old.from_cloud;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists keep_cloud_income on public.daily_entries;
create trigger keep_cloud_income before insert or update on public.daily_entries
  for each row execute function public.keep_cloud_income();

-- 5. Purchases copied from Cloud expenses (repairs, equipment, other).
alter table public.other_expenses add column if not exists cloud_expense_id uuid unique;

-- 6. Sites are Cloud site ids now, not fixed codes.
alter table public.profiles drop constraint if exists profiles_location_check;
