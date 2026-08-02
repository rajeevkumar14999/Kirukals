-- ---------------------------------------------------------------------------
-- Whoever sets up the install administers it.
--
-- This is the rule the app has always followed on a single machine: the first
-- account created is the administrator. Moving accounts to a server should not
-- quietly change that, so the same rule applies to the first account in the
-- database — and to the earliest one already there, if nobody has the role yet.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare first_account boolean;
begin
  select not exists (select 1 from public.profiles) into first_account;

  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when first_account then 'admin' else 'writer' end
  );
  return new;
end;
$$;

-- Accounts made before this rule existed: the earliest one takes the role,
-- unless somebody already has it. Running from the SQL editor means auth.uid()
-- is null, so the trigger that guards the role column allows this.
update public.profiles
set role = 'admin'
where id = (select id from public.profiles order by created_at asc limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');
