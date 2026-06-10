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
  avatar       text,
  group_id     uuid references public.groups,
  created_at   timestamptz default now()
);

create table if not exists public.tasks (
  id                  uuid default gen_random_uuid() primary key,
  group_id            uuid references public.groups not null,
  created_by          uuid references public.profiles not null,
  assigned_to         uuid references public.profiles,
  note_id             uuid references public.notes on delete set null,
  title               text not null,
  description         text,
  completed           boolean default false,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason text,
  due_date            date,
  recurrence          jsonb,
  created_at          timestamptz default now()
);

-- Comments on bulletin board notes — anyone in the group can post.
create table if not exists public.note_comments (
  id         uuid default gen_random_uuid() primary key,
  note_id    uuid references public.notes on delete cascade not null,
  group_id   uuid references public.groups not null,
  created_by uuid references public.profiles not null,
  content    text not null,
  created_at timestamptz default now()
);
create index if not exists note_comments_note_idx on public.note_comments(note_id, created_at);
alter table public.note_comments enable row level security;
drop policy if exists "note_comments_select" on public.note_comments;
drop policy if exists "note_comments_insert" on public.note_comments;
drop policy if exists "note_comments_update" on public.note_comments;
drop policy if exists "note_comments_delete" on public.note_comments;
create policy "note_comments_select" on public.note_comments
  for select using (group_id = public.my_group_id());
create policy "note_comments_insert" on public.note_comments
  for insert with check (group_id = public.my_group_id() and created_by = auth.uid());
create policy "note_comments_update" on public.note_comments
  for update using (created_by = auth.uid());
create policy "note_comments_delete" on public.note_comments
  for delete using (created_by = auth.uid());

create table if not exists public.events (
  id         uuid default gen_random_uuid() primary key,
  group_id   uuid references public.groups not null,
  created_by uuid references public.profiles not null,
  title      text not null,
  description text,
  location   text,
  date       date not null,
  start_time text,
  end_time   text,
  color      text default 'coral',
  attendees  uuid[] default '{}',
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.profiles on delete cascade not null,
  group_id   uuid references public.groups on delete cascade not null,
  type       text not null,
  payload    jsonb default '{}',
  read       boolean default false,
  created_at timestamptz default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications_insert" on public.notifications
  for insert with check (group_id = public.my_group_id());

create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid());

create policy "notifications_delete" on public.notifications
  for delete using (user_id = auth.uid());

create table if not exists public.notes (
  id         uuid default gen_random_uuid() primary key,
  group_id   uuid references public.groups not null,
  created_by uuid references public.profiles not null,
  content    text not null,
  pinned     boolean default false,
  type       text default 'message',
  payload    jsonb default '{}',
  created_at timestamptz default now()
);
-- If upgrading from an older schema, run these:
alter table public.notes add column if not exists type    text default 'message';
alter table public.notes add column if not exists payload jsonb default '{}';
-- The notes.content column needs to allow empty strings (for photos/polls):
alter table public.notes alter column content drop not null;

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

