-- =====================================================================
-- Zbsoss-center · Plateforme de formation et CRM · Phase 4
-- Structure des données (Supabase / Postgres)
--
-- Vente : chaque formation à l'unité ET abonnement mensuel donnant accès à tout.
-- Formation (produit) → modules → leçons (vidéos).
-- Paiement : mobile money (M-Pesa, Airtel, Orange) ou carte, via agrégateur,
-- ou en semi-manuel (l'étudiant déclare la référence, l'admin valide).
--
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Listes de valeurs
-- ---------------------------------------------------------------------
create type public.type_produit as enum ('formation', 'livret', 'video', 'application', 'service');
create type public.niveau as enum ('debutant', 'moyen', 'avance');
create type public.type_client as enum ('etudiant', 'organisation', 'projet');
create type public.source_contact as enum ('youtube', 'whatsapp', 'bouche_a_oreille', 'site', 'autre');
create type public.role_utilisateur as enum ('etudiant', 'admin');
create type public.devise as enum ('USD', 'CDF');
create type public.methode_paiement as enum ('mpesa', 'airtel_money', 'orange_money', 'carte', 'manuel');
create type public.statut_commande as enum ('en_attente', 'payee', 'refusee', 'remboursee');
create type public.statut_abonnement as enum ('actif', 'expire', 'annule');
create type public.origine_acces as enum ('achat', 'licence_groupe', 'offert');
create type public.etape_pipeline as enum ('nouveau', 'contacte', 'devis_envoye', 'negociation', 'gagne', 'perdu');
create type public.type_interaction as enum ('appel', 'whatsapp', 'email', 'sms', 'rencontre', 'note', 'achat');

-- ---------------------------------------------------------------------
-- 2. Utilisateurs (profil lié au compte Supabase Auth)
-- ---------------------------------------------------------------------
create table public.profils (
  id          uuid primary key references auth.users (id) on delete cascade,
  nom         text,
  telephone   text,
  email       text,
  pays        text default 'RDC',
  role        public.role_utilisateur not null default 'etudiant',
  created_at  timestamptz not null default now()
);

