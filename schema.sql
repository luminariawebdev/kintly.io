-- Kinnekt schema
-- Run this in Supabase Dashboard → SQL Editor.
--
-- The whole file is idempotent and ordered by dependency, so it can be
-- run top-to-bottom on a FRESH database or re-run safely on an existing
-- one (create table if not exists / drop policy if exists / create or
-- replace function / add column if not exists throughout).

-- ─── Core tables (dependency order: groups → profiles → notes → tasks) ──────

create table if not exists public.groups (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  invite_code text unique not null,
  created_at  timestamptz default now()
);

create table if not exists public.profiles (
  id               uuid references auth.users on delete cascade primary key,
  display_name     text not null,
  color            text not null default 'coral',
  avatar           text,
  group_id         uuid references public.groups,
  -- false until the member finishes the post-group setup prompt (name,
  -- color, avatar). The app routes group members with this still false
  -- into that prompt; existing members are backfilled to true below so
  -- they're never re-prompted.
  profile_complete boolean default false,
  created_at       timestamptz default now()
);
alter table public.profiles add column if not exists avatar           text;
alter table public.profiles add column if not exists profile_complete boolean default false;
-- Existing members already personalized their profile — mark them done.
update public.profiles set profile_complete = true where profile_complete is not true;

-- Helper to get the current user's group_id without RLS recursion.
-- Defined before any policy that uses it.
create or replace function public.my_group_id()
returns uuid language sql security definer stable
as $$
  select group_id from public.profiles where id = auth.uid()
$$;

-- notes must exist before tasks (tasks.note_id references it).
create table if not exists public.notes (
  id         uuid default gen_random_uuid() primary key,
  group_id   uuid references public.groups not null,
  created_by uuid references public.profiles not null,
  content    text,
  pinned     boolean default false,
  type       text default 'message',
  payload    jsonb default '{}',
  created_at timestamptz default now()
);
alter table public.notes add column if not exists type    text default 'message';
alter table public.notes add column if not exists payload jsonb default '{}';
-- content must allow empty strings (photos / polls / soft-deleted posts)
alter table public.notes alter column content drop not null;

create table if not exists public.events (
  id          uuid default gen_random_uuid() primary key,
  group_id    uuid references public.groups not null,
  created_by  uuid references public.profiles not null,
  title       text not null,
  description text,
  location    text,
  date        date not null,
  end_date    date,
  start_time  text,
  end_time    text,
  color       text default 'coral',
  attendees   uuid[] default '{}',
  recurrence  jsonb,
  rsvps       jsonb default '{}',
  note_id     uuid references public.notes on delete set null,
  is_private  boolean default false,
  created_at  timestamptz default now()
);
-- Upgrades for databases created from the older schema. is_private is
-- added here (not just at the bottom) because the SELECT policy below
-- references it.
alter table public.events add column if not exists is_private boolean default false;
alter table public.events add column if not exists description text;
alter table public.events add column if not exists location    text;
alter table public.events add column if not exists attendees   uuid[] default '{}';
alter table public.events add column if not exists recurrence  jsonb;
alter table public.events add column if not exists rsvps       jsonb default '{}';
alter table public.events add column if not exists note_id     uuid references public.notes on delete set null;
alter table public.events add column if not exists end_date    date;

