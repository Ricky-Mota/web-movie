-- Tests critiques Professa-M : séparation des centres (RLS) et décompte des crédits.
--
-- À lancer dans l'éditeur SQL de Supabase (rôle postgres).
-- Tout le script s'exécute dans un seul bloc qui se termine volontairement par une
-- erreur « RESULTAT : ... » : Postgres annule alors toutes les données de test.
--   - Message « RESULTAT : n tests réussis »  -> tout va bien.
--   - Message « ECHEC : ... »                 -> un test a échoué, le message dit lequel.

do $$
declare
  u_a  uuid := gen_random_uuid();  -- responsable du centre A
  t_a  uuid := gen_random_uuid();  -- enseignant du centre A
  u_b  uuid := gen_random_uuid();  -- responsable du centre B
  o_a  uuid;
  o_b  uuid;
  c_a  uuid;
  m_a  uuid;
  e_a  uuid;
  s_a  uuid;
  l_a  uuid;
  j1   uuid;
  j2   uuid;
  n    integer;
  ok   boolean;
  passed integer := 0;
begin
  insert into auth.users (id, email, aud, role)
  values (u_a, 'resp-a@test.invalid', 'authenticated', 'authenticated'),
         (t_a, 'prof-a@test.invalid', 'authenticated', 'authenticated'),
         (u_b, 'resp-b@test.invalid', 'authenticated', 'authenticated');

  ---------------------------------------------------------------------------
  -- Mise en place : centre A avec un épisode complet, centre B vide
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  o_a := public.create_organization('Centre A', 'Responsable A');
  insert into public.courses (title, cefr_level) values ('Adultes débutants A1', 'A1') returning id into c_a;
  insert into public.modules (course_id, title, position) values (c_a, 'Faire des achats', 1) returning id into m_a;
  insert into public.episodes (module_id, title, position) values (m_a, 'At the shop', 1) returning id into e_a;
  insert into public.scenes (episode_id, title, position) values (e_a, 'Épicerie', 1) returning id into s_a;
  insert into public.dialogue_lines (scene_id, text_en, translation, position)
  values (s_a, 'How much is this water?', 'Combien coûte cette eau ?', 1) returning id into l_a;
  execute 'reset role';

  -- Enseignant du centre A (pas encore de parcours d'invitation : ajout direct)
  insert into public.profiles (id, organization_id, full_name, role) values (t_a, o_a, 'Enseignant A', 'teacher');

  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  o_b := public.create_organization('Centre B', 'Responsable B');

  ---------------------------------------------------------------------------
  -- 1. Séparation des centres (vu depuis le centre B)
  ---------------------------------------------------------------------------
  select count(*) into n from public.organizations;
  if n <> 1 then raise exception 'ECHEC 1.1 : B voit % centre(s) au lieu de 1', n; end if;
  passed := passed + 1;

  select count(*) into n from public.courses;
  if n <> 0 then raise exception 'ECHEC 1.2 : B voit % parcours du centre A', n; end if;
  passed := passed + 1;

  select (select count(*) from public.episodes) + (select count(*) from public.scenes)
       + (select count(*) from public.dialogue_lines) + (select count(*) from public.modules)
    into n;
  if n <> 0 then raise exception 'ECHEC 1.3 : B voit % ligne(s) pédagogiques du centre A', n; end if;
  passed := passed + 1;

  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'ECHEC 1.4 : B voit % profil(s) au lieu de 1', n; end if;
  passed := passed + 1;

  update public.courses set title = 'Piraté' where id = c_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC 1.5 : B a modifié un parcours du centre A'; end if;
  passed := passed + 1;

  delete from public.dialogue_lines where id = l_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC 1.6 : B a supprimé une réplique du centre A'; end if;
  passed := passed + 1;

  ok := false;
  begin
    insert into public.courses (organization_id, title, cefr_level) values (o_a, 'Intrus', 'A1');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 1.7 : B a créé un parcours dans le centre A'; end if;
  passed := passed + 1;

  ok := false;
  begin
    insert into public.modules (course_id, title, position) values (c_a, 'Module intrus', 9);
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 1.8 : B a rattaché un module au parcours du centre A'; end if;
  passed := passed + 1;

  ok := false;
  begin
    perform public.submit_script_for_review(e_a);
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 1.9 : B a fait avancer un épisode du centre A'; end if;
  passed := passed + 1;

  select count(*) into n from public.credit_balances;
  if n <> 1 then raise exception 'ECHEC 1.10 : B voit % solde(s) de crédits au lieu de 1', n; end if;
  passed := passed + 1;

  ok := false;
  begin
    perform public.grant_credits(o_b, 100, 'Auto-attribution');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 1.11 : un utilisateur connecté a pu s''attribuer des crédits'; end if;
  passed := passed + 1;

  ok := false;
  begin
    insert into public.credit_transactions (organization_id, kind, amount, note) values (o_b, 'grant', 100, 'Fraude');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 1.12 : écriture directe dans le journal des crédits autorisée'; end if;
  passed := passed + 1;
  execute 'reset role';

  ---------------------------------------------------------------------------
  -- 2. Parcours de validation et crédits (centre A)
  ---------------------------------------------------------------------------
  -- 2.1 Un enseignant ne peut pas se promouvoir responsable
  perform set_config('request.jwt.claims', json_build_object('sub', t_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    update public.profiles set role = 'manager' where id = t_a;
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 2.1 : un enseignant s''est promu responsable'; end if;
  passed := passed + 1;

  perform public.submit_script_for_review(e_a);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.approve_script(e_a);

  -- 2.2 Script verrouillé après approbation
  ok := false;
  begin
    update public.dialogue_lines set text_en = 'Changed after approval' where id = l_a;
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 2.2 : réplique modifiée après approbation'; end if;
  passed := passed + 1;

  -- 2.3 Pas de production sans crédit
  ok := false;
  begin
    perform public.start_production(e_a);
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 2.3 : production lancée sans crédit'; end if;
  passed := passed + 1;
  execute 'reset role';

  -- Le service (administrateur) ajoute 2 crédits
  perform public.grant_credits(o_a, 2, 'Crédits de test');

  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j1 := public.start_production(e_a);

  -- 2.4 Réservation : 1 crédit réservé, 1 disponible
  select available into n from public.credit_balances where organization_id = o_a;
  if n <> 1 then raise exception 'ECHEC 2.4 : solde après réservation = % (attendu 1)', n; end if;
  select reserved into n from public.credit_balances where organization_id = o_a;
  if n <> 1 then raise exception 'ECHEC 2.4b : crédits réservés = % (attendu 1)', n; end if;
  passed := passed + 1;

  -- 2.5 Un utilisateur connecté ne peut pas déclarer lui-même la production terminée
  ok := false;
  begin
    perform public.complete_production_job(j1, true);
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 2.5 : un utilisateur a clôturé lui-même une production'; end if;
  passed := passed + 1;
  execute 'reset role';

  -- 2.6 Échec de production : crédit remboursé, épisode en échec
  perform public.complete_production_job(j1, false, 'Erreur simulée', 0.42);
  if private.available_credits(o_a) <> 2 then
    raise exception 'ECHEC 2.6 : solde après échec = % (attendu 2)', private.available_credits(o_a);
  end if;
  if (select status from public.episodes where id = e_a) <> 'failed' then
    raise exception 'ECHEC 2.6b : l''épisode n''est pas au statut échec';
  end if;
  passed := passed + 1;

  -- 2.7 Une production terminée ne peut pas être clôturée deux fois (pas de double remboursement)
  ok := false;
  begin
    perform public.complete_production_job(j1, false);
  exception when others then ok := true;
  end;
  if not ok or private.available_credits(o_a) <> 2 then
    raise exception 'ECHEC 2.7 : double clôture possible';
  end if;
  passed := passed + 1;

  -- 2.8 Relance puis réussite : 1 crédit consommé
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j2 := public.start_production(e_a);
  execute 'reset role';
  perform public.complete_production_job(j2, true, null, 1.10);
  if private.available_credits(o_a) <> 1 then
    raise exception 'ECHEC 2.8 : solde après réussite = % (attendu 1)', private.available_credits(o_a);
  end if;
  if (select status from public.episodes where id = e_a) <> 'video_review' then
    raise exception 'ECHEC 2.8b : l''épisode n''est pas en vidéo à valider';
  end if;
  passed := passed + 1;

  -- 2.9 Le journal est en ajout seul
  ok := false;
  begin
    delete from public.credit_transactions where organization_id = o_a;
  exception when others then ok := true;
  end;
  if not ok then raise exception 'ECHEC 2.9 : une ligne du journal a pu être supprimée'; end if;
  passed := passed + 1;

  -- 2.10 Publication par le responsable
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.publish_episode(e_a);
  execute 'reset role';
  if (select status from public.episodes where id = e_a) <> 'published' then
    raise exception 'ECHEC 2.10 : l''épisode n''est pas publié';
  end if;
  passed := passed + 1;

  -- 2.11 Le centre B n'a toujours aucun crédit
  if private.available_credits(o_b) <> 0 then
    raise exception 'ECHEC 2.11 : le centre B a % crédit(s)', private.available_credits(o_b);
  end if;
  passed := passed + 1;

  raise exception 'RESULTAT : % tests réussis (données de test annulées)', passed;
end;
$$;
