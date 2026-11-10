-- Professa-M : traduction et doublage de vidéos.
-- S'ajoute au modèle existant : mêmes centres (organizations), mêmes rôles,
-- même journal de crédits et mêmes tâches de production.

------------------------------------------------------------------------------
-- 1. Langues
------------------------------------------------------------------------------
create table public.languages (
  code               text primary key check (code ~ '^[a-z]{2,3}$'),
  name_fr            text not null,
  native_name        text not null,
  wave               smallint not null check (wave between 1 and 3),
  is_active          boolean not null default false,
  needs_human_review boolean not null default false,
  position           smallint not null
);

insert into public.languages (code, name_fr, native_name, wave, is_active, needs_human_review, position) values
  ('fr',  'Français',  'Français',   1, true,  false, 1),
  ('en',  'Anglais',   'English',    1, true,  false, 2),
  ('sw',  'Swahili',   'Kiswahili',  1, true,  false, 3),
  ('ln',  'Lingala',   'Lingála',    1, true,  true,  4),
  ('pt',  'Portugais', 'Português',  1, true,  false, 5),
  ('es',  'Espagnol',  'Español',    2, false, false, 6),
  ('ar',  'Arabe',     'العربية',    2, false, false, 7),
  ('de',  'Allemand',  'Deutsch',    2, false, false, 8),
  ('zh',  'Chinois',   '中文',        2, false, false, 9),
  ('ja',  'Japonais',  '日本語',      2, false, false, 10),
  ('hi',  'Hindi',     'हिन्दी',       2, false, false, 11),
  ('lua', 'Tshiluba',  'Tshiluba',   3, false, true,  12),
  ('kg',  'Kikongo',   'Kikongo',    3, false, true,  13);

alter table public.languages enable row level security;
create policy "tous : lire les langues" on public.languages
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.languages from anon, authenticated;

------------------------------------------------------------------------------
-- 2. Vidéos et transcription
------------------------------------------------------------------------------
create type public.video_source       as enum ('upload', 'youtube', 'link');
create type public.video_status       as enum ('uploaded', 'transcribing', 'transcript_review', 'ready', 'failed');
create type public.translation_output as enum ('subtitles', 'dubbing');
create type public.translation_status as enum ('draft', 'review', 'approved', 'in_production', 'delivered', 'failed');

create table public.videos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default private.current_org_id()
                   references public.organizations (id) on delete cascade,
  title            text not null check (length(btrim(title)) between 1 and 200),
  subject          text check (subject is null or length(subject) <= 120),
  source_kind      public.video_source not null,
  source_url       text check (source_url is null or (source_url ~ '^https?://' and length(source_url) <= 500)),
  storage_path     text check (storage_path is null or length(storage_path) <= 500),
  source_language  text not null references public.languages (code),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 36000),
  rights_confirmed boolean not null check (rights_confirmed),
  status           public.video_status not null default 'uploaded',
  error_message    text,
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  check (source_url is not null or storage_path is not null)
);
create index videos_organization_id_idx on public.videos (organization_id, created_at desc);
create index videos_source_language_idx on public.videos (source_language);
create index videos_created_by_idx on public.videos (created_by);
create trigger videos_updated_at before update on public.videos
  for each row execute function private.set_updated_at();

create table public.transcript_segments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  video_id        uuid not null,
  position        integer not null check (position >= 1),
  start_ms        integer not null check (start_ms >= 0),
  end_ms          integer not null,
  speaker         text check (speaker is null or length(speaker) <= 80),
  text            text not null check (length(btrim(text)) > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id),
  unique (video_id, position) deferrable initially immediate,
  check (end_ms > start_ms),
  foreign key (video_id, organization_id)
    references public.videos (id, organization_id) on delete cascade
);
create index transcript_segments_organization_id_idx on public.transcript_segments (organization_id);
create trigger transcript_segments_updated_at before update on public.transcript_segments
  for each row execute function private.set_updated_at();

