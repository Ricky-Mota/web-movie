create function private.episode_credit_cost(p_episode_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select 1;
$$;

create function public.create_organization(
  p_name         text,
  p_full_name    text,
  p_country_code text default 'CD',
  p_currency     text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Cet utilisateur appartient déjà à un centre' using errcode = '23505';
  end if;

  insert into public.organizations (name, country_code, currency)
  values (p_name, upper(p_country_code), upper(p_currency))
  returning id into v_org_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (v_uid, v_org_id, p_full_name, 'manager');

  return v_org_id;
end;
$$;

create function private.lock_episode_for_transition(
  p_episode_id      uuid,
  p_allowed_from    public.episode_status[],
  p_require_manager boolean
)
returns public.episodes
language plpgsql
set search_path = ''
as $$
declare
  v_episode public.episodes;
begin
  select * into v_episode
  from public.episodes e
  where e.id = p_episode_id
    and e.organization_id = private.current_org_id()
  for update;

  if not found then
    raise exception 'Épisode introuvable' using errcode = 'P0002';
  end if;
  if p_require_manager and not private.is_manager() then
    raise exception 'Action réservée au responsable du centre' using errcode = '42501';
  end if;
  if not (v_episode.status = any (p_allowed_from)) then
    raise exception 'Transition impossible depuis le statut « % »', v_episode.status
      using errcode = '22023';
  end if;
  return v_episode;
end;
$$;

create function public.submit_script_for_review(p_episode_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_episode_for_transition(p_episode_id, array['draft']::public.episode_status[], false);

  if not exists (
    select 1 from public.scenes s
    join public.dialogue_lines l on l.scene_id = s.id
    where s.episode_id = p_episode_id
  ) then
    raise exception 'Le script doit contenir au moins une scène avec une réplique' using errcode = '22023';
  end if;

  update public.episodes
  set status = 'script_review', status_changed_at = now()
  where id = p_episode_id;
end;
$$;

create function public.return_episode_to_draft(p_episode_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_episode public.episodes;
begin
  v_episode := private.lock_episode_for_transition(
    p_episode_id,
    array['script_review', 'approved', 'video_review', 'failed']::public.episode_status[],
    false
  );
  if v_episode.status <> 'script_review' and not private.is_manager() then
    raise exception 'Action réservée au responsable du centre' using errcode = '42501';
  end if;

  update public.episodes
  set status = 'draft', approved_version_id = null, status_changed_at = now()
  where id = p_episode_id;
end;
$$;

create function public.approve_script(p_episode_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_episode    public.episodes;
  v_content    jsonb;
  v_version    integer;
  v_version_id uuid;
begin
  v_episode := private.lock_episode_for_transition(
    p_episode_id, array['script_review']::public.episode_status[], true
  );

  select jsonb_build_object(
    'episode', jsonb_build_object(
      'id', v_episode.id,
      'title', v_episode.title,
      'situation', v_episode.situation,
      'target_duration_minutes', v_episode.target_duration_minutes
    ),
    'scenes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'position', s.position,
          'title', s.title,
          'setting', case when st.id is null then null
                          else jsonb_build_object('id', st.id, 'name', st.name, 'description', st.description) end,
          'characters', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', c.id, 'name', c.name,
                     'voice_provider', c.voice_provider, 'voice_id', c.voice_id, 'voice_speed', c.voice_speed
                   ) order by c.name)
            from public.scene_characters sc
            join public.characters c on c.id = sc.character_id
            where sc.scene_id = s.id
          ), '[]'::jsonb),
          'lines', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', l.id, 'position', l.position, 'character_id', l.character_id,
                     'text_en', l.text_en, 'translation', l.translation
                   ) order by l.position)
            from public.dialogue_lines l
            where l.scene_id = s.id
          ), '[]'::jsonb)
        ) order by s.position
      )
      from public.scenes s
      left join public.settings st on st.id = s.setting_id
      where s.episode_id = v_episode.id
    ), '[]'::jsonb)
  ) into v_content;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.script_versions where episode_id = v_episode.id;

  insert into public.script_versions (organization_id, episode_id, version_number, content, approved_by)
  values (v_episode.organization_id, v_episode.id, v_version, v_content, (select auth.uid()))
  returning id into v_version_id;

  update public.episodes
  set status = 'approved', approved_version_id = v_version_id, status_changed_at = now()
  where id = v_episode.id;

  return v_version_id;
end;
$$;

