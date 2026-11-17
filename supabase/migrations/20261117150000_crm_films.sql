-- =====================================================================
-- CRM Films courts chinois : modèle de données
-- Tables : profils, films, abonnements, visionnages, campagnes,
--          campagne_envois  (+ vue vue_crm_abonnes)
-- Cible   : Supabase (Postgres 15+). Sécurité par RLS sur chaque table.
-- NB      : cette migration n'a PAS été appliquée sur un projet Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Outils communs
-- ---------------------------------------------------------------------

-- Met à jour automatiquement la colonne mis_a_jour_le.
create or replace function public.maj_horodatage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.mis_a_jour_le := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. PROFILS (les utilisateurs du site)
-- Un profil par compte Supabase Auth (auth.users). Créé automatiquement
-- à l'inscription.
-- ---------------------------------------------------------------------
create table public.profils (
  id                     uuid primary key references auth.users (id) on delete cascade,
  email                  text not null,
  nom_affiche            text,
  pays                   text,                 -- code ISO, ex. 'FR', 'CD'
  langue                 text not null default 'fr',
  role                   text not null default 'abonne'
                         check (role in ('abonne', 'admin')),
  source_acquisition     text,                 -- ex. 'tiktok', 'facebook', 'bouche-a-oreille'
  consentement_marketing boolean not null default false,
  consentement_le        timestamptz,
  cree_le                timestamptz not null default now(),
  mis_a_jour_le          timestamptz not null default now()
);

create index profils_email_idx on public.profils (lower(email));

create trigger profils_maj
  before update on public.profils
  for each row execute function public.maj_horodatage();

-- Création automatique du profil quand quelqu'un s'inscrit.
create or replace function public.creer_profil_a_inscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profils (id, email, nom_affiche)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'nom_affiche');
  return new;
end;
$$;

create trigger a_inscription_creer_profil
  after insert on auth.users
  for each row execute function public.creer_profil_a_inscription();

-- Vrai si l'utilisateur connecté est administrateur.
-- security definer : lit profils sans repasser par la RLS (évite une boucle).
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profils
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 2. FILMS (le catalogue)
-- ---------------------------------------------------------------------
create table public.films (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,     -- pour l'URL : /films/le-dernier-the
  titre              text not null,
  titre_original     text,                     -- titre chinois
  synopsis           text,
  genres             text[] not null default '{}',
  duree_secondes     integer check (duree_secondes > 0),
  annee              smallint check (annee between 1900 and 2100),
  langue_originale   text not null default 'zh',
  sous_titres        text[] not null default '{fr}',
  affiche_url        text,
  bande_annonce_url  text,
  video_chemin       text,                     -- chemin dans Supabase Storage (bucket privé)
  acces              text not null default 'premium'
                     check (acces in ('gratuit', 'premium')),
  statut             text not null default 'brouillon'
                     check (statut in ('brouillon', 'publie', 'archive')),
  publie_le          timestamptz,
  cree_le            timestamptz not null default now(),
  mis_a_jour_le      timestamptz not null default now()
);

create index films_publies_idx on public.films (publie_le desc) where statut = 'publie';

create trigger films_maj
  before update on public.films
  for each row execute function public.maj_horodatage();

-- ---------------------------------------------------------------------
-- 3. ABONNEMENTS
-- Historique complet : une ligne par période d'abonnement.
-- Écrit par le serveur (webhook de paiement), lu par l'abonné.
-- ---------------------------------------------------------------------
create table public.abonnements (
  id                    uuid primary key default gen_random_uuid(),
  utilisateur_id        uuid not null references public.profils (id) on delete cascade,
  formule               text not null
                        check (formule in ('gratuit', 'mensuel', 'annuel')),
  statut                text not null default 'actif'
                        check (statut in ('essai', 'actif', 'annule', 'expire', 'impaye')),
  debut_le              timestamptz not null default now(),
  fin_le                timestamptz,
  prix_centimes         integer not null default 0 check (prix_centimes >= 0),
  devise                text not null default 'EUR',
  fournisseur_paiement  text,                  -- ex. 'stripe', 'mobile_money'
  reference_externe     text unique,           -- id chez le fournisseur de paiement
  cree_le               timestamptz not null default now(),
  mis_a_jour_le         timestamptz not null default now(),
  check (fin_le is null or fin_le > debut_le)
);

