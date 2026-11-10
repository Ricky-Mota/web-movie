create table public.courses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  title           text not null check (length(btrim(title)) > 0),
  description     text,
  audience        text not null default 'adults'
                  check (audience in ('adults', 'professionals', 'children')),
  sector          text,
  cefr_level      public.cefr_level not null,
  source_language text not null default 'fr' check (source_language ~ '^[a-z]{2,3}$'),
  target_language text not null default 'en' check (target_language ~ '^[a-z]{2,3}$'),
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id)
);
create index courses_organization_id_idx on public.courses (organization_id);

create table public.modules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  course_id       uuid not null,
  title           text not null check (length(btrim(title)) > 0),
  objectives      text[] not null default '{}',
  position        integer not null check (position >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id),
  unique (course_id, position) deferrable initially immediate,
  foreign key (course_id, organization_id)
    references public.courses (id, organization_id) on delete cascade
);
create index modules_organization_id_idx on public.modules (organization_id);

create table public.episodes (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null default private.current_org_id()
                          references public.organizations (id) on delete cascade,
  module_id               uuid not null,
  title                   text not null check (length(btrim(title)) > 0),
  situation               text,
  target_duration_minutes integer not null default 15 check (target_duration_minutes between 1 and 60),
  position                integer not null check (position >= 1),
  status                  public.episode_status not null default 'draft',
  status_changed_at       timestamptz not null default now(),
  approved_version_id     uuid,
  created_by              uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, organization_id),
  unique (module_id, position) deferrable initially immediate,
  foreign key (module_id, organization_id)
    references public.modules (id, organization_id) on delete cascade
);
create index episodes_organization_id_idx on public.episodes (organization_id);
create index episodes_status_idx on public.episodes (organization_id, status);

create table public.script_versions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  episode_id      uuid not null,
  version_number  integer not null check (version_number >= 1),
  content         jsonb not null,
  approved_by     uuid references public.profiles (id) on delete set null,
  approved_at     timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, episode_id),
  unique (episode_id, version_number),
  foreign key (episode_id, organization_id)
    references public.episodes (id, organization_id) on delete cascade
);
create index script_versions_organization_id_idx on public.script_versions (organization_id);

alter table public.episodes
  add constraint episodes_approved_version_fk
  foreign key (approved_version_id, id)
  references public.script_versions (id, episode_id);

create function private.forbid_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La table % est en lecture seule après insertion', tg_table_name
    using errcode = '42501';
end;
$$;

create trigger script_versions_immutable before update on public.script_versions
  for each row execute function private.forbid_update();

create table public.characters (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null default private.current_org_id()
                            references public.organizations (id) on delete cascade,
  name                      text not null check (length(btrim(name)) > 0),
  description               text,
  reference_image_asset_id  uuid,
  voice_provider            text,
  voice_id                  text,
  voice_speed               numeric(3, 2) not null default 1.00 check (voice_speed between 0.50 and 2.00),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (id, organization_id)
);
create index characters_organization_id_idx on public.characters (organization_id);

create table public.settings (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null default private.current_org_id()
                            references public.organizations (id) on delete cascade,
  name                      text not null check (length(btrim(name)) > 0),
  description               text,
  reference_image_asset_id  uuid,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (id, organization_id)
);
create index settings_organization_id_idx on public.settings (organization_id);

create table public.scenes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  episode_id      uuid not null,
  setting_id      uuid,
  title           text,
  position        integer not null check (position >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id),
  unique (episode_id, position) deferrable initially immediate,
  foreign key (episode_id, organization_id)
    references public.episodes (id, organization_id) on delete cascade,
  foreign key (setting_id, organization_id)
    references public.settings (id, organization_id) on delete set null (setting_id)
);
create index scenes_organization_id_idx on public.scenes (organization_id);
create index scenes_setting_id_idx on public.scenes (setting_id);

create table public.scene_characters (
  scene_id        uuid not null,
  character_id    uuid not null,
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  primary key (scene_id, character_id),
  foreign key (scene_id, organization_id)
    references public.scenes (id, organization_id) on delete cascade,
  foreign key (character_id, organization_id)
    references public.characters (id, organization_id) on delete cascade
);
create index scene_characters_organization_id_idx on public.scene_characters (organization_id);
create index scene_characters_character_id_idx on public.scene_characters (character_id);

create table public.dialogue_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  scene_id        uuid not null,
  character_id    uuid,
  text_en         text not null check (length(btrim(text_en)) > 0),
  translation     text,
  position        integer not null check (position >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id),
  unique (scene_id, position) deferrable initially immediate,
  foreign key (scene_id, organization_id)
    references public.scenes (id, organization_id) on delete cascade,
  foreign key (character_id, organization_id)
    references public.characters (id, organization_id) on delete set null (character_id)
);
create index dialogue_lines_organization_id_idx on public.dialogue_lines (organization_id);
create index dialogue_lines_character_id_idx on public.dialogue_lines (character_id);

create table public.language_points (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null default private.current_org_id()
                          references public.organizations (id) on delete cascade,
  course_id               uuid not null,
  kind                    text not null check (kind in ('vocabulary', 'grammar', 'expression')),
  term                    text not null check (length(btrim(term)) > 0),
  translation             text,
  explanation             text,
  introduced_in_episode_id uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  foreign key (course_id, organization_id)
    references public.courses (id, organization_id) on delete cascade,
  foreign key (introduced_in_episode_id, organization_id)
    references public.episodes (id, organization_id) on delete set null (introduced_in_episode_id)
);
create unique index language_points_unique_term_idx
  on public.language_points (course_id, kind, lower(btrim(term)));
