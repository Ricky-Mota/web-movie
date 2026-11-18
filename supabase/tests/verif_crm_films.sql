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
reset role;
\echo '-- Séries, épisodes et sous-titres en 4 langues'
insert into series(id,slug,titre,statut) values ('11111111-1111-1111-1111-111111111111','serie-test','Série test','publie');
insert into films(id,slug,titre,statut,serie_id,saison,numero_episode) values ('22222222-2222-2222-2222-222222222222','ep1','Épisode 1','publie','11111111-1111-1111-1111-111111111111',1,1);
\echo '-- même numéro d épisode (doit échouer)'
insert into films(slug,titre,serie_id,saison,numero_episode) values ('ep1b','Doublon','11111111-1111-1111-1111-111111111111',1,1);
\echo '-- épisode sans numéro (doit échouer)'
insert into films(slug,titre,serie_id) values ('ep-x','Sans numéro','11111111-1111-1111-1111-111111111111');
insert into sous_titres(film_id,langue,fichier_chemin,par_defaut,statut) values
 ('22222222-2222-2222-2222-222222222222','fr','st/ep1/fr.vtt',true,'pret'),
 ('22222222-2222-2222-2222-222222222222','en','st/ep1/en.vtt',false,'pret'),
 ('22222222-2222-2222-2222-222222222222','es','st/ep1/es.vtt',false,'pret'),
 ('22222222-2222-2222-2222-222222222222','pt-BR','st/ep1/pt-BR.vtt',false,'brouillon');
\echo '-- 2e langue par défaut (doit échouer)'
update sous_titres set par_defaut=true where langue='en';
\echo '-- langue non prévue (doit échouer)'
insert into sous_titres(film_id,langue,fichier_chemin) values ('22222222-2222-2222-2222-222222222222','de','x.vtt');
reset request.jwt.claim.sub;
set role anon;
\echo '-- anon voit les pistes prêtes (fr, en, es) :'
select langue from sous_titres order by langue;
\echo '-- anon voit la série :'
select s.titre, f.numero_episode from series s join films f on f.serie_id = s.id;
reset role;
