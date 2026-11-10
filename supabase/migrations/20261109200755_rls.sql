alter table public.organizations       enable row level security;
alter table public.profiles            enable row level security;
alter table public.courses             enable row level security;
alter table public.modules             enable row level security;
alter table public.episodes            enable row level security;
alter table public.script_versions     enable row level security;
alter table public.characters          enable row level security;
alter table public.settings            enable row level security;
alter table public.scenes              enable row level security;
alter table public.scene_characters    enable row level security;
alter table public.dialogue_lines      enable row level security;
alter table public.language_points     enable row level security;
alter table public.exercises           enable row level security;
alter table public.assets              enable row level security;
alter table public.plans               enable row level security;
alter table public.payments            enable row level security;
alter table public.production_jobs     enable row level security;
alter table public.credit_transactions enable row level security;

create policy "membres : voir son centre" on public.organizations
  for select to authenticated
  using (id = (select private.current_org_id()));

create policy "responsable : modifier son centre" on public.organizations
  for update to authenticated
  using (id = (select private.current_org_id()) and (select private.is_manager()))
  with check (id = (select private.current_org_id()));

create policy "membres : voir les profils du centre" on public.profiles
  for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "modifier son profil ou, si responsable, ceux du centre" on public.profiles
  for update to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (id = (select auth.uid()) or (select private.is_manager()))
  )
  with check (organization_id = (select private.current_org_id()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'courses', 'modules', 'episodes', 'characters', 'settings', 'scenes',
    'scene_characters', 'dialogue_lines', 'language_points', 'exercises', 'assets'
  ] loop
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
    if t in ('courses', 'modules', 'episodes') then
      execute format(
        'create policy "responsable : supprimer" on public.%I for delete to authenticated
           using (organization_id = (select private.current_org_id()) and (select private.is_manager()))', t);
    else
      execute format(
        'create policy "membres : supprimer" on public.%I for delete to authenticated
           using (organization_id = (select private.current_org_id()))', t);
    end if;
  end loop;
end;
$$;

create policy "membres : lire" on public.script_versions
  for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "membres : lire" on public.production_jobs
  for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "membres : lire" on public.credit_transactions
  for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "responsable : lire les paiements" on public.payments
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_manager()));

create policy "tous : lire les offres actives" on public.plans
  for select to authenticated
  using (is_active);

revoke all on all tables in schema public from anon;

revoke insert, update, delete on
  public.script_versions, public.production_jobs, public.credit_transactions,
  public.payments, public.plans
from authenticated;

revoke insert, update, delete on public.organizations from authenticated;
grant update (name, billing_name, billing_email, billing_phone, billing_address, tax_id)
  on public.organizations to authenticated;

revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, role) on public.profiles to authenticated;

revoke insert, update on public.episodes from authenticated;
grant insert (id, organization_id, module_id, title, situation, target_duration_minutes, position)
  on public.episodes to authenticated;
grant update (module_id, title, situation, target_duration_minutes, position)
  on public.episodes to authenticated;