------------------------------------------------------------------------------
-- 3. Traductions (une par vidéo et par langue)
------------------------------------------------------------------------------
create table public.translations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null default private.current_org_id()
                    references public.organizations (id) on delete cascade,
  video_id          uuid not null,
  language_code     text not null references public.languages (code),
  output            public.translation_output not null default 'subtitles',
  status            public.translation_status not null default 'draft',
  status_changed_at timestamptz not null default now(),
  summary           text check (summary is null or length(summary) <= 4000),
  glossary          jsonb not null default '[]' check (jsonb_typeof(glossary) = 'array'),
  quiz              jsonb not null default '[]' check (jsonb_typeof(quiz) = 'array'),
  voice_id          text check (voice_id is null or length(voice_id) <= 120),
  approved_snapshot jsonb,
  approved_at       timestamptz,
  approved_by       uuid references public.profiles (id) on delete set null,
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, organization_id),
  unique (video_id, language_code),
  foreign key (video_id, organization_id)
    references public.videos (id, organization_id) on delete cascade
);
create index translations_organization_id_idx on public.translations (organization_id, status);
create index translations_language_code_idx on public.translations (language_code);
create index translations_approved_by_idx on public.translations (approved_by);
create index translations_created_by_idx on public.translations (created_by);
create trigger translations_updated_at before update on public.translations
  for each row execute function private.set_updated_at();

create table public.translation_segments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  translation_id  uuid not null,
  segment_id      uuid not null,
  text            text not null check (length(btrim(text)) > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (translation_id, segment_id),
  foreign key (translation_id, organization_id)
    references public.translations (id, organization_id) on delete cascade,
  foreign key (segment_id, organization_id)
    references public.transcript_segments (id, organization_id) on delete cascade
);
create index translation_segments_organization_id_idx on public.translation_segments (organization_id);
create index translation_segments_segment_id_idx on public.translation_segments (segment_id);
create trigger translation_segments_updated_at before update on public.translation_segments
  for each row execute function private.set_updated_at();

------------------------------------------------------------------------------
-- 4. Verrous : on ne modifie pas un texte déjà approuvé
------------------------------------------------------------------------------
create function private.lock_transcript()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_video_id uuid := coalesce(new.video_id, old.video_id);
  v_status   public.video_status;
begin
  select v.status into v_status from public.videos v where v.id = v_video_id;
  if v_status is not null and v_status not in ('uploaded', 'transcribing', 'transcript_review') then
    raise exception 'Transcription verrouillée : la vidéo est au statut « % »', v_status using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger transcript_segments_lock before insert or update or delete on public.transcript_segments
  for each row execute function private.lock_transcript();

create function private.lock_translation_segments()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.translation_status;
begin
  select t.status into v_status from public.translations t
  where t.id = coalesce(new.translation_id, old.translation_id);
  if v_status is not null and v_status not in ('draft', 'review') then
    raise exception 'Traduction verrouillée : statut « % ». Repassez-la en brouillon pour la modifier.', v_status
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger translation_segments_lock before insert or update or delete on public.translation_segments
  for each row execute function private.lock_translation_segments();

create function private.guard_translation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.languages l where l.code = new.language_code and l.is_active) then
      raise exception 'La langue « % » n''est pas encore ouverte', new.language_code using errcode = '22023';
    end if;
    if not exists (select 1 from public.videos v where v.id = new.video_id and v.status = 'ready') then
      raise exception 'La transcription de la vidéo doit être validée avant de créer une traduction'
        using errcode = '22023';
    end if;
    if exists (select 1 from public.videos v where v.id = new.video_id and v.source_language = new.language_code) then
      raise exception 'La langue cible doit être différente de la langue de la vidéo' using errcode = '22023';
    end if;
  elsif current_user = 'authenticated' and old.status not in ('draft', 'review') then
    raise exception 'Traduction verrouillée : statut « % »', old.status using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger translations_guard before insert or update on public.translations
  for each row execute function private.guard_translation();

create function private.guard_translation_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'in_production' then
    raise exception 'Impossible de supprimer une traduction en cours de production' using errcode = '42501';
  end if;
  return old;
end;
$$;
create trigger translations_guard_delete before delete on public.translations
  for each row execute function private.guard_translation_delete();

