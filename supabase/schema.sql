-- DayRoute Supabase schema
-- Run this in Supabase SQL Editor after creating a project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fixed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday text not null check (weekday in ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  title text not null,
  starts_at_minutes integer not null check (starts_at_minutes >= 0 and starts_at_minutes < 1440),
  duration_minutes integer not null check (duration_minutes > 0),
  location text not null default 'No location set',
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday text not null check (weekday in ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  title text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  deadline text not null default 'Flexible',
  location text not null default 'No location set',
  priority text not null check (priority in ('High', 'Medium', 'Low')),
  complete boolean not null default false,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'outlook_calendar', 'canvas')),
  provider_user_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'outlook_calendar', 'canvas')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.fixed_events enable row level security;
alter table public.tasks enable row level security;
alter table public.oauth_connections enable row level security;
alter table public.oauth_states enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can read own fixed events"
  on public.fixed_events for select
  using (auth.uid() = user_id);

create policy "Users can insert own fixed events"
  on public.fixed_events for insert
  with check (auth.uid() = user_id);

create policy "Users can update own fixed events"
  on public.fixed_events for update
  using (auth.uid() = user_id);

create policy "Users can delete own fixed events"
  on public.fixed_events for delete
  using (auth.uid() = user_id);

create policy "Users can read own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tasks"
  on public.tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);

create policy "Users can read own oauth connections"
  on public.oauth_connections for select
  using (auth.uid() = user_id);

-- Inserts/updates for oauth_connections should happen from Edge Functions using the service role key.
-- oauth_states should only be read/written by Edge Functions using the service role key.

create index if not exists fixed_events_user_weekday_idx on public.fixed_events (user_id, weekday, starts_at_minutes);
create index if not exists tasks_user_weekday_idx on public.tasks (user_id, weekday, complete, priority);
create unique index if not exists fixed_events_external_unique_idx
  on public.fixed_events (user_id, source, external_id)
  where external_id is not null;
create unique index if not exists tasks_external_unique_idx
  on public.tasks (user_id, source, external_id)
  where external_id is not null;
create index if not exists oauth_states_expires_at_idx on public.oauth_states (expires_at);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.fixed_events to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.oauth_connections to authenticated;
