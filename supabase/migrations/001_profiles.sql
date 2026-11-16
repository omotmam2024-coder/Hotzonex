-- STEP A: safe to run while the current app is live.
-- Creates a profile per signed-in person (name, role, site) linked to Supabase Auth.
-- Run in Supabase → SQL Editor. Then create the auth users (see README) and run
-- the "copy" section at the bottom.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text not null,
  role       text not null default 'staff' check (role in ('admin', 'manager', 'staff', 'viewer')),
  location   text not null default 'HQ'    check (location in ('HQ', 'SUB', 'GOROM', 'HOME')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Who is asking? Used by every row-level security policy.
-- SECURITY DEFINER so the lookup itself isn't blocked by profiles' own policies.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.my_location()
returns text language sql stable security definer set search_path = '' as $$
  select location from public.profiles where id = auth.uid() and active
$$;

revoke all on function public.my_role() from public, anon;
revoke all on function public.my_location() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_location() to authenticated;

alter table public.profiles enable row level security;
drop policy if exists "profiles: read own, admin reads all" on public.profiles;
create policy "profiles: read own, admin reads all" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');
-- No insert/update/delete policies: only the server (service role) changes profiles.
revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- COPY: run this AFTER adding each person in Authentication → Users → Add user
-- (same email as before, a NEW password, tick "Auto Confirm User").
-- It copies their name, role, site and active flag from the old app_users table.
insert into public.profiles (id, email, name, role, location, active)
select u.id, lower(u.email), a.name, a.role, coalesce(a.location, 'HQ'), coalesce(a.active, true)
from public.app_users a
join auth.users u on lower(u.email) = lower(a.email)
on conflict (id) do update
  set email = excluded.email, name = excluded.name, role = excluded.role,
      location = excluded.location, active = excluded.active;

-- Check: everyone should be listed here.
select p.name, p.email, p.role, p.location, p.active from public.profiles p order by p.name;
