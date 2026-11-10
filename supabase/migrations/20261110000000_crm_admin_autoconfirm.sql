-- Les comptes dont l'e-mail est déjà autorisé (crm_admins) sont activés dès leur création,
-- sans e-mail de confirmation. Les autres inscriptions suivent la règle normale de Supabase.
create function private.autoconfirm_crm_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null
     and exists (select 1 from public.crm_admins a where a.email = lower(new.email)) then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.autoconfirm_crm_admin() from public, anon, authenticated;

create trigger crm_admin_autoconfirm
  before insert on auth.users
  for each row execute function private.autoconfirm_crm_admin();

-- Premier administrateur de l'équipe Professa-M
insert into public.crm_admins (email) values ('motaricky243@gmail.com') on conflict (email) do nothing;