create function public.start_production(p_episode_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_episode   public.episodes;
  v_cost      integer;
  v_available integer;
  v_job_id    uuid;
begin
  perform 1 from public.organizations o
  where o.id = private.current_org_id()
  for update;

  v_episode := private.lock_episode_for_transition(
    p_episode_id, array['approved', 'failed']::public.episode_status[], true
  );
  if v_episode.approved_version_id is null then
    raise exception 'Aucune version approuvée pour cet épisode' using errcode = '22023';
  end if;

  v_cost := private.episode_credit_cost(v_episode.id);
  v_available := private.available_credits(v_episode.organization_id);
  if v_available < v_cost then
    raise exception 'Crédits insuffisants : % disponible(s), % nécessaire(s)', v_available, v_cost
      using errcode = 'P0001', hint = 'insufficient_credits';
  end if;

  insert into public.production_jobs
    (organization_id, episode_id, script_version_id, credits_reserved, created_by)
  values
    (v_episode.organization_id, v_episode.id, v_episode.approved_version_id, v_cost, (select auth.uid()))
  returning id into v_job_id;

  insert into public.credit_transactions (organization_id, kind, amount, production_job_id, note)
  values (v_episode.organization_id, 'reserve', -v_cost, v_job_id, 'Production : ' || v_episode.title);

  update public.episodes
  set status = 'in_production', status_changed_at = now()
  where id = v_episode.id;

  return v_job_id;
end;
$$;

create function public.complete_production_job(
  p_job_id          uuid,
  p_success         boolean,
  p_error_message   text default null,
  p_actual_cost_usd numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job         public.production_jobs;
  v_reservation public.credit_transactions;
begin
  select * into v_job from public.production_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Production introuvable' using errcode = 'P0002';
  end if;
  if v_job.status not in ('queued', 'running') then
    raise exception 'Production déjà terminée (statut « % »)', v_job.status using errcode = '22023';
  end if;

  select * into v_reservation
  from public.credit_transactions
  where production_job_id = v_job.id and kind = 'reserve';
  if not found then
    raise exception 'Réservation de crédits introuvable pour cette production' using errcode = 'P0002';
  end if;

  if p_success then
    insert into public.credit_transactions (organization_id, kind, amount, reservation_id, production_job_id, note)
    values (v_job.organization_id, 'consume', 0, v_reservation.id, v_job.id, 'Production réussie');

    update public.production_jobs
    set status = 'succeeded', error_message = null, actual_cost_usd = p_actual_cost_usd,
        finished_at = now(), started_at = coalesce(started_at, created_at)
    where id = v_job.id;

    update public.episodes
    set status = 'video_review', status_changed_at = now()
    where id = v_job.episode_id;
  else
    insert into public.credit_transactions (organization_id, kind, amount, reservation_id, production_job_id, note)
    values (v_job.organization_id, 'refund', -v_reservation.amount, v_reservation.id, v_job.id,
            'Remboursement : production en échec');

    update public.production_jobs
    set status = 'failed', error_message = p_error_message, actual_cost_usd = p_actual_cost_usd,
        finished_at = now(), started_at = coalesce(started_at, created_at)
    where id = v_job.id;

    update public.episodes
    set status = 'failed', status_changed_at = now()
    where id = v_job.episode_id;
  end if;
end;
$$;

create function public.publish_episode(p_episode_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_episode_for_transition(p_episode_id, array['video_review']::public.episode_status[], true);

  update public.episodes
  set status = 'published', status_changed_at = now()
  where id = p_episode_id;
end;
$$;

create function public.confirm_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_credits integer;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Paiement introuvable' using errcode = 'P0002';
  end if;
  if v_payment.status = 'succeeded' then
    return;
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Paiement au statut « % » : confirmation impossible', v_payment.status using errcode = '22023';
  end if;

  select p.credits_included into v_credits from public.plans p where p.id = v_payment.plan_id;
  if v_credits is null then
    raise exception 'Le paiement n''est lié à aucune offre' using errcode = '22023';
  end if;

  update public.payments
  set status = 'succeeded', credits_granted = v_credits, paid_at = coalesce(paid_at, now())
  where id = v_payment.id;

  insert into public.credit_transactions (organization_id, kind, amount, payment_id, note)
  values (v_payment.organization_id, 'purchase', v_credits, v_payment.id, 'Achat de crédits');
end;
$$;

create function public.grant_credits(p_organization_id uuid, p_amount integer, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount = 0 then
    raise exception 'Montant nul' using errcode = '22023';
  end if;
  insert into public.credit_transactions (organization_id, kind, amount, note)
  values (p_organization_id, case when p_amount > 0 then 'grant' else 'adjustment' end::public.credit_tx_kind,
          p_amount, p_note);
end;
$$;

create function private.guard_episode_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'in_production' then
    raise exception 'Impossible de supprimer un épisode en cours de production' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger episodes_guard_delete before delete on public.episodes
  for each row execute function private.guard_episode_delete();

revoke execute on function public.create_organization(text, text, text, text) from public, anon;
revoke execute on function public.submit_script_for_review(uuid)              from public, anon;
revoke execute on function public.return_episode_to_draft(uuid)               from public, anon;
revoke execute on function public.approve_script(uuid)                        from public, anon;
revoke execute on function public.start_production(uuid)                     from public, anon;
revoke execute on function public.publish_episode(uuid)                       from public, anon;

grant execute on function public.create_organization(text, text, text, text) to authenticated;
grant execute on function public.submit_script_for_review(uuid)              to authenticated;
grant execute on function public.return_episode_to_draft(uuid)               to authenticated;
grant execute on function public.approve_script(uuid)                        to authenticated;
grant execute on function public.start_production(uuid)                     to authenticated;
grant execute on function public.publish_episode(uuid)                       to authenticated;

revoke execute on function public.complete_production_job(uuid, boolean, text, numeric) from public, anon, authenticated;
revoke execute on function public.confirm_payment(uuid)                                 from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, integer, text)                    from public, anon, authenticated;
grant  execute on function public.complete_production_job(uuid, boolean, text, numeric) to service_role;
grant  execute on function public.confirm_payment(uuid)                                 to service_role;
grant  execute on function public.grant_credits(uuid, integer, text)                    to service_role;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.current_org_id()    to authenticated, service_role;
grant execute on function private.current_user_role() to authenticated, service_role;
grant execute on function private.is_manager()        to authenticated, service_role;
grant execute on function private.assert_episode_editable(uuid) to authenticated, service_role;