-- ─── Shared Lists ─────────────────────────────────────────────────────────────
-- Collaborative lists: groceries, packing, school supplies, hardware, etc.
-- Each list belongs to a group. Items are checkable, assignable to a family
-- member, and re-orderable. `list_type` is just a hint for the UI icon — the
-- mechanics are the same for every kind. `event_id` makes lists linkable to
-- events for future use (the frontend writes null today).
create table if not exists public.shared_lists (
  id          uuid default gen_random_uuid() primary key,
  group_id    uuid references public.groups not null,
  created_by  uuid references public.profiles not null,
  title       text not null,
  color       text default 'coral',
  list_type   text default 'general',
  event_id    uuid references public.events on delete set null,
  archived_at timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists shared_lists_group_idx
  on public.shared_lists (group_id, created_at desc);

create table if not exists public.shared_list_items (
  id           uuid default gen_random_uuid() primary key,
  list_id      uuid references public.shared_lists on delete cascade not null,
  group_id     uuid references public.groups not null,
  created_by   uuid references public.profiles not null,
  title        text not null,
  quantity     text,
  category     text,
  assigned_to  uuid references public.profiles,
  completed    boolean default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles,
  position     int default 0,
  created_at   timestamptz default now()
);
create index if not exists shared_list_items_list_idx
  on public.shared_list_items (list_id, position);

-- Activity history — short ledger of who did what. Kept simple: action is a
-- string ('list_created' | 'item_added' | 'item_completed' | 'item_removed'
-- | 'list_renamed' | 'list_deleted'), payload is free-form jsonb (item
-- titles, qty, etc.). Realtime INSERTs feed the "Recent activity" stream.
create table if not exists public.shared_list_activity (
  id         uuid default gen_random_uuid() primary key,
  list_id    uuid references public.shared_lists on delete cascade not null,
  group_id   uuid references public.groups not null,
  actor_id   uuid references public.profiles not null,
  action     text not null,
  payload    jsonb,
  created_at timestamptz default now()
);
create index if not exists shared_list_activity_list_idx
  on public.shared_list_activity (list_id, created_at desc);

alter table public.shared_lists         enable row level security;
alter table public.shared_list_items    enable row level security;
alter table public.shared_list_activity enable row level security;

-- shared_lists policies (group-scoped — same pattern as tasks/events)
drop policy if exists "shared_lists_select" on public.shared_lists;
create policy "shared_lists_select" on public.shared_lists
  for select using (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "shared_lists_insert" on public.shared_lists;
create policy "shared_lists_insert" on public.shared_lists
  for insert with check (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "shared_lists_update" on public.shared_lists;
create policy "shared_lists_update" on public.shared_lists
  for update using (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "shared_lists_delete" on public.shared_lists;
create policy "shared_lists_delete" on public.shared_lists
  for delete using (group_id = (select group_id from public.profiles where id = auth.uid()));

-- shared_list_items policies
drop policy if exists "shared_list_items_select" on public.shared_list_items;
create policy "shared_list_items_select" on public.shared_list_items
  for select using (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "shared_list_items_insert" on public.shared_list_items;
create policy "shared_list_items_insert" on public.shared_list_items
  for insert with check (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "shared_list_items_update" on public.shared_list_items;
create policy "shared_list_items_update" on public.shared_list_items
  for update using (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "shared_list_items_delete" on public.shared_list_items;
create policy "shared_list_items_delete" on public.shared_list_items
  for delete using (group_id = (select group_id from public.profiles where id = auth.uid()));

-- shared_list_activity policies (insert + select only; immutable ledger)
drop policy if exists "shared_list_activity_select" on public.shared_list_activity;
create policy "shared_list_activity_select" on public.shared_list_activity
  for select using (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "shared_list_activity_insert" on public.shared_list_activity;
create policy "shared_list_activity_insert" on public.shared_list_activity
  for insert with check (group_id = (select group_id from public.profiles where id = auth.uid()));

-- ─── Spaces ───────────────────────────────────────────────────────────────────
-- A Space is a lightweight organizational container for a family topic
-- ("Italy Trip", "Garden", "Christmas"). Tasks, events, notes, and shared
-- lists can each optionally reference a space via space_id. Deleting a space
-- nulls those references rather than cascading — you don't lose the packing
-- list when you delete the trip. Archive via archived_at for soft-delete.
create table if not exists public.spaces (
  id          uuid default gen_random_uuid() primary key,
  group_id    uuid references public.groups not null,
  created_by  uuid references public.profiles not null,
  title       text not null,
  emoji       text default '✨',
  color       text default 'coral',
  description text,
  member_ids  uuid[] default '{}',
  pinned_at   timestamptz,
  archived_at timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists spaces_group_idx
  on public.spaces (group_id, created_at desc);

alter table public.spaces enable row level security;

drop policy if exists "spaces_select" on public.spaces;
create policy "spaces_select" on public.spaces
  for select using (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "spaces_insert" on public.spaces;
create policy "spaces_insert" on public.spaces
  for insert with check (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "spaces_update" on public.spaces;
create policy "spaces_update" on public.spaces
  for update using (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "spaces_delete" on public.spaces;
create policy "spaces_delete" on public.spaces
  for delete using (group_id = (select group_id from public.profiles where id = auth.uid()));

-- Cross-cutting space_id columns. Nullable, so existing rows are unaffected.
-- ON DELETE SET NULL keeps items intact when a space is hard-deleted.
alter table public.tasks        add column if not exists space_id uuid references public.spaces on delete set null;
alter table public.events       add column if not exists space_id uuid references public.spaces on delete set null;
alter table public.notes        add column if not exists space_id uuid references public.spaces on delete set null;
alter table public.shared_lists add column if not exists space_id uuid references public.spaces on delete set null;

create index if not exists tasks_space_idx        on public.tasks (space_id);
create index if not exists events_space_idx       on public.events (space_id);
create index if not exists notes_space_idx        on public.notes (space_id);
create index if not exists shared_lists_space_idx on public.shared_lists (space_id);

-- ─── Space items (built-in checklist) ──────────────────────────────────────
-- Folded the old standalone "Lists" feature into Spaces. Every Space can
-- carry a flat checklist of items (the simple "Groceries with milk @mom"
-- use case) right alongside its tagged tasks/events/notes. Shape mirrors
-- shared_list_items; items cascade-delete with the parent space.
create table if not exists public.space_items (
  id           uuid default gen_random_uuid() primary key,
  space_id     uuid references public.spaces on delete cascade not null,
  group_id     uuid references public.groups not null,
  created_by   uuid references public.profiles not null,
  title        text not null,
  quantity     text,
  category     text,
  assigned_to  uuid references public.profiles,
  completed    boolean default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles,
  position     int default 0,
  created_at   timestamptz default now()
);
create index if not exists space_items_space_idx
  on public.space_items (space_id, position);

alter table public.space_items enable row level security;
drop policy if exists "space_items_select" on public.space_items;
create policy "space_items_select" on public.space_items
  for select using (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "space_items_insert" on public.space_items;
create policy "space_items_insert" on public.space_items
  for insert with check (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "space_items_update" on public.space_items;
create policy "space_items_update" on public.space_items
  for update using (group_id = (select group_id from public.profiles where id = auth.uid()));
drop policy if exists "space_items_delete" on public.space_items;
create policy "space_items_delete" on public.space_items
  for delete using (group_id = (select group_id from public.profiles where id = auth.uid()));

-- ─── Personal todos ─────────────────────────────────────────────────────────
-- A task can be flagged is_private=true so it's only visible to the creator.
-- Other group members never see private rows even though the table is
-- group-scoped. Default false keeps existing tasks shared.
alter table public.tasks add column if not exists is_private boolean default false;
create index if not exists tasks_is_private_idx on public.tasks (is_private);

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (
    group_id = (select group_id from public.profiles where id = auth.uid())
    and (is_private is not true or created_by = auth.uid())
  );

-- ─── Personal events ───────────────────────────────────────────────────────
-- Mirrors the personal-todos pattern on tasks. is_private=true rows are
-- only visible to their creator even though the table is group-scoped.
alter table public.events add column if not exists is_private boolean default false;
create index if not exists events_is_private_idx on public.events (is_private);

drop policy if exists "events_select" on public.events;
create policy "events_select" on public.events
  for select using (
    group_id = (select group_id from public.profiles where id = auth.uid())
    and (is_private is not true or created_by = auth.uid())
  );
