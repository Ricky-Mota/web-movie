-- CRM Professa-M : prospects (centres de langues) venant de la landing page ou saisis à la main.
-- Accès réservé aux administrateurs de la plateforme (table crm_admins).

create type public.crm_stage as enum ('new', 'contacted', 'demo_scheduled', 'trial', 'won', 'lost');

create table public.crm_admins (
  email      text primary key check (email = lower(btrim(email)) and email like '%@%'),
  created_at timestamptz not null default now()
);

create function private.is_crm_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.crm_admins a on a.email = lower(u.email)
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
  );
$$;
revoke execute on function private.is_crm_admin() from public, anon;
grant execute on function private.is_crm_admin() to authenticated, service_role;

create table public.crm_leads (
  id                uuid primary key default gen_random_uuid(),
  center_name       text not null check (length(btrim(center_name)) between 2 and 160),
  contact_name      text not null check (length(btrim(contact_name)) between 2 and 120),
  phone             text check (phone is null or length(phone) <= 40),
  email             text check (email is null or (length(email) <= 200 and email like '%@%')),
  city              text check (city is null or length(city) <= 80),
  country_code      char(2) not null default 'CD' check (country_code ~ '^[A-Z]{2}$'),
  learners_estimate integer check (learners_estimate is null or learners_estimate between 0 and 100000),
  message           text check (message is null or length(message) <= 2000),
  source            text not null default 'landing' check (source in ('landing', 'manual', 'referral', 'event', 'social')),
  stage             public.crm_stage not null default 'new',
  expected_credits  integer check (expected_credits is null or expected_credits >= 0),
  next_action       text check (next_action is null or length(next_action) <= 300),
  next_action_on    date,
  organization_id   uuid references public.organizations (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (phone is not null or email is not null)
);
create index crm_leads_stage_idx on public.crm_leads (stage, created_at desc);
create index crm_leads_next_action_idx on public.crm_leads (next_action_on) where next_action_on is not null;
create index crm_leads_organization_id_idx on public.crm_leads (organization_id);

create trigger crm_leads_updated_at before update on public.crm_leads
  for each row execute function private.set_updated_at();

create table public.crm_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.crm_leads (id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 4000),
  kind       text not null default 'note' check (kind in ('note', 'call', 'whatsapp', 'email', 'meeting', 'stage')),
  author_id  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index crm_notes_lead_id_idx on public.crm_notes (lead_id, created_at desc);
create index crm_notes_author_id_idx on public.crm_notes (author_id);

alter table public.crm_admins enable row level security;
alter table public.crm_leads  enable row level security;
alter table public.crm_notes  enable row level security;

create policy "admins CRM : lire" on public.crm_admins
  for select to authenticated using ((select private.is_crm_admin()));

create policy "admins CRM : tout" on public.crm_leads
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy "admins CRM : lire" on public.crm_notes
  for select to authenticated using ((select private.is_crm_admin()));
create policy "admins CRM : ajouter" on public.crm_notes
  for insert to authenticated
  with check ((select private.is_crm_admin()) and author_id = (select auth.uid()));
create policy "admins CRM : supprimer ses notes" on public.crm_notes
  for delete to authenticated
  using ((select private.is_crm_admin()) and author_id = (select auth.uid()));

revoke all on public.crm_admins, public.crm_leads, public.crm_notes from anon;
revoke insert, update, delete on public.crm_admins from authenticated;
revoke update on public.crm_notes from authenticated;

-- Formulaire public de la landing page : seule porte d'entrée pour les visiteurs.
create function public.submit_lead(
  p_center_name       text,
  p_contact_name      text,
  p_phone             text,
  p_email             text default null,
  p_city              text default null,
  p_learners_estimate integer default null,
  p_message           text default null,
  p_website           text default null   -- champ piège invisible : rempli = robot
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if coalesce(p_website, '') <> '' then
    return;
  end if;
  if v_phone is null and v_email is null then
    raise exception 'Indiquez un téléphone ou un e-mail' using errcode = '22023';
  end if;
  if (select count(*) from public.crm_leads where created_at > now() - interval '1 hour' and source = 'landing') >= 30 then
    raise exception 'Trop de demandes, réessayez plus tard' using errcode = '54000';
  end if;
  if exists (
    select 1 from public.crm_leads
    where created_at > now() - interval '1 day'
      and (phone = v_phone or email = v_email)
  ) then
    return;
  end if;

  insert into public.crm_leads
    (center_name, contact_name, phone, email, city, learners_estimate, message, source)
  values
    (btrim(p_center_name), btrim(p_contact_name), v_phone, v_email,
     nullif(btrim(coalesce(p_city, '')), ''), p_learners_estimate,
     nullif(btrim(coalesce(p_message, '')), ''), 'landing');
end;
$$;
revoke execute on function public.submit_lead(text, text, text, text, text, integer, text, text) from public;
grant execute on function public.submit_lead(text, text, text, text, text, integer, text, text) to anon, authenticated;

-- Fonction pour vérifier, depuis la page CRM, si l'utilisateur connecté est administrateur.
create function public.am_i_crm_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.is_crm_admin();
$$;
revoke execute on function public.am_i_crm_admin() from public, anon;
grant execute on function public.am_i_crm_admin() to authenticated;
