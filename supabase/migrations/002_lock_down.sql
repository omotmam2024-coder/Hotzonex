-- STEP B: run when the new app goes live. After this the OLD app stops working,
-- because the data is only readable by signed-in staff.
--
-- Rules:
--   everyone signed in and active can read; staff only their own site
--   admin, manager and staff can add and change records; staff only their own site
--   only admin can delete
--   nothing at all is readable without signing in

-- 1. Remove whatever policies these tables had before.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('daily_entries', 'other_expenses', 'usd_savings', 'app_users')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. Same rules on all three ledgers.
do $$
declare t text;
begin
  foreach t in array array['daily_entries', 'other_expenses', 'usd_savings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format($p$create policy "read: active staff, own site for staff" on public.%I
      for select to authenticated
      using (public.my_role() is not null and (public.my_role() <> 'staff' or location = public.my_location()))$p$, t);

    execute format($p$create policy "add: not viewers, own site for staff" on public.%I
      for insert to authenticated
      with check (public.my_role() in ('admin', 'manager', 'staff') and (public.my_role() <> 'staff' or location = public.my_location()))$p$, t);

    execute format($p$create policy "change: not viewers, own site for staff" on public.%I
      for update to authenticated
      using (public.my_role() in ('admin', 'manager', 'staff') and (public.my_role() <> 'staff' or location = public.my_location()))
      with check (public.my_role() in ('admin', 'manager', 'staff') and (public.my_role() <> 'staff' or location = public.my_location()))$p$, t);

    execute format($p$create policy "delete: admin only" on public.%I
      for delete to authenticated
      using (public.my_role() = 'admin')$p$, t);
  end loop;
end $$;

grant usage, select on all sequences in schema public to authenticated;

-- 3. Close the old password table completely.
alter table public.app_users enable row level security;
revoke all on public.app_users from anon, authenticated;

-- 4. Later, once everyone has signed in to the new app, delete the old table:
-- drop table public.app_users;
