create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

create type public.user_role      as enum ('manager', 'teacher');
create type public.cefr_level     as enum ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
create type public.episode_status as enum ('draft','script_review','approved','in_production','video_review','published','failed');
create type public.asset_kind     as enum ('image', 'audio', 'video', 'pdf');
create type public.job_status     as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.credit_tx_kind as enum ('purchase','grant','reserve','consume','refund','adjustment');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.payment_method as enum ('mobile_money', 'card', 'bank_transfer', 'cash');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 2 and 120),
  country_code    char(2) not null default 'CD' check (country_code ~ '^[A-Z]{2}$'),
  currency        char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  billing_name    text,
  billing_email   text,
  billing_phone   text,
  billing_address text,
  tax_id          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name       text,
  role            public.user_role not null default 'teacher',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles (organization_id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id from public.profiles p where p.id = (select auth.uid());
$$;

create function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'manager' from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

grant execute on function private.current_org_id()    to authenticated, service_role;
grant execute on function private.current_user_role() to authenticated, service_role;
grant execute on function private.is_manager()        to authenticated, service_role;

create function private.guard_profile_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Changement de centre interdit' using errcode = '42501';
    end if;
    if new.role is distinct from old.role and not private.is_manager() then
      raise exception 'Seul un responsable peut modifier un rôle' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_changes();
