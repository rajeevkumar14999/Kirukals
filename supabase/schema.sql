-- ---------------------------------------------------------------------------
-- Kirukals — database schema
--
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- The shape follows what the app already stores. A script is a single JSON
-- document, exactly as it is today, so nothing about the editor changes; what
-- changes is where that document lives. Everything is protected by row-level
-- security, which is enforced by Postgres rather than by the app — a client
-- that asks for someone else's script is refused by the database, not by a
-- check that a determined person could edit out.
-- ---------------------------------------------------------------------------

-- ------------------------------ profiles ----------------------------------
-- Supabase owns the account itself (auth.users). This table holds what the
-- app shows: a display name, and whether the person administers this install.

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null default 'Writer',
  role        text not null default 'writer' check (role in ('writer', 'admin')),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"   on public.profiles for select using (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"   on public.profiles for update using (auth.uid() = id);

-- A profile is created the moment an account is, so the app never meets a
-- signed-in user it knows nothing about.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------- scripts ----------------------------------
-- One row per script. `doc` is the document the editor already produces, so
-- the format is unchanged and a backup file can be pushed straight in.

create table if not exists public.scripts (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users on delete cascade,
  name        text not null default 'Untitled Screenplay',
  doc         jsonb not null,
  pages       int not null default 1,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists scripts_owner_updated
  on public.scripts (owner, updated_at desc);

alter table public.scripts enable row level security;

-- The whole of the app's document security, in four lines.
drop policy if exists "read own scripts" on public.scripts;
create policy "read own scripts"   on public.scripts for select using (auth.uid() = owner);
drop policy if exists "insert own scripts" on public.scripts;
create policy "insert own scripts"   on public.scripts for insert with check (auth.uid() = owner);
drop policy if exists "update own scripts" on public.scripts;
create policy "update own scripts"   on public.scripts for update using (auth.uid() = owner);
drop policy if exists "delete own scripts" on public.scripts;
create policy "delete own scripts"   on public.scripts for delete using (auth.uid() = owner);

-- Last write wins, and the server decides what "last" means.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scripts_touch on public.scripts;
create trigger scripts_touch before update on public.scripts
  for each row execute function public.touch_updated_at();

-- ---------------------------- subscriptions -------------------------------
-- Deliberately readable by its owner and writable by nobody. Entitlement is
-- granted by the payment webhook running with the service key, which the
-- browser never sees. This is the piece that makes the ₹99 and ₹499 plans
-- real rather than a check inside a file on the customer's machine.

create table if not exists public.subscriptions (
  user_id       uuid not null references auth.users on delete cascade,
  plan          text not null check (plan in ('pro-monthly', 'production-monthly')),
  status        text not null default 'none' check (status in ('none', 'pending', 'active', 'expired')),
  active_until  timestamptz,
  provider_ref  text,
  updated_at    timestamptz not null default now(),
  primary key (user_id, plan)
);

alter table public.subscriptions enable row level security;

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"   on public.subscriptions for select using (auth.uid() = user_id);
-- No insert or update policy on purpose: only the service key may write here.

-- What the app asks at startup: what am I entitled to, right now?
create or replace function public.my_entitlements()
returns table (plan text, status text, active_until timestamptz)
language sql stable security definer set search_path = public
as $$
  select s.plan,
         case when s.active_until > now() then 'active' else s.status end as status,
         s.active_until
  from public.subscriptions s
  where s.user_id = auth.uid();
$$;

-- ------------------------------ trial time --------------------------------
-- Ten minutes per account, counted on the server so that signing out, using a
-- second browser or reinstalling does not hand out another ten.

create table if not exists public.trials (
  user_id     uuid primary key references auth.users on delete cascade,
  used_ms     bigint not null default 0,
  started_at  timestamptz not null default now()
);

alter table public.trials enable row level security;
drop policy if exists "read own trial" on public.trials;
create policy "read own trial"   on public.trials for select using (auth.uid() = user_id);

create or replace function public.spend_trial(delta_ms bigint)
returns bigint language plpgsql security definer set search_path = public
as $$
declare total bigint;
begin
  insert into public.trials (user_id, used_ms)
  values (auth.uid(), greatest(0, delta_ms))
  on conflict (user_id)
    do update set used_ms = public.trials.used_ms + greatest(0, delta_ms)
  returning used_ms into total;

  -- Ten minutes, in milliseconds.
  return greatest(0, 600000 - total);
end;
$$;
