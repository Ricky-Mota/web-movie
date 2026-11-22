-- Zboss-speed : table des inscrits à la bêta + accès réservé aux administrateurs.
-- À coller dans Supabase > SQL Editor > New query > Run.

create table if not exists public.beta_signups (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  pseudo      text not null check (char_length(pseudo) between 2 and 40),
  email       text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  country     text check (char_length(country) <= 60),
  platform    text check (platform in ('PC', 'PlayStation', 'Xbox', 'Autre')),
  newsletter  boolean not null default false,
  source      text check (char_length(source) <= 60),
  status      text not null default 'nouveau'
              check (status in ('nouveau', 'contacté', 'invité', 'actif', 'refusé')),
  notes       text check (char_length(notes) <= 2000)
);

create index if not exists beta_signups_created_at_idx on public.beta_signups (created_at desc);

-- Liste des e-mails autorisés à ouvrir le CRM
create table if not exists public.admins (
  email text primary key
);

alter table public.beta_signups enable row level security;
alter table public.admins enable row level security;

-- Fonction d'aide : l'utilisateur connecté est-il administrateur ?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower((select auth.jwt() ->> 'email'))
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Le public (clé anon) peut seulement s'inscrire, avec le statut par défaut.
drop policy if exists "public peut s'inscrire" on public.beta_signups;
create policy "public peut s'inscrire" on public.beta_signups
  for insert to anon, authenticated
  with check (status = 'nouveau' and notes is null);

-- Les administrateurs lisent, modifient et suppriment.
drop policy if exists "admins lisent" on public.beta_signups;
create policy "admins lisent" on public.beta_signups
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "admins modifient" on public.beta_signups;
create policy "admins modifient" on public.beta_signups
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admins suppriment" on public.beta_signups;
create policy "admins suppriment" on public.beta_signups
  for delete to authenticated using ((select public.is_admin()));

-- Pas de policy sur admins : la table n'est lisible que via is_admin().

-- Droits de base (Supabase les accorde déjà en général ; explicites ici)
grant insert on public.beta_signups to anon;
grant select, insert, update, delete on public.beta_signups to authenticated;

-- ÉTAPE FINALE : remplace par ton e-mail (celui du compte créé dans Authentication > Users)
-- insert into public.admins (email) values ('ton-email@exemple.com');