create table if not exists public.tasks (
  id                  uuid default gen_random_uuid() primary key,
  group_id            uuid references public.groups not null,
  created_by          uuid references public.profiles not null,
  assigned_to         uuid references public.profiles,
  note_id             uuid references public.notes on delete set null,
  event_id            uuid references public.events on delete cascade,
  title               text not null,
  description         text,
  completed           boolean default false,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason text,
  due_date            date,
  due_time            text,
  recurrence          jsonb,
  is_private          boolean default false,
  created_at          timestamptz default now()
);
alter table public.tasks add column if not exists is_private          boolean default false;
alter table public.tasks add column if not exists note_id             uuid references public.notes on delete set null;
alter table public.tasks add column if not exists event_id            uuid references public.events on delete cascade;
alter table public.tasks add column if not exists description         text;
alter table public.tasks add column if not exists completed_at        timestamptz;
alter table public.tasks add column if not exists cancelled_at        timestamptz;
alter table public.tasks add column if not exists cancellation_reason text;
alter table public.tasks add column if not exists recurrence          jsonb;
alter table public.tasks add column if not exists due_time            text;
-- Hand off: a task being passed to a specific person carries a pending offer
-- (baton_offer) until they accept (becoming the assignee) or decline. The
-- holder is just assigned_to; accept/decline goes through respond_baton.
alter table public.tasks add column if not exists baton_offer         uuid references public.profiles;
-- Dropped back to the pool: who let it go (pool_by) and why (pool_reason),
-- shown in the task detail while it's unassigned. Cleared when reclaimed.
alter table public.tasks add column if not exists pool_reason         text;
alter table public.tasks add column if not exists pool_by             uuid references public.profiles;

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

-- Comments on bulletin board notes (legacy table — replies now live in
-- notes.payload.reply_to, but the table is kept for older data).
create table if not exists public.note_comments (
  id         uuid default gen_random_uuid() primary key,
  note_id    uuid references public.notes on delete cascade not null,
  group_id   uuid references public.groups not null,
  created_by uuid references public.profiles not null,
  content    text not null,
  created_at timestamptz default now()
);
create index if not exists note_comments_note_idx on public.note_comments(note_id, created_at);

-- ─── Row-level security ──────────────────────────────────────────────────────

alter table public.groups        enable row level security;
alter table public.profiles      enable row level security;
alter table public.tasks         enable row level security;
alter table public.events        enable row level security;
alter table public.notes         enable row level security;
alter table public.notifications enable row level security;
alter table public.note_comments enable row level security;

-- Groups
drop policy if exists "groups_select" on public.groups;
create policy "groups_select" on public.groups
  for select to authenticated using (true);
drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert" on public.groups
  for insert to authenticated with check (true);

-- Profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid() or
    group_id = public.my_group_id()
  );
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (id = auth.uid());
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (id = auth.uid());

-- Tasks. SELECT hides other members' private todos. UPDATE/DELETE are
-- restricted to the creator, the assignee, or anyone when unassigned —
-- previously these were group-wide, so "only the creator can edit" was
-- enforced in the UI only.
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (
    group_id = public.my_group_id()
    and (is_private is not true or created_by = auth.uid())
  );
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (group_id = public.my_group_id() and created_by = auth.uid());
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (
    group_id = public.my_group_id()
    and (created_by = auth.uid() or assigned_to = auth.uid() or assigned_to is null)
  );
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (
    group_id = public.my_group_id()
    and (created_by = auth.uid() or assigned_to = auth.uid() or assigned_to is null)
  );

-- Events. SELECT hides other members' private events. UPDATE stays
-- group-scoped because the legacy RSVP fallback writes the rsvps column
-- directly (the set_event_rsvp function below is the preferred path).
-- DELETE is creator-only.
drop policy if exists "events_select" on public.events;
create policy "events_select" on public.events
  for select using (
    group_id = public.my_group_id()
    and (is_private is not true or created_by = auth.uid())
  );
drop policy if exists "events_insert" on public.events;
create policy "events_insert" on public.events
  for insert with check (group_id = public.my_group_id() and created_by = auth.uid());
drop policy if exists "events_update" on public.events;
create policy "events_update" on public.events
  for update using (group_id = public.my_group_id());
drop policy if exists "events_delete" on public.events;
create policy "events_delete" on public.events
  for delete using (created_by = auth.uid());

-- Notes. UPDATE stays group-scoped: pinning is a shared curation action
-- and the poll-vote fallback writes payload directly. Hard DELETE is
-- creator-only (the app soft-deletes via UPDATE anyway).
drop policy if exists "notes_select" on public.notes;
create policy "notes_select" on public.notes
  for select using (group_id = public.my_group_id());