create index language_points_organization_id_idx on public.language_points (organization_id);
create index language_points_episode_idx on public.language_points (introduced_in_episode_id);

create table public.exercises (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  episode_id      uuid not null,
  type            text not null
                  check (type in ('multiple_choice', 'fill_blank', 'matching', 'ordering', 'true_false', 'open')),
  question        text not null,
  choices         jsonb,
  answer          text,
  explanation     text,
  position        integer not null check (position >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (episode_id, position) deferrable initially immediate,
  foreign key (episode_id, organization_id)
    references public.episodes (id, organization_id) on delete cascade
);
create index exercises_organization_id_idx on public.exercises (organization_id);

create table public.assets (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null default private.current_org_id()
                    references public.organizations (id) on delete cascade,
  kind              public.asset_kind not null,
  storage_provider  text not null default 'r2',
  bucket            text not null,
  object_key        text not null,
  mime_type         text,
  size_bytes        bigint check (size_bytes >= 0),
  duration_seconds  numeric(10, 3) check (duration_seconds >= 0),
  generator_model   text,
  license           text,
  episode_id        uuid,
  scene_id          uuid,
  dialogue_line_id  uuid,
  character_id      uuid,
  setting_id        uuid,
  tts_text          text,
  tts_voice_id      text,
  tts_speed         numeric(3, 2),
  tts_key           text generated always as (
                      case when tts_text is not null and tts_voice_id is not null and tts_speed is not null
                           then md5(lower(btrim(tts_text)) || '|' || tts_voice_id || '|' || tts_speed::text)
                      end
                    ) stored,
  created_at        timestamptz not null default now(),
  unique (id, organization_id),
  unique (storage_provider, bucket, object_key),
  check (tts_text is null or kind = 'audio'),
  foreign key (episode_id, organization_id)
    references public.episodes (id, organization_id) on delete set null (episode_id),
  foreign key (scene_id, organization_id)
    references public.scenes (id, organization_id) on delete set null (scene_id),
  foreign key (dialogue_line_id, organization_id)
    references public.dialogue_lines (id, organization_id) on delete set null (dialogue_line_id),
  foreign key (character_id, organization_id)
    references public.characters (id, organization_id) on delete set null (character_id),
  foreign key (setting_id, organization_id)
    references public.settings (id, organization_id) on delete set null (setting_id)
);
create index assets_organization_id_idx on public.assets (organization_id);
create index assets_episode_id_idx on public.assets (episode_id);
create index assets_scene_id_idx on public.assets (scene_id);
create index assets_dialogue_line_id_idx on public.assets (dialogue_line_id);
create index assets_character_id_idx on public.assets (character_id);
create index assets_setting_id_idx on public.assets (setting_id);
create unique index assets_tts_reuse_idx on public.assets (organization_id, tts_key)
  where tts_key is not null;

alter table public.characters
  add foreign key (reference_image_asset_id, organization_id)
  references public.assets (id, organization_id) on delete set null (reference_image_asset_id);
alter table public.settings
  add foreign key (reference_image_asset_id, organization_id)
  references public.assets (id, organization_id) on delete set null (reference_image_asset_id);
create index characters_reference_image_idx on public.characters (reference_image_asset_id);
create index settings_reference_image_idx on public.settings (reference_image_asset_id);

create function private.assert_episode_editable(p_episode_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_status public.episode_status;
begin
  select e.status into v_status from public.episodes e where e.id = p_episode_id;
  if v_status is not null and v_status not in ('draft', 'script_review') then
    raise exception 'Script verrouillé : l''épisode est au statut « % ». Repassez-le en brouillon pour le modifier.', v_status
      using errcode = '42501';
  end if;
end;
$$;

create function private.lock_scenes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform private.assert_episode_editable(old.episode_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform private.assert_episode_editable(new.episode_id); end if;
  return coalesce(new, old);
end;
$$;

create function private.lock_by_scene()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_episode_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select s.episode_id into v_episode_id from public.scenes s where s.id = old.scene_id;
    perform private.assert_episode_editable(v_episode_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select s.episode_id into v_episode_id from public.scenes s where s.id = new.scene_id;
    perform private.assert_episode_editable(v_episode_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger scenes_lock before insert or update or delete on public.scenes
  for each row execute function private.lock_scenes();
create trigger scene_characters_lock before insert or update or delete on public.scene_characters
  for each row execute function private.lock_by_scene();
create trigger dialogue_lines_lock before insert or update or delete on public.dialogue_lines
  for each row execute function private.lock_by_scene();

create trigger courses_updated_at         before update on public.courses         for each row execute function private.set_updated_at();
create trigger modules_updated_at         before update on public.modules         for each row execute function private.set_updated_at();
create trigger episodes_updated_at        before update on public.episodes        for each row execute function private.set_updated_at();
create trigger characters_updated_at      before update on public.characters      for each row execute function private.set_updated_at();
create trigger settings_updated_at        before update on public.settings        for each row execute function private.set_updated_at();
create trigger scenes_updated_at          before update on public.scenes          for each row execute function private.set_updated_at();
create trigger dialogue_lines_updated_at  before update on public.dialogue_lines  for each row execute function private.set_updated_at();
create trigger language_points_updated_at before update on public.language_points for each row execute function private.set_updated_at();
create trigger exercises_updated_at       before update on public.exercises       for each row execute function private.set_updated_at();
