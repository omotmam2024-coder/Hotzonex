-- Runs in the HOTZONEX CLOUD database (not the tracker's).
-- A read-only feed for the Hotzonex tracker: sites, daily income per site and
-- expenses. It only answers callers holding the secret feed key; the key itself
-- is never stored, only its SHA-256 hash. No voucher codes or customer data leave.

create table if not exists public.tracker_feed_keys (
  key_hash     text primary key,
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  label        text not null default 'Hotzonex tracker',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.tracker_feed_keys enable row level security;
revoke all on public.tracker_feed_keys from anon, authenticated;

create or replace function public.tracker_feed(p_key text, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_tz text;
begin
  update public.tracker_feed_keys
     set last_used_at = now()
   where key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
  returning tenant_id into v_tenant;
  if v_tenant is null then
    raise exception 'invalid feed key' using errcode = '28000';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1000 then
    raise exception 'choose a date range of at most 1000 days' using errcode = '22023';
  end if;
  select coalesce(timezone, 'Africa/Juba') into v_tz from public.tenants where id = v_tenant;

  return jsonb_build_object(
    'timezone', v_tz,
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'active', s.is_active, 'created_at', s.created_at) order by s.created_at)
      from public.sites s where s.tenant_id = v_tenant), '[]'::jsonb),
    -- Same revenue the cloud's own reports use (report_sales), per site per local day.
    'income', coalesce((
      select jsonb_agg(jsonb_build_object('site_id', x.site_id, 'day', x.day, 'ssp', x.ssp, 'count', x.n))
      from (
        select r.site_id, (r.sold_at at time zone coalesce(s.timezone, v_tz))::date as day,
               sum(r.amount_ssp)::bigint as ssp, count(*) as n
        from public.report_sales r
        join public.sites s on s.id = r.site_id
        where r.tenant_id = v_tenant
          and r.sold_at >= (p_from::timestamp at time zone v_tz) - interval '1 day'
          and r.sold_at <  ((p_to + 1)::timestamp at time zone v_tz) + interval '1 day'
        group by 1, 2
      ) x
      where x.day between p_from and p_to), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'site_id', e.site_id, 'day', e.spent_on, 'category', e.category,
                                          'amount', e.amount_ssp, 'note', e.note, 'updated_at', e.updated_at))
      from public.expenses e
      where e.tenant_id = v_tenant and e.spent_on between p_from and p_to), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.tracker_feed(text, date, date) from public;
grant execute on function public.tracker_feed(text, date, date) to anon, authenticated;