-- Fonction utilitaire : l'utilisateur connecté est-il administrateur ?
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
-- 3. Catalogue
-- ---------------------------------------------------------------------
create table public.produits (
  id           bigint generated always as identity primary key,
  type         public.type_produit not null default 'formation',
  titre        text not null,
  slug         text not null unique,
  description  text,
  niveau       public.niveau,
  prix_usd     numeric(10,2) check (prix_usd >= 0),
  prix_cdf     numeric(14,0) check (prix_cdf >= 0),
  sur_devis    boolean not null default false,   -- services sur mesure : bouton « Demander un devis »
  image_url    text,
  video_apercu_url text,
  publie       boolean not null default false,
  ordre        int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.modules (
  id            bigint generated always as identity primary key,
  formation_id  bigint not null references public.produits (id) on delete cascade,
  titre         text not null,
  ordre         int not null default 0
);
create index modules_formation_id_idx on public.modules (formation_id, ordre);

create table public.lecons (
  id              bigint generated always as identity primary key,
  module_id       bigint not null references public.modules (id) on delete cascade,
  titre           text not null,
  ordre           int not null default 0,
  video_url       text,
  duree_minutes   int check (duree_minutes > 0),
  resume_pdf_url  text,
  apercu_gratuit  boolean not null default false
);
create index lecons_module_id_idx on public.lecons (module_id, ordre);

-- Offres d'abonnement (ex. « Mensuel — accès à tout »)
create table public.plans_abonnement (
  id           bigint generated always as identity primary key,
  nom          text not null,
  prix_usd     numeric(10,2) not null check (prix_usd >= 0),
  prix_cdf     numeric(14,0) check (prix_cdf >= 0),
  duree_jours  int not null default 30 check (duree_jours > 0),
  actif        boolean not null default true
);

-- ---------------------------------------------------------------------
-- 4. Ventes : commandes, accès, abonnements, licences de groupe
-- ---------------------------------------------------------------------
create table public.commandes (
  id                     bigint generated always as identity primary key,
  user_id                uuid not null references public.profils (id) on delete cascade,
  produit_id             bigint references public.produits (id),
  plan_id                bigint references public.plans_abonnement (id),
  nb_places              int not null default 1 check (nb_places >= 1),   -- > 1 = licence de groupe
  montant                numeric(14,2) not null check (montant >= 0),
  devise                 public.devise not null default 'USD',
  methode                public.methode_paiement not null,
  reference_transaction  text,               -- référence M-Pesa / agrégateur
  statut                 public.statut_commande not null default 'en_attente',
  created_at             timestamptz not null default now(),
  payee_le               timestamptz,
  constraint commande_un_seul_objet check (num_nonnulls(produit_id, plan_id) = 1)
);
create index commandes_user_id_idx on public.commandes (user_id);
create index commandes_produit_id_idx on public.commandes (produit_id);
create index commandes_plan_id_idx on public.commandes (plan_id);
create index commandes_statut_idx on public.commandes (statut, created_at);
create unique index commandes_reference_unique on public.commandes (reference_transaction)
  where reference_transaction is not null;

create table public.licences_groupe (
  id            bigint generated always as identity primary key,
  commande_id   bigint not null unique references public.commandes (id) on delete cascade,
  acheteur_id   uuid not null references public.profils (id) on delete cascade,
  produit_id    bigint not null references public.produits (id),
  nb_places     int not null check (nb_places >= 1),
  code_invitation text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  created_at    timestamptz not null default now()
);
create index licences_groupe_acheteur_idx on public.licences_groupe (acheteur_id);
create index licences_groupe_produit_idx on public.licences_groupe (produit_id);

create table public.acces (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profils (id) on delete cascade,
  produit_id   bigint not null references public.produits (id) on delete cascade,
  origine      public.origine_acces not null default 'achat',
  commande_id  bigint references public.commandes (id) on delete set null,
  licence_id   bigint references public.licences_groupe (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (user_id, produit_id)
);
create index acces_produit_id_idx on public.acces (produit_id);
create index acces_commande_id_idx on public.acces (commande_id);
create index acces_licence_id_idx on public.acces (licence_id);

create table public.abonnements (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profils (id) on delete cascade,
  plan_id     bigint not null references public.plans_abonnement (id),
  statut      public.statut_abonnement not null default 'actif',
  debut       timestamptz not null default now(),
  fin         timestamptz not null,
  commande_id bigint references public.commandes (id) on delete set null
);
create index abonnements_user_fin_idx on public.abonnements (user_id, fin);
create index abonnements_plan_id_idx on public.abonnements (plan_id);
create index abonnements_commande_id_idx on public.abonnements (commande_id);

create table public.progression (
  user_id    uuid not null references public.profils (id) on delete cascade,
  lecon_id   bigint not null references public.lecons (id) on delete cascade,
  terminee_le timestamptz not null default now(),
  primary key (user_id, lecon_id)
);
create index progression_lecon_id_idx on public.progression (lecon_id);

-- L'utilisateur connecté a-t-il accès à cette formation ?
-- (achat ou licence de groupe, OU abonnement actif = accès à tout)
create or replace function public.a_acces(p_produit_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.acces
           where user_id = (select auth.uid()) and produit_id = p_produit_id)
      or exists (
           select 1 from public.abonnements
           where user_id = (select auth.uid()) and statut = 'actif' and fin > now());
$$;

-- ---------------------------------------------------------------------
-- 5. CRM
-- ---------------------------------------------------------------------
create table public.contacts (
  id           bigint generated always as identity primary key,
  profil_id    uuid unique references public.profils (id) on delete set null,
  nom          text not null,
  telephone    text,
  email        text,
  pays         text,
  type_client  public.type_client not null default 'etudiant',
  source       public.source_contact not null default 'site',
  organisation text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index contacts_type_source_idx on public.contacts (type_client, source);

create table public.demandes_devis (
  id           bigint generated always as identity primary key,
  contact_id   bigint references public.contacts (id) on delete set null,
  nom          text not null,
  telephone    text,
  email        text,
  organisation text,
  type_client  public.type_client not null default 'organisation',
  besoin       text not null,          -- ex. « Formation pour 20 personnes », « Site web »
  nb_personnes int,
  created_at   timestamptz not null default now()
);
create index demandes_devis_contact_idx on public.demandes_devis (contact_id);

create table public.opportunites (
  id           bigint generated always as identity primary key,
  contact_id   bigint not null references public.contacts (id) on delete cascade,
  demande_id   bigint references public.demandes_devis (id) on delete set null,
  titre        text not null,
  etape        public.etape_pipeline not null default 'nouveau',
  montant_usd  numeric(12,2),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index opportunites_contact_idx on public.opportunites (contact_id);
create index opportunites_demande_idx on public.opportunites (demande_id);
create index opportunites_etape_idx on public.opportunites (etape);

create table public.interactions (
  id           bigint generated always as identity primary key,
  contact_id   bigint not null references public.contacts (id) on delete cascade,
  type         public.type_interaction not null default 'note',
  contenu      text not null,
  created_at   timestamptz not null default now()
);
create index interactions_contact_idx on public.interactions (contact_id, created_at desc);

create table public.taches (
  id             bigint generated always as identity primary key,
  contact_id     bigint references public.contacts (id) on delete cascade,
  opportunite_id bigint references public.opportunites (id) on delete cascade,
  titre          text not null,              -- ex. « Rappeler M. X »
  echeance       timestamptz not null,
  faite          boolean not null default false,
  created_at     timestamptz not null default now()
);
create index taches_a_faire_idx on public.taches (echeance) where not faite;
create index taches_contact_idx on public.taches (contact_id);
create index taches_opportunite_idx on public.taches (opportunite_id);

-- ---------------------------------------------------------------------
-- 6. Automatisations (déclencheurs)
-- ---------------------------------------------------------------------

-- 6.1 Nouveau compte → profil + fiche contact CRM
create or replace function public.creer_profil_et_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profils (id, nom, telephone, email)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'nom', ''),
          coalesce(new.phone, new.raw_user_meta_data ->> 'telephone'),
          new.email);

  insert into public.contacts (profil_id, nom, telephone, email, source)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'nom', ''), coalesce(new.email, new.phone, 'Sans nom')),
          coalesce(new.phone, new.raw_user_meta_data ->> 'telephone'),
          new.email,
          case new.raw_user_meta_data ->> 'source'
            when 'youtube' then 'youtube'::public.source_contact
            when 'whatsapp' then 'whatsapp'::public.source_contact
            when 'bouche_a_oreille' then 'bouche_a_oreille'::public.source_contact
            else 'site'::public.source_contact
          end);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_profil_et_contact();

