-- ---------------------------------------------------------------------------
-- A writer must not be able to make themselves an administrator.
--
-- The "update own profile" policy lets someone change their own row, which is
-- right for a display name and quite wrong for the role column: any signed-in
-- user could have promoted themselves with a single API call. Row-level
-- security cannot restrict a policy to particular columns, so the rule is
-- enforced by a trigger instead.
--
-- auth.uid() is null when a statement is run from the SQL editor or by a
-- server key, which is exactly when changing a role is legitimate.
-- ---------------------------------------------------------------------------

create or replace function public.protect_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'A role can only be changed by an administrator.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_role();
