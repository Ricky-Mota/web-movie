-- Tests de la partie traduction de Professa-M.
-- À lancer dans l'éditeur SQL de Supabase. Toutes les données de test sont annulées.
-- Résultat attendu : « RESULTAT : 20 tests réussis (données de test annulées) ».

do $$
declare
  u_a uuid := gen_random_uuid();
  t_a uuid := gen_random_uuid();
  u_b uuid := gen_random_uuid();
  o_a uuid; o_b uuid; v_a uuid; s1 uuid; s2 uuid; tr uuid; j1 uuid; j2 uuid;
  n integer; ok boolean; passed integer := 0;
begin
  insert into auth.users (id, email, aud, role)
  values (u_a, 'resp-a@test.invalid', 'authenticated', 'authenticated'),
         (t_a, 'prof-a@test.invalid', 'authenticated', 'authenticated'),
         (u_b, 'resp-b@test.invalid', 'authenticated', 'authenticated');

  -- Centre A : une vidéo en français
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  o_a := public.create_organization('ONG A', 'Responsable A');
  insert into public.videos (title, subject, source_kind, source_url, source_language, rights_confirmed)
  values ('Hygiène de l''eau', 'Santé', 'link', 'https://exemple.org/eau.mp4', 'fr', true) returning id into v_a;

  -- T1 : droits obligatoires
  ok := false;
  begin
    insert into public.videos (title, source_kind, source_url, source_language, rights_confirmed)
    values ('Sans droits', 'link', 'https://exemple.org/x.mp4', 'fr', false);
  exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T1 : vidéo acceptée sans confirmation des droits'; end if;
  passed := passed + 1;

  -- T2 : l'utilisateur ne peut pas changer lui-même le statut de la vidéo
  ok := false;
  begin update public.videos set status = 'ready' where id = v_a; exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T2 : statut de vidéo modifiable par l''utilisateur'; end if;
  passed := passed + 1;
  execute 'reset role';

  insert into public.profiles (id, organization_id, full_name, role) values (t_a, o_a, 'Agent A', 'teacher');

  -- Le service a transcrit la vidéo (125 secondes)
  update public.videos set status = 'transcript_review', duration_seconds = 125 where id = v_a;

  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.transcript_segments (video_id, position, start_ms, end_ms, text)
  values (v_a, 1, 0, 4000, 'Faites bouillir l''eau.') returning id into s1;
  insert into public.transcript_segments (video_id, position, start_ms, end_ms, text)
  values (v_a, 2, 4000, 9000, 'Lavez-vous les mains.') returning id into s2;
  perform public.confirm_transcript(v_a);

  -- T3 : transcription verrouillée après validation
  ok := false;
  begin update public.transcript_segments set text = 'Modifié' where id = s1; exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T3 : transcription modifiée après validation'; end if;
  passed := passed + 1;

  -- T4 : langue pas encore ouverte (japonais, vague 2)
  ok := false;
  begin insert into public.translations (video_id, language_code) values (v_a, 'ja'); exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T4 : traduction acceptée dans une langue fermée'; end if;
  passed := passed + 1;

  -- T5 : langue cible identique à la langue de la vidéo
  ok := false;
  begin insert into public.translations (video_id, language_code) values (v_a, 'fr'); exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T5 : traduction vers la même langue acceptée'; end if;
  passed := passed + 1;

  insert into public.translations (video_id, language_code, output) values (v_a, 'ln', 'dubbing') returning id into tr;
  insert into public.translation_segments (translation_id, segment_id, text) values (tr, s1, 'Botoka mai.');

  -- T6 : impossible de passer en relecture s'il manque des passages
  ok := false;
  begin perform public.submit_translation_for_review(tr); exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T6 : traduction incomplète envoyée en relecture'; end if;
  passed := passed + 1;

  insert into public.translation_segments (translation_id, segment_id, text) values (tr, s2, 'Sukola maboko.');
  perform public.submit_translation_for_review(tr);
  execute 'reset role';

  -- T7 : un agent (non responsable) ne peut pas approuver
  perform set_config('request.jwt.claims', json_build_object('sub', t_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin perform public.approve_translation(tr); exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T7 : approbation par un non-responsable'; end if;
  passed := passed + 1;
  execute 'reset role';

  -- Centre B
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  o_b := public.create_organization('Église B', 'Responsable B');

  -- T8 : B ne voit rien des vidéos, transcriptions et traductions de A
  select (select count(*) from public.videos) + (select count(*) from public.transcript_segments)
       + (select count(*) from public.translations) + (select count(*) from public.translation_segments) into n;
  if n <> 0 then raise exception 'ECHEC T8 : B voit % ligne(s) de A', n; end if;
  passed := passed + 1;

  -- T9 : B ne peut pas faire avancer une traduction de A
  ok := false;
  begin perform public.approve_translation(tr); exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T9 : B a approuvé une traduction de A'; end if;
  passed := passed + 1;

  -- T10 : B ne peut pas rattacher une traduction à la vidéo de A
  ok := false;
  begin insert into public.translations (video_id, language_code) values (v_a, 'sw'); exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T10 : B a créé une traduction sur la vidéo de A'; end if;
  passed := passed + 1;
  execute 'reset role';

  -- Le responsable de A approuve
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.approve_translation(tr);

  -- T11 : traduction verrouillée après approbation
  ok := false;
  begin update public.translation_segments set text = 'Autre' where translation_id = tr; exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T11 : traduction modifiée après approbation'; end if;
  passed := passed + 1;

  -- T12 : pas de production sans crédit
  ok := false;
  begin perform public.start_translation(tr); exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T12 : production lancée sans crédit'; end if;
  passed := passed + 1;
  execute 'reset role';

  perform public.grant_credits(o_a, 10, 'Crédits de test');

  -- T13 : coût = 3 minutes entamées × 3 (doublage) = 9 crédits
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j1 := public.start_translation(tr);
  execute 'reset role';
  if private.available_credits(o_a) <> 1 then
    raise exception 'ECHEC T13 : solde = % (attendu 1 après réservation de 9)', private.available_credits(o_a);
  end if;
  passed := passed + 1;

  -- T14 : échec => remboursement et statut échec
  perform public.complete_production_job(j1, false, 'Erreur simulée');
  if private.available_credits(o_a) <> 10 or (select status from public.translations where id = tr) <> 'failed' then
    raise exception 'ECHEC T14 : remboursement ou statut incorrect';
  end if;
  passed := passed + 1;

  -- T15 : relance et réussite => 9 crédits consommés, traduction livrée
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j2 := public.start_translation(tr);
  execute 'reset role';
  perform public.complete_production_job(j2, true, null, 0.80);
  if private.available_credits(o_a) <> 1 or (select status from public.translations where id = tr) <> 'delivered' then
    raise exception 'ECHEC T15 : consommation ou statut incorrect';
  end if;
  passed := passed + 1;

  -- T16 : le centre B n'a pas été touché
  if private.available_credits(o_b) <> 0 then raise exception 'ECHEC T16 : crédits du centre B modifiés'; end if;
  passed := passed + 1;

  -- Visiteur anonyme du site
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';

  -- T17 : les 13 langues sont visibles par le site
  select count(*) into n from public.languages;
  if n <> 13 then raise exception 'ECHEC T17 : % langue(s) visibles', n; end if;
  passed := passed + 1;

  -- T18 : une demande avec lien est enregistrée (et crée le prospect)
  perform public.submit_translation_request('Église Test', 'Pasteur Test', '+243 82 000 0001', null, 'Église',
    'https://www.youtube.com/watch?v=test', null, null, 'fr', array['ln', 'sw', 'xx'], 'both', true, 'Prédication', null);

  -- T19 : sans confirmation des droits, la demande est refusée
  ok := false;
  begin
    perform public.submit_translation_request('Église Test', 'Pasteur Test', '+243820000001', null, null,
      'https://exemple.org/v.mp4', null, null, 'fr', array['ln'], 'subtitles', false, null, null);
  exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T19 : demande acceptée sans droits'; end if;
  passed := passed + 1;

  -- T20 : un visiteur ne peut pas lire les demandes
  ok := false;
  begin perform count(*) from public.translation_requests; exception when others then ok := true; end;
  if not ok then raise exception 'ECHEC T20 : un visiteur peut lire les demandes'; end if;
  passed := passed + 1;
  execute 'reset role';

  -- Vérification de T18 (en tant que service)
  select count(*) into n from public.translation_requests r join public.crm_leads l on l.id = r.lead_id
  where l.center_name = 'Église Test' and r.target_languages = array['ln', 'sw'] and r.output = 'both';
  if n <> 1 then raise exception 'ECHEC T18 : demande non enregistrée correctement'; end if;
  passed := passed + 1;

  raise exception 'RESULTAT : % tests réussis (données de test annulées)', passed;
end;
$$;