-- 6.2 Commande payée → accès débloqué (formation), abonnement prolongé,
--     ou licence de groupe créée ; achat noté dans l'historique CRM.
create or replace function public.livrer_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duree   int;
  v_fin     timestamptz;
  v_contact bigint;
begin
  if new.statut <> 'payee' or old.statut = 'payee' then
    return new;
  end if;

  new.payee_le := coalesce(new.payee_le, now());

  if new.plan_id is not null then
    select duree_jours into v_duree from public.plans_abonnement where id = new.plan_id;
    -- Prolonge à partir de la fin de l'abonnement en cours, s'il y en a un.
    select greatest(now(), coalesce(max(fin), now())) into v_fin
      from public.abonnements
      where user_id = new.user_id and statut = 'actif';
    insert into public.abonnements (user_id, plan_id, debut, fin, commande_id)
    values (new.user_id, new.plan_id, now(), v_fin + make_interval(days => v_duree), new.id);

  elsif new.nb_places > 1 then
    insert into public.licences_groupe (commande_id, acheteur_id, produit_id, nb_places)
    values (new.id, new.user_id, new.produit_id, new.nb_places);

  else
    insert into public.acces (user_id, produit_id, origine, commande_id)
    values (new.user_id, new.produit_id, 'achat', new.id)
    on conflict (user_id, produit_id) do nothing;
  end if;

  select id into v_contact from public.contacts where profil_id = new.user_id;
  if v_contact is not null then
    insert into public.interactions (contact_id, type, contenu)
    values (v_contact, 'achat',
            format('Commande n°%s payée : %s %s (%s)', new.id, new.montant, new.devise, new.methode));
  end if;

  return new;
end;
$$;

create trigger on_commande_payee
  before update of statut on public.commandes
  for each row execute function public.livrer_commande();