create index abonnements_utilisateur_idx on public.abonnements (utilisateur_id);
-- Un seul abonnement en cours (essai ou actif) par personne.
create unique index abonnements_un_en_cours_idx
  on public.abonnements (utilisateur_id)
  where statut in ('essai', 'actif');

create trigger abonnements_maj
  before update on public.abonnements
  for each row execute function public.maj_horodatage();

-- ---------------------------------------------------------------------
-- 4. VISIONNAGES
-- Une ligne par couple (personne, film) : sert à « reprendre la lecture »
-- et à mesurer l'engagement dans le CRM.
-- ---------------------------------------------------------------------
create table public.visionnages (
  utilisateur_id      uuid not null references public.profils (id) on delete cascade,
  film_id             uuid not null references public.films (id) on delete cascade,
  position_secondes   integer not null default 0 check (position_secondes >= 0),
  termine             boolean not null default false,
  nb_lectures         integer not null default 1 check (nb_lectures >= 1),
  appareil            text,                    -- 'mobile', 'ordinateur', 'tv'
  premier_visionnage_le timestamptz not null default now(),
  dernier_visionnage_le timestamptz not null default now(),
  primary key (utilisateur_id, film_id)
);

create index visionnages_film_idx on public.visionnages (film_id);
create index visionnages_recents_idx on public.visionnages (dernier_visionnage_le desc);

-- ---------------------------------------------------------------------
-- 5. CAMPAGNES (marketing : email, SMS, WhatsApp, notification)
-- ---------------------------------------------------------------------
create table public.campagnes (
  id             uuid primary key default gen_random_uuid(),
  nom            text not null,
  canal          text not null
                 check (canal in ('email', 'sms', 'whatsapp', 'push')),
  objet          text,                         -- sujet de l'email
  contenu        text not null,
  film_id        uuid references public.films (id) on delete set null,  -- film mis en avant
  segment        jsonb not null default '{}',  -- critères de ciblage, ex. {"formule":"gratuit","inactif_depuis_jours":14}
  statut         text not null default 'brouillon'
                 check (statut in ('brouillon', 'programmee', 'en_cours', 'envoyee', 'annulee')),
  programmee_le  timestamptz,
  envoyee_le     timestamptz,
  cree_par       uuid references public.profils (id) on delete set null,
  cree_le        timestamptz not null default now(),
  mis_a_jour_le  timestamptz not null default now()
);

create index campagnes_film_idx on public.campagnes (film_id);
create index campagnes_cree_par_idx on public.campagnes (cree_par);

create trigger campagnes_maj
  before update on public.campagnes
  for each row execute function public.maj_horodatage();

-- 5 bis. Qui a reçu quelle campagne, et a-t-il ouvert / cliqué ?
create table public.campagne_envois (
  campagne_id     uuid not null references public.campagnes (id) on delete cascade,
  utilisateur_id  uuid not null references public.profils (id) on delete cascade,
  statut          text not null default 'en_attente'
                  check (statut in ('en_attente', 'envoye', 'ouvert', 'clique', 'echec', 'desabonne')),
  envoye_le       timestamptz,
  ouvert_le       timestamptz,
  clique_le       timestamptz,
  primary key (campagne_id, utilisateur_id)
);

create index campagne_envois_utilisateur_idx on public.campagne_envois (utilisateur_id);