drop policy if exists "notes_insert" on public.notes;
create policy "notes_insert" on public.notes
  for insert with check (group_id = public.my_group_id() and created_by = auth.uid());
drop policy if exists "notes_update" on public.notes;
create policy "notes_update" on public.notes
  for update using (group_id = public.my_group_id());
drop policy if exists "notes_delete" on public.notes;
create policy "notes_delete" on public.notes
  for delete using (created_by = auth.uid());

-- Notifications
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid());
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert with check (group_id = public.my_group_id());
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid());
drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications
  for delete using (user_id = auth.uid());

-- Note comments (legacy)
drop policy if exists "note_comments_select" on public.note_comments;
create policy "note_comments_select" on public.note_comments
  for select using (group_id = public.my_group_id());
drop policy if exists "note_comments_insert" on public.note_comments;
create policy "note_comments_insert" on public.note_comments
  for insert with check (group_id = public.my_group_id() and created_by = auth.uid());
drop policy if exists "note_comments_update" on public.note_comments;
create policy "note_comments_update" on public.note_comments
  for update using (created_by = auth.uid());
drop policy if exists "note_comments_delete" on public.note_comments;
create policy "note_comments_delete" on public.note_comments
  for delete using (created_by = auth.uid());

-- ─── Auto-create profile on signup ───────────────────────────────────────────

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
-- (Feature currently dormant in the UI — superseded by Spaces — but the
-- tables stay so existing data survives and the feature can be revived.)