-- 6.3 Un apprenant rejoint une licence de groupe avec son code d'invitation
create or replace function public.rejoindre_licence(p_code text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_licence public.licences_groupe;
  v_utilises int;
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise';
  end if;

  select * into v_licence from public.licences_groupe where code_invitation = p_code for update;
  if not found then
    raise exception 'Code d''invitation invalide';
  end if;

  select count(*) into v_utilises from public.acces where licence_id = v_licence.id;
  if v_utilises >= v_licence.nb_places then
    raise exception 'Toutes les places de cette licence sont utilisées';
  end if;

  insert into public.acces (user_id, produit_id, origine, licence_id)
  values ((select auth.uid()), v_licence.produit_id, 'licence_groupe', v_licence.id)
  on conflict (user_id, produit_id) do nothing;

  return v_licence.produit_id;
end;
$$;

-- 6.4 Demande de devis → contact + opportunité « Nouveau » + tâche de rappel sous 24 h
create or replace function public.traiter_demande_devis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact bigint;
begin
  select id into v_contact from public.contacts
   where (new.email is not null and email = new.email)
      or (new.telephone is not null and telephone = new.telephone)
   limit 1;

  if v_contact is null then
    insert into public.contacts (nom, telephone, email, organisation, type_client, source)
    values (new.nom, new.telephone, new.email, new.organisation, new.type_client, 'site')
    returning id into v_contact;
  end if;

  new.contact_id := v_contact;
  return new;
end;
$$;

create trigger on_demande_devis_avant
  before insert on public.demandes_devis
  for each row execute function public.traiter_demande_devis();

create or replace function public.ouvrir_opportunite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp bigint;
begin
  insert into public.opportunites (contact_id, demande_id, titre)
  values (new.contact_id, new.id, left(new.besoin, 120))
  returning id into v_opp;

  insert into public.taches (contact_id, opportunite_id, titre, echeance)
  values (new.contact_id, v_opp, 'Rappeler ' || new.nom, now() + interval '24 hours');
  return new;
end;
$$;

create trigger on_demande_devis_apres
  after insert on public.demandes_devis
  for each row execute function public.ouvrir_opportunite();

-- 6.5 Dates de mise à jour
create or replace function public.maj_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger produits_updated_at before update on public.produits
  for each row execute function public.maj_updated_at();
create trigger opportunites_updated_at before update on public.opportunites
  for each row execute function public.maj_updated_at();

-- ---------------------------------------------------------------------
-- 7. Sécurité : Row Level Security (qui voit quoi)
-- ---------------------------------------------------------------------
alter table public.profils          enable row level security;
alter table public.produits         enable row level security;
alter table public.modules          enable row level security;
alter table public.lecons           enable row level security;
alter table public.plans_abonnement enable row level security;
alter table public.commandes        enable row level security;
alter table public.licences_groupe  enable row level security;
alter table public.acces            enable row level security;
alter table public.abonnements      enable row level security;
alter table public.progression      enable row level security;
alter table public.contacts         enable row level security;
alter table public.demandes_devis   enable row level security;
alter table public.opportunites     enable row level security;
alter table public.interactions     enable row level security;
alter table public.taches           enable row level security;

-- Profils : chacun voit et modifie le sien (sauf son rôle) ; l'admin voit tout.
create policy profils_lecture on public.profils for select to authenticated
  using (id = (select auth.uid()) or (select public.est_admin()));
create policy profils_modif on public.profils for update to authenticated
  using (id = (select auth.uid()) or (select public.est_admin()))
  with check (id = (select auth.uid()) or (select public.est_admin()));
revoke update on public.profils from authenticated;
grant update (nom, telephone, pays) on public.profils to authenticated;

-- Catalogue : visible par tous s'il est publié ; géré par l'admin.
create policy produits_lecture on public.produits for select to anon, authenticated
  using (publie or (select public.est_admin()));
create policy produits_admin on public.produits for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));

create policy modules_lecture on public.modules for select to anon, authenticated
  using (exists (select 1 from public.produits p where p.id = formation_id and p.publie)
         or (select public.est_admin()));
create policy modules_admin on public.modules for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));

-- Leçons : la liste (titres) est visible, mais la vidéo n'est servie
-- qu'aux ayants droit via la fonction lecon_video() ci-dessous.
create policy lecons_lecture on public.lecons for select to anon, authenticated
  using (exists (select 1 from public.modules m join public.produits p on p.id = m.formation_id
                 where m.id = module_id and p.publie)
         or (select public.est_admin()));
