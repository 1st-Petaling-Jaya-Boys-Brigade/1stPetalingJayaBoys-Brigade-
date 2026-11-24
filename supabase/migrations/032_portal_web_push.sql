-- Keep device subscriptions, scoped sign-ins and send limits behind the service role.
create table if not exists public.bb_portal_push_sessions (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null
);

create table if not exists public.bb_portal_push_devices (
  endpoint text primary key,
  member_ic text not null,
  device_hash text not null,
  p256dh text not null,
  auth_key text not null
);

create table if not exists public.bb_portal_push_limits (
  key text primary key,
  resets_at timestamptz not null,
  attempts integer not null
);

alter table public.bb_portal_push_sessions enable row level security;
alter table public.bb_portal_push_devices enable row level security;
alter table public.bb_portal_push_limits enable row level security;
revoke all on public.bb_portal_push_sessions, public.bb_portal_push_devices, public.bb_portal_push_limits from public, anon, authenticated;
grant select, insert, update, delete on public.bb_portal_push_sessions, public.bb_portal_push_devices, public.bb_portal_push_limits to service_role;

create or replace function public.rpc_claim_portal_push_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with claimed as (
    insert into public.bb_portal_push_limits as counter (key, resets_at, attempts)
    values (p_key, now() + make_interval(secs => p_seconds), 1)
    on conflict (key) do update set
      resets_at = case when counter.resets_at <= now() then excluded.resets_at else counter.resets_at end,
      attempts = case when counter.resets_at <= now() then 1 else counter.attempts + 1 end
    where counter.resets_at <= now() or counter.attempts < p_limit
    returning 1
  )
  select exists(select 1 from claimed);
$$;

revoke all on function public.rpc_claim_portal_push_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rpc_claim_portal_push_limit(text, integer, integer) to service_role;
notify pgrst, 'reload schema';