create table if not exists public.shared_lists (
  id          uuid default gen_random_uuid() primary key,
  group_id    uuid references public.groups not null,
  created_by  uuid references public.profiles not null,
  title       text not null,
  color       text default 'coral',
  list_type   text default 'general',
  member_ids  uuid[] default '{}',
  event_id    uuid references public.events on delete set null,
  archived_at timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.shared_lists add column if not exists member_ids uuid[] default '{}';
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

drop policy if exists "shared_lists_select" on public.shared_lists;
create policy "shared_lists_select" on public.shared_lists
  for select using (group_id = public.my_group_id());
drop policy if exists "shared_lists_insert" on public.shared_lists;
create policy "shared_lists_insert" on public.shared_lists
  for insert with check (group_id = public.my_group_id());
drop policy if exists "shared_lists_update" on public.shared_lists;
create policy "shared_lists_update" on public.shared_lists
  for update using (group_id = public.my_group_id());
drop policy if exists "shared_lists_delete" on public.shared_lists;
create policy "shared_lists_delete" on public.shared_lists
  for delete using (group_id = public.my_group_id());

drop policy if exists "shared_list_items_select" on public.shared_list_items;
create policy "shared_list_items_select" on public.shared_list_items
  for select using (group_id = public.my_group_id());
drop policy if exists "shared_list_items_insert" on public.shared_list_items;
create policy "shared_list_items_insert" on public.shared_list_items
  for insert with check (group_id = public.my_group_id());
drop policy if exists "shared_list_items_update" on public.shared_list_items;
create policy "shared_list_items_update" on public.shared_list_items
  for update using (group_id = public.my_group_id());
drop policy if exists "shared_list_items_delete" on public.shared_list_items;
create policy "shared_list_items_delete" on public.shared_list_items
  for delete using (group_id = public.my_group_id());

drop policy if exists "shared_list_activity_select" on public.shared_list_activity;
create policy "shared_list_activity_select" on public.shared_list_activity
  for select using (group_id = public.my_group_id());
drop policy if exists "shared_list_activity_insert" on public.shared_list_activity;
create policy "shared_list_activity_insert" on public.shared_list_activity
  for insert with check (group_id = public.my_group_id());

-- ─── Spaces ───────────────────────────────────────────────────────────────────

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
  for select using (group_id = public.my_group_id());
drop policy if exists "spaces_insert" on public.spaces;
create policy "spaces_insert" on public.spaces
  for insert with check (group_id = public.my_group_id());
drop policy if exists "spaces_update" on public.spaces;
create policy "spaces_update" on public.spaces
  for update using (group_id = public.my_group_id());
drop policy if exists "spaces_delete" on public.spaces;
create policy "spaces_delete" on public.spaces
  for delete using (group_id = public.my_group_id());

-- Cross-cutting space_id columns. ON DELETE SET NULL keeps items intact
-- when a space is deleted.
alter table public.tasks        add column if not exists space_id uuid references public.spaces on delete set null;
alter table public.events      add column if not exists space_id uuid references public.spaces on delete set null;
alter table public.notes        add column if not exists space_id uuid references public.spaces on delete set null;
alter table public.shared_lists add column if not exists space_id uuid references public.spaces on delete set null;

create index if not exists tasks_space_idx        on public.tasks (space_id);
create index if not exists events_space_idx       on public.events (space_id);
create index if not exists notes_space_idx        on public.notes (space_id);
create index if not exists shared_lists_space_idx on public.shared_lists (space_id);

-- Space items (built-in checklist per space)
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
  for select using (group_id = public.my_group_id());
drop policy if exists "space_items_insert" on public.space_items;
create policy "space_items_insert" on public.space_items
  for insert with check (group_id = public.my_group_id());
drop policy if exists "space_items_update" on public.space_items;
create policy "space_items_update" on public.space_items
  for update using (group_id = public.my_group_id());
drop policy if exists "space_items_delete" on public.space_items;
create policy "space_items_delete" on public.space_items
  for delete using (group_id = public.my_group_id());

-- ─── Personal todos / events ─────────────────────────────────────────────────
-- is_private=true rows are only visible to their creator. The columns
-- are defined with the tables above (the SELECT policies reference
-- them); these are just the supporting indexes.

create index if not exists tasks_is_private_idx  on public.tasks (is_private);
create index if not exists events_is_private_idx on public.events (is_private);

-- ─── Atomic RSVP + poll voting ───────────────────────────────────────────────
-- Both RSVPs and poll votes live in jsonb columns. The app used to
-- read-modify-write the whole blob, so two members acting in the same
-- moment clobbered each other. These functions do the merge server-side
-- under a row lock, so concurrent writes serialize. The app calls them
-- via supabase.rpc() and falls back to the old direct update if they
-- don't exist yet.

create or replace function public.set_event_rsvp(p_event_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := auth.uid()::text;
  v_rsvps  jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_status is not null and p_status not in ('yes', 'maybe', 'no') then
    raise exception 'invalid rsvp status %', p_status;
  end if;

  update public.events
  set rsvps = case
    when p_status is null
      then coalesce(rsvps, '{}'::jsonb) - v_uid
    else coalesce(rsvps, '{}'::jsonb) || jsonb_build_object(v_uid, p_status)
  end
  where id = p_event_id
    and group_id = public.my_group_id()
    and (is_private is not true or created_by = auth.uid())
  returning rsvps into v_rsvps;

  return v_rsvps;
end;
$$;

create or replace function public.vote_on_poll(p_note_id uuid, p_option_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     text := auth.uid()::text;
  v_payload jsonb;
  v_votes   jsonb;
  v_key     text;
  v_had     boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Lock the row so concurrent votes queue instead of clobbering.
  select payload into v_payload
  from public.notes
  where id = p_note_id
    and group_id = public.my_group_id()
    and type = 'poll'
  for update;

  if v_payload is null then
    return null;
  end if;

  -- Ignore votes for options that don't exist on this poll.
  if not coalesce(v_payload->'options', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', p_option_id)) then
    return v_payload;
  end if;

  v_votes := coalesce(v_payload->'votes', '{}'::jsonb);
  -- Toggle-off semantics: voting for the option I'm already on clears my vote.
  v_had := coalesce(v_votes->p_option_id, '[]'::jsonb) @> to_jsonb(v_uid);

  -- Remove me from every option…
  for v_key in select jsonb_object_keys(v_votes) loop
    v_votes := jsonb_set(v_votes, array[v_key],
      coalesce((
        select jsonb_agg(e)
        from jsonb_array_elements(v_votes->v_key) e
        where e <> to_jsonb(v_uid)
      ), '[]'::jsonb));
  end loop;

  -- …then re-add to the chosen option unless this was a toggle-off.
  if not v_had then
    v_votes := jsonb_set(v_votes, array[p_option_id],
      coalesce(v_votes->p_option_id, '[]'::jsonb) || to_jsonb(v_uid));
  end if;

  v_payload := jsonb_set(v_payload, '{votes}', v_votes);
  update public.notes set payload = v_payload where id = p_note_id;
  return v_payload;
end;
$$;

-- Roll a recurring task forward to its next scheduled day. Runs as
-- definer so the *assignee* (not just the creator) can complete a chore
-- and have it reappear: the new row preserves the ORIGINAL created_by,
-- which the tasks_insert policy (created_by = auth.uid()) would otherwise
-- reject when someone other than the creator checks it off. The caller
-- must be allowed to act on the task (creator, assignee, or unassigned)
-- and be in the same group. p_next_due is computed client-side from the
-- recurrence rule. Returns the new row, or null if nothing was created
-- (not recurring, not permitted, or a duplicate already exists).
create or replace function public.respawn_recurring_task(p_task_id uuid, p_next_due date)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.tasks;
  v_new public.tasks;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_src
  from public.tasks
  where id = p_task_id
    and group_id = public.my_group_id()
    and (created_by = auth.uid() or assigned_to = auth.uid() or assigned_to is null);

  if v_src.id is null then
    return null;  -- not found or caller not permitted
  end if;

  -- Only recurring tasks respawn.
  if v_src.recurrence is null or coalesce(v_src.recurrence->>'freq', 'none') = 'none' then
    return null;
  end if;

  -- Guard against double-spawns (double-tap / re-fire): bail if an open
  -- occurrence for this series already sits on the target day.
  if exists (
    select 1 from public.tasks
    where group_id = v_src.group_id
      and title    = v_src.title
      and due_date = p_next_due
      and completed = false
      and recurrence is not null
      and coalesce(assigned_to::text, '') = coalesce(v_src.assigned_to::text, '')
  ) then
    return null;
  end if;

  insert into public.tasks
    (group_id, created_by, assigned_to, note_id, event_id, title,
     description, due_date, due_time, recurrence, is_private, space_id, completed)
  values
    (v_src.group_id, v_src.created_by, v_src.assigned_to, v_src.note_id,
     v_src.event_id, v_src.title, v_src.description, p_next_due,
     v_src.due_time, v_src.recurrence, v_src.is_private, v_src.space_id, false)
  returning * into v_new;

  return v_new;
end;
$$;

-- Hand off: accept or decline a task offered to you. Runs as definer because
-- the offeree is not yet the assignee/creator, so the tasks_update policy
-- would reject a direct write. Only the person it was offered to
-- (baton_offer = auth.uid()), within their group, may respond. Accept makes
-- them the assignee and clears the offer; decline just clears the offer.
create or replace function public.respond_baton(p_task_id uuid, p_accept boolean)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
    and group_id = public.my_group_id()
    and baton_offer = v_uid
  for update;

  if v_task.id is null then
    return null;  -- no offer for this user, or wrong group
  end if;

  if p_accept then
    update public.tasks
    set assigned_to = v_uid, baton_offer = null
    where id = p_task_id
    returning * into v_task;
  else
    update public.tasks
    set baton_offer = null
    where id = p_task_id
    returning * into v_task;
  end if;

  return v_task;
end;
$$;

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- postgres_changes only fires for tables in the supabase_realtime
-- publication. Without this block a fresh project gets silent no-op
-- realtime sync. duplicate_object = already added → skip.

do $$
declare t text;
begin
  foreach t in array array[
    'tasks', 'events', 'notes', 'notifications',
    'shared_lists', 'shared_list_items', 'shared_list_activity',
    'spaces', 'space_items'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
