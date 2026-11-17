grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant update (nom_affiche, pays, telephone, langue, consentement_marketing, consentement_le) on public.profils to authenticated;
revoke update on public.profils from authenticated; grant update (nom_affiche, pays, telephone, langue, consentement_marketing, consentement_le) on public.profils to authenticated;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','admin@x.fr'),('00000000-0000-0000-0000-00000000000b','bob@x.fr'),('00000000-0000-0000-0000-00000000000c','eve@x.fr');
update profils set role='admin' where email='admin@x.fr';
insert into films(slug,titre,statut) values ('pub','Publié','publie'),('brou','Brouillon','brouillon');
insert into abonnements(utilisateur_id,formule) values ('00000000-0000-0000-0000-00000000000b','mensuel');

\echo '-- 2e abonnement actif doit échouer'

\set ON_ERROR_STOP 0
insert into abonnements(utilisateur_id,formule) values ('00000000-0000-0000-0000-00000000000b','annuel');
set role anon; 
\echo '-- anon voit films:'
select slug from films; reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';

\echo '-- bob voit profils:'
select email from profils;
insert into visionnages(utilisateur_id,film_id,position_secondes) select '00000000-0000-0000-0000-00000000000b', id, 42 from films where slug='pub';

\echo '-- bob insère visionnage pour eve (doit échouer)'
insert into visionnages(utilisateur_id,film_id) select '00000000-0000-0000-0000-00000000000c', id from films where slug='pub';

\echo '-- bob se met admin (doit échouer)'
update profils set role='admin';
update profils set pays='CD';

\echo '-- bob vue crm:'
select email, formule_actuelle, nb_films_vus, pays from vue_crm_abonnes;

\echo '-- bob campagnes (0)'
select count(*) from campagnes;
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';

\echo '-- admin vue crm:'
select email, formule_actuelle, nb_films_vus from vue_crm_abonnes order by email;
insert into campagnes(nom,canal,contenu) values ('Relance','email','Nouveau film !'); select nom from campagnes;
insert into abonnements(utilisateur_id,formule,fournisseur_paiement,telephone_paiement,reference_externe) values ('00000000-0000-0000-0000-00000000000c','mensuel','mpesa','+243000','TX1'); select formule,fournisseur_paiement,devise from abonnements;