------------------------------------------------------------------------------
-- 5. Production : une tâche concerne soit un épisode, soit une traduction
------------------------------------------------------------------------------
alter table public.production_jobs
  alter column episode_id drop not null,
  alter column script_version_id drop not null,
  add column translation_id uuid,
  add constraint production_jobs_translation_fk
    foreign key (translation_id, organization_id)
    references public.translations (id, organization_id) on delete cascade,
  add constraint production_jobs_one_target check (
       (episode_id is not null and script_version_id is not null and translation_id is null)
    or (episode_id is null and script_version_id is null and translation_id is not null)
  );
create index production_jobs_translation_id_idx on public.production_jobs (translation_id);
create unique index production_jobs_one_active_translation_idx on public.production_jobs (translation_id)
  where status in ('queued', 'running');

-- Coût : minutes entamées × 1 (sous-titres) ou × 3 (doublage)
create function private.translation_credit_cost(p_duration_seconds integer, p_output public.translation_output)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (ceil(p_duration_seconds / 60.0) * case p_output when 'dubbing' then 3 else 1 end)::integer;
$$;

------------------------------------------------------------------------------
-- 6. Parcours de validation d'une vidéo et de ses traductions
------------------------------------------------------------------------------
create function public.confirm_transcript(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_video public.videos;
begin
  select * into v_video from public.videos
  where id = p_video_id and organization_id = private.current_org_id()
  for update;
  if not found then
    raise exception 'Vidéo introuvable' using errcode = 'P0002';
  end if;
  if v_video.status <> 'transcript_review' then
    raise exception 'Transition impossible depuis le statut « % »', v_video.status using errcode = '22023';
  end if;
  if v_video.duration_seconds is null then
    raise exception 'Durée de la vidéo inconnue' using errcode = '22023';
  end if;
  if not exists (select 1 from public.transcript_segments s where s.video_id = p_video_id) then
    raise exception 'La transcription est vide' using errcode = '22023';
  end if;
  update public.videos set status = 'ready' where id = p_video_id;
end;
$$;

create function private.lock_translation_for_transition(
  p_translation_id  uuid,
  p_allowed_from    public.translation_status[],
  p_require_manager boolean
)
returns public.translations
language plpgsql
set search_path = ''
as $$
declare
  v_t public.translations;
begin
  select * into v_t from public.translations t
  where t.id = p_translation_id and t.organization_id = private.current_org_id()
  for update;
  if not found then
    raise exception 'Traduction introuvable' using errcode = 'P0002';
  end if;
  if p_require_manager and not private.is_manager() then
    raise exception 'Action réservée au responsable' using errcode = '42501';
  end if;
  if not (v_t.status = any (p_allowed_from)) then
    raise exception 'Transition impossible depuis le statut « % »', v_t.status using errcode = '22023';
  end if;
  return v_t;
end;
$$;

create function public.submit_translation_for_review(p_translation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t       public.translations;
  v_missing integer;
begin
  v_t := private.lock_translation_for_transition(p_translation_id, array['draft']::public.translation_status[], false);
  select count(*) into v_missing
  from public.transcript_segments s
  where s.video_id = v_t.video_id
    and not exists (select 1 from public.translation_segments ts
                    where ts.translation_id = v_t.id and ts.segment_id = s.id);
  if v_missing > 0 then
    raise exception '% passage(s) ne sont pas encore traduits', v_missing using errcode = '22023';
  end if;
  update public.translations set status = 'review', status_changed_at = now() where id = v_t.id;
end;
$$;

create function public.return_translation_to_draft(p_translation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.translations;
begin
  v_t := private.lock_translation_for_transition(
    p_translation_id, array['review', 'approved', 'delivered', 'failed']::public.translation_status[], false);
  if v_t.status <> 'review' and not private.is_manager() then
    raise exception 'Action réservée au responsable' using errcode = '42501';
  end if;
  update public.translations
  set status = 'draft', approved_snapshot = null, approved_at = null, approved_by = null, status_changed_at = now()
  where id = v_t.id;
end;
$$;

create function public.approve_translation(p_translation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.translations;
  v_snapshot jsonb;
begin
  v_t := private.lock_translation_for_transition(p_translation_id, array['review']::public.translation_status[], true);
  select jsonb_build_object(
    'language', v_t.language_code,
    'output', v_t.output,
    'voice_id', v_t.voice_id,
    'summary', v_t.summary,
    'glossary', v_t.glossary,
    'quiz', v_t.quiz,
    'segments', coalesce(jsonb_agg(jsonb_build_object(
        'segment_id', s.id, 'position', s.position, 'start_ms', s.start_ms, 'end_ms', s.end_ms,
        'speaker', s.speaker, 'source', s.text, 'text', ts.text) order by s.position), '[]'::jsonb)
  ) into v_snapshot
  from public.transcript_segments s
  join public.translation_segments ts on ts.segment_id = s.id and ts.translation_id = v_t.id
  where s.video_id = v_t.video_id;

  update public.translations
  set status = 'approved', approved_snapshot = v_snapshot, approved_at = now(),
      approved_by = (select auth.uid()), status_changed_at = now()
  where id = v_t.id;
end;
$$;

create function public.start_translation(p_translation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t         public.translations;
  v_duration  integer;
  v_cost      integer;
  v_available integer;
  v_job_id    uuid;
begin
  perform 1 from public.organizations o where o.id = private.current_org_id() for update;

  v_t := private.lock_translation_for_transition(
    p_translation_id, array['approved', 'failed']::public.translation_status[], true);
  if v_t.approved_snapshot is null then
    raise exception 'Aucune version approuvée pour cette traduction' using errcode = '22023';
  end if;

  select v.duration_seconds into v_duration from public.videos v where v.id = v_t.video_id;
  v_cost := private.translation_credit_cost(v_duration, v_t.output);
  v_available := private.available_credits(v_t.organization_id);
  if v_available < v_cost then
    raise exception 'Crédits insuffisants : % disponible(s), % nécessaire(s)', v_available, v_cost
      using errcode = 'P0001', hint = 'insufficient_credits';
  end if;

  insert into public.production_jobs (organization_id, translation_id, credits_reserved, created_by)
  values (v_t.organization_id, v_t.id, v_cost, (select auth.uid()))
  returning id into v_job_id;

  insert into public.credit_transactions (organization_id, kind, amount, production_job_id, note)
  values (v_t.organization_id, 'reserve', -v_cost, v_job_id,
          'Traduction ' || v_t.language_code || ' (' || v_t.output || ')');

  update public.translations set status = 'in_production', status_changed_at = now() where id = v_t.id;
  return v_job_id;
end;
$$;

-- Clôture d'une tâche : même logique de crédits, appliquée aux épisodes ou aux traductions
create or replace function public.complete_production_job(
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

    if v_job.translation_id is not null then
      update public.translations set status = 'delivered', status_changed_at = now() where id = v_job.translation_id;
    else
      update public.episodes set status = 'video_review', status_changed_at = now() where id = v_job.episode_id;
    end if;
  else
    insert into public.credit_transactions (organization_id, kind, amount, reservation_id, production_job_id, note)
    values (v_job.organization_id, 'refund', -v_reservation.amount, v_reservation.id, v_job.id,
            'Remboursement : production en échec');

    update public.production_jobs
    set status = 'failed', error_message = p_error_message, actual_cost_usd = p_actual_cost_usd,
        finished_at = now(), started_at = coalesce(started_at, created_at)
    where id = v_job.id;

    if v_job.translation_id is not null then
      update public.translations set status = 'failed', status_changed_at = now() where id = v_job.translation_id;
    else
      update public.episodes set status = 'failed', status_changed_at = now() where id = v_job.episode_id;
    end if;
  end if;
end;
$$;

------------------------------------------------------------------------------
-- 7. Règles d'accès (RLS) : chaque centre ne voit que ses vidéos
------------------------------------------------------------------------------
alter table public.videos               enable row level security;
alter table public.transcript_segments  enable row level security;
alter table public.translations         enable row level security;
alter table public.translation_segments enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['videos', 'transcript_segments', 'translations', 'translation_segments'] loop
    execute format(
      'create policy "membres : lire" on public.%I for select to authenticated
         using (organization_id = (select private.current_org_id()))', t);
    execute format(
      'create policy "membres : créer" on public.%I for insert to authenticated
         with check (organization_id = (select private.current_org_id()))', t);
    execute format(
      'create policy "membres : modifier" on public.%I for update to authenticated
         using (organization_id = (select private.current_org_id()))
         with check (organization_id = (select private.current_org_id()))', t);
    execute format(
      'create policy "membres : supprimer" on public.%I for delete to authenticated
         using (organization_id = (select private.current_org_id())%s)', t,
      case when t in ('videos', 'translations') then ' and (select private.is_manager())' else '' end);
  end loop;
end;
$$;

revoke all on public.videos, public.transcript_segments, public.translations, public.translation_segments from anon;

-- Le statut et la durée sont fixés par le service (transcription, production), pas par l'utilisateur
revoke insert, update on public.videos from authenticated;
grant insert (id, organization_id, title, subject, source_kind, source_url, storage_path, source_language, rights_confirmed)
  on public.videos to authenticated;
grant update (title, subject) on public.videos to authenticated;

revoke insert, update on public.translations from authenticated;
grant insert (id, organization_id, video_id, language_code, output, voice_id) on public.translations to authenticated;
grant update (output, voice_id, summary, glossary, quiz) on public.translations to authenticated;

revoke execute on function public.confirm_transcript(uuid)            from public, anon;
revoke execute on function public.submit_translation_for_review(uuid) from public, anon;
revoke execute on function public.return_translation_to_draft(uuid)   from public, anon;
revoke execute on function public.approve_translation(uuid)           from public, anon;
revoke execute on function public.start_translation(uuid)             from public, anon;
grant execute on function public.confirm_transcript(uuid)            to authenticated;
grant execute on function public.submit_translation_for_review(uuid) to authenticated;
grant execute on function public.return_translation_to_draft(uuid)   to authenticated;
grant execute on function public.approve_translation(uuid)           to authenticated;
grant execute on function public.start_translation(uuid)             to authenticated;

revoke execute on function public.complete_production_job(uuid, boolean, text, numeric) from public, anon, authenticated;
grant  execute on function public.complete_production_job(uuid, boolean, text, numeric) to service_role;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.current_org_id()    to authenticated, service_role;
grant execute on function private.current_user_role() to authenticated, service_role;
grant execute on function private.is_manager()        to authenticated, service_role;
grant execute on function private.is_crm_admin()      to authenticated, service_role;
grant execute on function private.assert_episode_editable(uuid) to authenticated, service_role;

------------------------------------------------------------------------------
-- 8. Demandes envoyées depuis le site (lien ou fichier)
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('translation-uploads', 'translation-uploads', false, 52428800,
        array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/3gpp',
              'video/x-msvideo', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg'])
on conflict (id) do nothing;

create function private.recent_public_uploads()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from storage.objects o
  where o.bucket_id = 'translation-uploads' and o.created_at > now() - interval '1 hour';
$$;
-- Le dépôt anonyme vérifie ce compteur : anon doit pouvoir appeler cette seule fonction privée.
grant usage on schema private to anon;
grant execute on function private.recent_public_uploads() to anon, authenticated;

create policy "site : déposer une vidéo à traduire" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'translation-uploads'
    and (storage.foldername(name))[1] = 'incoming'
    and (select private.recent_public_uploads()) < 20
  );
create policy "admins CRM : lire les vidéos déposées" on storage.objects
  for select to authenticated
  using (bucket_id = 'translation-uploads' and (select private.is_crm_admin()));
create policy "admins CRM : supprimer les vidéos déposées" on storage.objects
  for delete to authenticated
  using (bucket_id = 'translation-uploads' and (select private.is_crm_admin()));

create table public.translation_requests (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.crm_leads (id) on delete cascade,
  video_url        text check (video_url is null or (video_url ~ '^https?://' and length(video_url) <= 500)),
  storage_path     text check (storage_path is null or length(storage_path) <= 500),
  file_name        text check (file_name is null or length(file_name) <= 200),
  source_language  text references public.languages (code),
  target_languages text[] not null check (cardinality(target_languages) between 1 and 13),
  output           text not null check (output in ('subtitles', 'dubbing', 'both')),
  rights_confirmed boolean not null check (rights_confirmed),
  status           text not null default 'new' check (status in ('new', 'quoted', 'accepted', 'done', 'rejected')),
  created_at       timestamptz not null default now(),
  check (video_url is not null or storage_path is not null)
);
create index translation_requests_lead_id_idx on public.translation_requests (lead_id, created_at desc);
create index translation_requests_source_language_idx on public.translation_requests (source_language);

alter table public.translation_requests enable row level security;
create policy "admins CRM : lire" on public.translation_requests
  for select to authenticated using ((select private.is_crm_admin()));
create policy "admins CRM : modifier" on public.translation_requests
  for update to authenticated
  using ((select private.is_crm_admin())) with check ((select private.is_crm_admin()));
create policy "admins CRM : supprimer" on public.translation_requests
  for delete to authenticated using ((select private.is_crm_admin()));
revoke all on public.translation_requests from anon;
revoke insert on public.translation_requests from authenticated;
revoke update on public.translation_requests from authenticated;
grant update (status) on public.translation_requests to authenticated;

create function public.submit_translation_request(
  p_org_name         text,
  p_contact_name     text,
  p_phone            text,
  p_email            text,
  p_segment          text,
  p_video_url        text,
  p_storage_path     text,
  p_file_name        text,
  p_source_language  text,
  p_target_languages text[],
  p_output           text,
  p_rights_confirmed boolean,
  p_message          text default null,
  p_website          text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone   text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_url     text := nullif(btrim(coalesce(p_video_url, '')), '');
  v_path    text := nullif(btrim(coalesce(p_storage_path, '')), '');
  v_targets text[];
  v_lead_id uuid;
  v_note    text;
begin
  if coalesce(p_website, '') <> '' then
    return;
  end if;
  if v_phone is null and v_email is null then
    raise exception 'Indiquez un téléphone ou un e-mail' using errcode = '22023';
  end if;
  if not coalesce(p_rights_confirmed, false) then
    raise exception 'Confirmez que vous avez le droit de faire traduire cette vidéo' using errcode = '22023';
  end if;
  if v_url is null and v_path is null then
    raise exception 'Ajoutez un lien ou un fichier vidéo' using errcode = '22023';
  end if;
  if v_url is not null and v_url !~ '^https?://' then
    raise exception 'Le lien doit commencer par http:// ou https://' using errcode = '22023';
  end if;
  if v_path is not null and not exists (
    select 1 from storage.objects o where o.bucket_id = 'translation-uploads' and o.name = v_path
  ) then
    raise exception 'Fichier introuvable : renvoyez-le' using errcode = '22023';
  end if;
  select array_agg(distinct l.code order by l.code) into v_targets
  from public.languages l where l.code = any (coalesce(p_target_languages, '{}'));
  if v_targets is null then
    raise exception 'Choisissez au moins une langue' using errcode = '22023';
  end if;
  if (select count(*) from public.translation_requests where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de demandes, réessayez plus tard' using errcode = '54000';
  end if;

  select l.id into v_lead_id from public.crm_leads l
  where (l.phone = v_phone or l.email = v_email)
  order by l.created_at desc limit 1;

  if v_lead_id is null then
    v_note := nullif(concat_ws(E'\n',
      case when nullif(btrim(coalesce(p_segment, '')), '') is not null then 'Type : ' || btrim(p_segment) end,
      nullif(btrim(coalesce(p_message, '')), '')), '');
    insert into public.crm_leads (center_name, contact_name, phone, email, message, source)
    values (btrim(p_org_name), btrim(p_contact_name), v_phone, v_email, left(v_note, 2000), 'landing')
    returning id into v_lead_id;
  end if;

  insert into public.translation_requests
    (lead_id, video_url, storage_path, file_name, source_language, target_languages, output, rights_confirmed)
  values
    (v_lead_id, v_url, v_path, left(nullif(btrim(coalesce(p_file_name, '')), ''), 200),
     (select l.code from public.languages l where l.code = p_source_language),
     v_targets, p_output, true);
end;
$$;
revoke execute on function public.submit_translation_request(text, text, text, text, text, text, text, text, text, text[], text, boolean, text, text) from public;
grant execute on function public.submit_translation_request(text, text, text, text, text, text, text, text, text, text[], text, boolean, text, text) to anon, authenticated;
