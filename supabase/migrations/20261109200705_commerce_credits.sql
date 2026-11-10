create table public.plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  description      text,
  price_amount     numeric(14, 2) not null check (price_amount >= 0),
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  credits_included integer not null check (credits_included > 0),
  country_code     char(2) check (country_code ~ '^[A-Z]{2}$'),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger plans_updated_at before update on public.plans
  for each row execute function private.set_updated_at();

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  plan_id            uuid references public.plans (id) on delete restrict,
  amount             numeric(14, 2) not null check (amount > 0),
  currency           char(3) not null check (currency ~ '^[A-Z]{3}$'),
  method             public.payment_method not null,
  provider           text not null,
  provider_reference text,
  status             public.payment_status not null default 'pending',
  credits_granted    integer not null default 0 check (credits_granted >= 0),
  paid_at            timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, organization_id),
  unique (provider, provider_reference)
);
create index payments_organization_id_idx on public.payments (organization_id);
create index payments_plan_id_idx on public.payments (plan_id);

create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();

create table public.production_jobs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  episode_id        uuid not null,
  script_version_id uuid not null,
  status            public.job_status not null default 'queued',
  current_step      text,
  error_message     text,
  credits_reserved  integer not null check (credits_reserved >= 0),
  actual_cost_usd   numeric(12, 4) check (actual_cost_usd >= 0),
  started_at        timestamptz,
  finished_at       timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (episode_id, organization_id)
    references public.episodes (id, organization_id) on delete cascade,
  foreign key (script_version_id, episode_id)
    references public.script_versions (id, episode_id)
);
create index production_jobs_organization_id_idx on public.production_jobs (organization_id);
create index production_jobs_episode_id_idx on public.production_jobs (episode_id);
create index production_jobs_script_version_id_idx on public.production_jobs (script_version_id);
create unique index production_jobs_one_active_idx on public.production_jobs (episode_id)
  where status in ('queued', 'running');

create trigger production_jobs_updated_at before update on public.production_jobs
  for each row execute function private.set_updated_at();

create table public.credit_transactions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  kind              public.credit_tx_kind not null,
  amount            integer not null,
  reservation_id    uuid,
  production_job_id uuid,
  payment_id        uuid,
  note              text,
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (id, organization_id),
  check (
       (kind in ('purchase', 'grant', 'refund') and amount > 0)
    or (kind = 'reserve'    and amount < 0)
    or (kind = 'consume'    and amount = 0)
    or (kind = 'adjustment' and amount <> 0)
  ),
  check ((kind in ('consume', 'refund')) = (reservation_id is not null)),
  check (kind <> 'purchase' or payment_id is not null),
  foreign key (reservation_id, organization_id)
    references public.credit_transactions (id, organization_id),
  foreign key (production_job_id, organization_id)
    references public.production_jobs (id, organization_id) on delete set null (production_job_id),
  foreign key (payment_id, organization_id)
    references public.payments (id, organization_id)
);
create index credit_transactions_organization_id_idx on public.credit_transactions (organization_id, created_at);
create index credit_transactions_job_idx on public.credit_transactions (production_job_id);
create index credit_transactions_payment_idx on public.credit_transactions (payment_id);
create unique index credit_transactions_one_settlement_idx
  on public.credit_transactions (reservation_id) where reservation_id is not null;
create unique index credit_transactions_one_purchase_idx
  on public.credit_transactions (payment_id) where kind = 'purchase';

create function private.forbid_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.production_job_id is not null
     and new.production_job_id is null
     and (to_jsonb(new) - 'production_job_id') = (to_jsonb(old) - 'production_job_id') then
    return new;
  end if;
  raise exception 'Le journal des crédits est en ajout seul : ajoutez une ligne « adjustment » pour corriger'
    using errcode = '42501';
end;
$$;

create trigger credit_transactions_append_only before update or delete on public.credit_transactions
  for each row execute function private.forbid_ledger_change();

create function private.available_credits(p_organization_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(t.amount), 0)::integer
  from public.credit_transactions t
  where t.organization_id = p_organization_id;
$$;

create view public.credit_balances
with (security_invoker = true)
as
select
  o.id as organization_id,
  coalesce(sum(t.amount), 0)::integer as available,
  coalesce(sum(-t.amount) filter (
    where t.kind = 'reserve'
      and not exists (select 1 from public.credit_transactions s where s.reservation_id = t.id)
  ), 0)::integer as reserved
from public.organizations o
left join public.credit_transactions t on t.organization_id = o.id
group by o.id;