-- ---------------------------------------------------------------------
-- Vue CRM : une ligne par abonné avec ses indicateurs clés.
-- security_invoker : la vue respecte la RLS de la personne qui la lit
-- (donc seuls les admins voient tout le monde).
-- ---------------------------------------------------------------------
create view public.vue_crm_abonnes
with (security_invoker = true) as
select
  p.id,
  p.email,
  p.nom_affiche,
  p.pays,
  p.source_acquisition,
  p.consentement_marketing,
  p.cree_le                                as inscrit_le,
  a.formule                                as formule_actuelle,
  a.statut                                 as statut_abonnement,
  a.fin_le                                 as abonnement_fin_le,
  coalesce(v.nb_films, 0)                  as nb_films_vus,
  coalesce(v.nb_films_termines, 0)         as nb_films_termines,
  v.dernier_visionnage_le
from public.profils p
left join lateral (
  select ab.formule, ab.statut, ab.fin_le
  from public.abonnements ab
  where ab.utilisateur_id = p.id
  order by ab.debut_le desc
  limit 1
) a on true
left join lateral (
  select count(*)                         as nb_films,
         count(*) filter (where vi.termine) as nb_films_termines,
         max(vi.dernier_visionnage_le)    as dernier_visionnage_le
  from public.visionnages vi
  where vi.utilisateur_id = p.id
) v on true;

-- =====================================================================
-- SÉCURITÉ : Row Level Security (qui peut lire / écrire quoi)
-- =====================================================================
alter table public.profils          enable row level security;
alter table public.films            enable row level security;
alter table public.abonnements      enable row level security;
alter table public.visionnages      enable row level security;
alter table public.campagnes        enable row level security;
alter table public.campagne_envois  enable row level security;

-- PROFILS : chacun voit et modifie le sien ; l'admin voit tout.
create policy "profils_lecture" on public.profils
  for select to authenticated
  using (id = (select auth.uid()) or (select public.est_admin()));

create policy "profils_modif_soi" on public.profils
  for update to authenticated
  using (id = (select auth.uid()) or (select public.est_admin()))
  with check (id = (select auth.uid()) or (select public.est_admin()));

-- Un abonné ne peut modifier QUE ces colonnes (pas son rôle, pas son email).
revoke update on public.profils from authenticated, anon;
grant update (nom_affiche, pays, langue, consentement_marketing, consentement_le)
  on public.profils to authenticated;

-- FILMS : catalogue publié visible par tous (même non connectés) ;
-- seuls les admins créent / modifient.
create policy "films_lecture_publies" on public.films
  for select to anon, authenticated
  using (statut = 'publie' or (select public.est_admin()));

create policy "films_gestion_admin" on public.films
  for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- ABONNEMENTS : lecture du sien ; écriture réservée au serveur
-- (clé service_role, qui ignore la RLS) ou à l'admin.
create policy "abonnements_lecture" on public.abonnements
  for select to authenticated
  using (utilisateur_id = (select auth.uid()) or (select public.est_admin()));

create policy "abonnements_gestion_admin" on public.abonnements
  for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- VISIONNAGES : chacun enregistre et relit sa progression ; l'admin lit tout.
create policy "visionnages_lecture" on public.visionnages
  for select to authenticated
  using (utilisateur_id = (select auth.uid()) or (select public.est_admin()));

create policy "visionnages_ajout_soi" on public.visionnages
  for insert to authenticated
  with check (utilisateur_id = (select auth.uid()));

create policy "visionnages_maj_soi" on public.visionnages
  for update to authenticated
  using (utilisateur_id = (select auth.uid()))
  with check (utilisateur_id = (select auth.uid()));

-- CAMPAGNES et ENVOIS : réservés aux admins.
create policy "campagnes_admin" on public.campagnes
  for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

create policy "campagne_envois_admin" on public.campagne_envois
  for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- Les fonctions internes ne doivent pas être appelables depuis l'API publique.
revoke execute on function public.creer_profil_a_inscription() from public, anon, authenticated;
revoke execute on function public.maj_horodatage() from public, anon, authenticated;
