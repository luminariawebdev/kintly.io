-- FamilyBoard schema
-- Run this in Supabase Dashboard → SQL Editor

-- Tables
create table if not exists public.groups (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  invite_code text unique not null,
  created_at  timestamptz default now()
);

create table if not exists public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  display_name text not null,
  color        text not null default 'coral',
  group_id     uuid references public.groups,
  created_at   timestamptz default now()
);

create table if not exists public.tasks (
  id          uuid default gen_random_uuid() primary key,
  group_id    uuid references public.groups not null,
  created_by  uuid references public.profiles not null,
  assigned_to uuid references public.profiles,
  title       text not null,
  completed   boolean default false,
  due_date    date,
  created_at  timestamptz default now()
);

create table if not exists public.events (
  id         uuid default gen_random_uuid() primary key,
  group_id   uuid references public.groups not null,
  created_by uuid references public.profiles not null,
  title      text not null,
  description text,
  date       date not null,
  start_time text,
  end_time   text,
  color      text default 'coral',
  created_at timestamptz default now()
);

create table if not exists public.notes (
  id         uuid default gen_random_uuid() primary key,
  group_id   uuid references public.groups not null,
  created_by uuid references public.profiles not null,
  content    text not null,
  pinned     boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.groups   enable row level security;
alter table public.profiles enable row level security;
alter table public.tasks    enable row level security;
alter table public.events   enable row level security;
alter table public.notes    enable row level security;

-- Groups policies
create policy "groups_select" on public.groups
  for select to authenticated using (true);

create policy "groups_insert" on public.groups
  for insert to authenticated with check (true);

-- Helper function to get current user's group_id without triggering RLS recursion
create or replace function public.my_group_id()
returns uuid language sql security definer stable
as $$
  select group_id from public.profiles where id = auth.uid()
$$;

-- Profiles policies
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid() or
    group_id = public.my_group_id()
  );

create policy "profiles_insert" on public.profiles
  for insert with check (id = auth.uid());

create policy "profiles_update" on public.profiles
  for update using (id = auth.uid());

-- Tasks policies (scoped to group)
create policy "tasks_select" on public.tasks
  for select using (group_id = (select group_id from public.profiles where id = auth.uid()));

create policy "tasks_insert" on public.tasks
  for insert with check (group_id = (select group_id from public.profiles where id = auth.uid()));

create policy "tasks_update" on public.tasks
  for update using (group_id = (select group_id from public.profiles where id = auth.uid()));

create policy "tasks_delete" on public.tasks
  for delete using (group_id = (select group_id from public.profiles where id = auth.uid()));

-- Events policies (scoped to group)
create policy "events_select" on public.events
  for select using (group_id = (select group_id from public.profiles where id = auth.uid()));

create policy "events_insert" on public.events
  for insert with check (group_id = (select group_id from public.profiles where id = auth.uid()));

create policy "events_delete" on public.events
  for delete using (group_id = (select group_id from public.profiles where id = auth.uid()));

-- Notes policies (scoped to group)
create policy "notes_select" on public.notes
  for select using (group_id = (select group_id from public.profiles where id = auth.uid()));

create policy "notes_insert" on public.notes
  for insert with check (group_id = (select group_id from public.profiles where id = auth.uid()));

create policy "notes_update" on public.notes
  for update using (group_id = (select group_id from public.profiles where id = auth.uid()));

create policy "notes_delete" on public.notes
  for delete using (group_id = (select group_id from public.profiles where id = auth.uid()));

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'color', 'coral')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