create policy lecons_admin on public.lecons for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
revoke select on public.lecons from anon, authenticated;
grant select (id, module_id, titre, ordre, duree_minutes, apercu_gratuit) on public.lecons to anon, authenticated;

create or replace function public.lecon_video(p_lecon_id bigint)
returns table (video_url text, resume_pdf_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.video_url, l.resume_pdf_url
  from public.lecons l
  join public.modules m on m.id = l.module_id
  where l.id = p_lecon_id
    and (l.apercu_gratuit or public.a_acces(m.formation_id) or public.est_admin());
$$;

create policy plans_lecture on public.plans_abonnement for select to anon, authenticated
  using (actif or (select public.est_admin()));
create policy plans_admin on public.plans_abonnement for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));

-- Commandes : l'étudiant déclare son paiement (statut « en_attente » imposé) ;
-- seul l'admin (ou l'automatisation) passe une commande en « payee ».
create policy commandes_lecture on public.commandes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));
create policy commandes_creation on public.commandes for insert to authenticated
  with check (user_id = (select auth.uid()) and statut = 'en_attente');
create policy commandes_admin on public.commandes for update to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
revoke insert, update on public.commandes from authenticated;
grant insert (user_id, produit_id, plan_id, nb_places, montant, devise, methode, reference_transaction)
  on public.commandes to authenticated;
grant update (statut, payee_le, reference_transaction) on public.commandes to authenticated;

create policy licences_lecture on public.licences_groupe for select to authenticated
  using (acheteur_id = (select auth.uid()) or (select public.est_admin()));

create policy acces_lecture on public.acces for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));
create policy acces_admin on public.acces for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));

create policy abonnements_lecture on public.abonnements for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));
create policy abonnements_admin on public.abonnements for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));

create policy progression_proprio on public.progression for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy progression_admin on public.progression for select to authenticated
  using ((select public.est_admin()));

-- Demandes de devis : tout visiteur peut en envoyer une ; seul l'admin les lit.
-- (contact_id est rempli par le déclencheur ; le client ne peut pas le fixer.)
create policy devis_envoi on public.demandes_devis for insert to anon, authenticated
  with check (true);
create policy devis_admin on public.demandes_devis for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
revoke insert on public.demandes_devis from anon, authenticated;
grant insert (nom, telephone, email, organisation, type_client, besoin, nb_personnes)
  on public.demandes_devis to anon, authenticated;

-- CRM : réservé à l'administrateur.
create policy contacts_admin on public.contacts for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
create policy opportunites_admin on public.opportunites for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
create policy interactions_admin on public.interactions for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
create policy taches_admin on public.taches for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));

-- Les fonctions internes ne sont pas appelables directement depuis l'API.
revoke execute on function public.creer_profil_et_contact() from public, anon, authenticated;
revoke execute on function public.livrer_commande() from public, anon, authenticated;
revoke execute on function public.traiter_demande_devis() from public, anon, authenticated;
revoke execute on function public.ouvrir_opportunite() from public, anon, authenticated;
revoke execute on function public.rejoindre_licence(text) from public, anon;
grant execute on function public.rejoindre_licence(text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Tableau de bord administrateur (vues réservées à l'admin)
-- ---------------------------------------------------------------------
create view public.tb_chiffre_affaires_mensuel with (security_invoker = true) as
select date_trunc('month', payee_le) as mois,
       devise,
       count(*)      as nb_ventes,
       sum(montant)  as chiffre_affaires
from public.commandes
where statut = 'payee' and (select public.est_admin())
group by 1, 2;

create view public.tb_ventes_par_produit with (security_invoker = true) as
select coalesce(p.titre, pl.nom) as produit,
       c.devise,
       count(*)       as nb_ventes,
       sum(c.montant) as chiffre_affaires
from public.commandes c
left join public.produits p on p.id = c.produit_id
left join public.plans_abonnement pl on pl.id = c.plan_id
where c.statut = 'payee' and (select public.est_admin())
group by 1, 2;

create view public.tb_pipeline with (security_invoker = true) as
select etape, count(*) as nb, coalesce(sum(montant_usd), 0) as montant_usd
from public.opportunites
where (select public.est_admin())
group by etape;

create view public.tb_nouveaux_contacts with (security_invoker = true) as
select date_trunc('month', created_at) as mois, type_client, source, count(*) as nb
from public.contacts
where (select public.est_admin())
group by 1, 2, 3;
