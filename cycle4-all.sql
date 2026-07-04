-- ════════════════════════════════════════════════════════════════════════════
-- Kinnekt — consolidated backend migration (audit Cycle 4).
-- Run this ONE file in the Supabase SQL editor. Safe to re-run (idempotent).
-- It SUPERSEDES cycle3-all.sql: it contains the final cycle-3 RPCs/policies PLUS
-- the new Cycle-4 security fixes, so you only need to run this file (whether or
-- not you already ran cycle3-all.sql).
--
-- Cycle-4 highlights:
--   • Spaces / Shared-Lists were the blind spot of earlier cycles — this brings
--     them up to the same RLS bar as tasks/events/notes:
--       - child items (space_items / shared_list_items / activity) must belong
--         to a parent that is in your group (no cross-group child injection);
--       - spaces / shared_lists / their items get the WITH CHECK on UPDATE that
--         tasks/events already have (no relocating a row into another group).
--   • notifications_update gets a WITH CHECK so you can't reassign your own
--     notification to another user's inbox.
--   • respawn_recurring_task no longer carries a private task into a shared
--     group, and rejects a forged/duplicate next-due date.
--   • handle_new_user logs (warns) instead of silently swallowing seed failures.
--   • vote_on_poll distinguishes "no such poll" from "poll with NULL payload".
-- ════════════════════════════════════════════════════════════════════════════

-- ─── RPCs (final versions) ───────────────────────────────────────────────────

-- Recurring respawn: row-locked (no double-spawn on double-complete); dedup
-- keyed on the SERIES (created_by/space_id/due_time), not assigned_to.
-- Cycle-4: (a) reject a client next-due that isn't strictly after the source's
-- due date (the date is client-computed, so a forged/duplicate date could
-- otherwise sidestep the dedup and multi-spawn a series); (b) never carry a
-- private task into a shared group's new occurrence (realtime ignores per-row
-- RLS, so a private row in a shared group would leak to co-members).
create or replace function public.respawn_recurring_task(p_task_id uuid, p_next_due date)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src   public.tasks;
  v_new   public.tasks;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_src
  from public.tasks
  where id = p_task_id
    and group_id = public.my_group_id()
    and (created_by = auth.uid() or assigned_to = auth.uid() or assigned_to is null)
  for update;

  if v_src.id is null then
    return null;
  end if;

  if v_src.recurrence is null or coalesce(v_src.recurrence->>'freq', 'none') = 'none' then
    return null;
  end if;

  -- The next-due is computed on the client; it must move the series forward.
  if p_next_due is null or v_src.due_date is null or p_next_due <= v_src.due_date then
    return null;
  end if;

  v_owner := case when coalesce(v_src.claimed, false) then v_src.recur_owner else v_src.assigned_to end;

  if exists (
    select 1 from public.tasks
    where group_id = v_src.group_id
      and title    = v_src.title
      and due_date = p_next_due
      and completed = false
      and recurrence is not null
      and created_by = v_src.created_by
      and coalesce(space_id::text, '') = coalesce(v_src.space_id::text, '')
      and coalesce(due_time, '')       = coalesce(v_src.due_time, '')
  ) then
    return null;
  end if;

  insert into public.tasks
    (group_id, created_by, assigned_to, note_id, event_id, title,
     description, due_date, due_time, recurrence, is_private, space_id, completed)
  values
    (v_src.group_id, v_src.created_by, v_owner, v_src.note_id,
     v_src.event_id, v_src.title, v_src.description, p_next_due,
     v_src.due_time, v_src.recurrence,
     -- keep private only if the target group is a personal space
     (v_src.is_private and exists (
        select 1 from public.groups g where g.id = v_src.group_id and coalesce(g.is_personal, false))),
     v_src.space_id, false)
  returning * into v_new;

  return v_new;
end;
$$;

-- Baton accept = ONE-TIME takeover (recurring reverts to the offerer next time);
-- non-recurring accepts clear any stale pickup state.
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
    return null;
  end if;

  if p_accept then
    update public.tasks
    set assigned_to = v_uid,
        baton_offer = null,
        recur_owner = case
          when recurrence is not null and coalesce(recurrence->>'freq', 'none') <> 'none'
          then coalesce(recur_owner, assigned_to)
          else null
        end,
        claimed = case
          when recurrence is not null and coalesce(recurrence->>'freq', 'none') <> 'none'
          then true
          else false
        end
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

-- Signup: seed the Personal space with an invite_code RETRY loop and never abort
-- signup on failure. Cycle-4: warn (don't silently swallow) so a genuine seed
-- fault is diagnosable in the logs, while signup still succeeds.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_personal uuid;
begin
  insert into public.profiles (id, display_name, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'color', 'coral')
  )
  on conflict (id) do nothing;

  begin
    if not exists (select 1 from public.groups g where g.is_personal and g.owner_id = new.id) then
      for i in 1..5 loop
        begin
          insert into public.groups (name, invite_code, is_personal, owner_id)
          values ('Personal', upper(substr(md5(random()::text || new.id::text || i::text), 1, 8)), true, new.id)
          returning id into v_personal;
          insert into public.group_members (group_id, user_id, role)
          values (v_personal, new.id, 'owner');
          exit;
        exception when unique_violation then
          -- code collided — loop and try a fresh one
        end;
      end loop;
    end if;
  exception when others then
    raise warning 'handle_new_user: personal-space seed failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Poll vote: write only the votes subtree (no clobber of a concurrent pin/edit).
-- Cycle-4: use FOUND (not "payload is null") so a poll whose payload column is
-- literally NULL isn't mistaken for "no such poll".
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

  select payload into v_payload
  from public.notes
  where id = p_note_id
    and group_id = public.my_group_id()
    and type = 'poll'
  for update;

  if not found then
    return null;
  end if;
  v_payload := coalesce(v_payload, '{}'::jsonb);

  if not coalesce(v_payload->'options', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', p_option_id)) then
    return v_payload;
  end if;

  v_votes := coalesce(v_payload->'votes', '{}'::jsonb);
  v_had := coalesce(v_votes->p_option_id, '[]'::jsonb) @> to_jsonb(v_uid);

  for v_key in select jsonb_object_keys(v_votes) loop
    v_votes := jsonb_set(v_votes, array[v_key],
      coalesce((
        select jsonb_agg(e)
        from jsonb_array_elements(v_votes->v_key) e
        where e <> to_jsonb(v_uid)
      ), '[]'::jsonb));
  end loop;

  if not v_had then
    v_votes := jsonb_set(v_votes, array[p_option_id],
      coalesce(v_votes->p_option_id, '[]'::jsonb) || to_jsonb(v_uid));
  end if;

  update public.notes
  set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{votes}', v_votes)
  where id = p_note_id
  returning payload into v_payload;
  return v_payload;
end;
$$;

-- RSVP: distinguish "no such event / not permitted" (raise) from a real write,
-- instead of returning an ambiguous NULL the client can't interpret. The raise
-- path is unreachable via the UI (you can't see an event you can't RSVP to).
create or replace function public.set_event_rsvp(p_event_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   text := auth.uid()::text;
  v_rsvps jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_status is not null and p_status not in ('yes', 'maybe', 'no') then
    raise exception 'invalid rsvp status %', p_status;
  end if;
  update public.events
  set rsvps = case
    when p_status is null then coalesce(rsvps, '{}'::jsonb) - v_uid
    else coalesce(rsvps, '{}'::jsonb) || jsonb_build_object(v_uid, p_status)
  end
  where id = p_event_id
    and group_id = public.my_group_id()
    and (is_private is not true or created_by = auth.uid())
  returning rsvps into v_rsvps;
  if not found then raise exception 'event not found or not permitted'; end if;
  return v_rsvps;
end;
$$;

-- ─── Policies ────────────────────────────────────────────────────────────────

-- profiles: you may only point your active space at a group you belong to.
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and (
      group_id is null
      or exists (
        select 1 from public.group_members gm
        where gm.user_id = auth.uid() and gm.group_id = profiles.group_id
      )
    )
  );

-- tasks / events: keep "private" items out of shared groups on INSERT *and*
-- UPDATE (realtime ignores per-row RLS). coalesce(is_personal,false) so a NULL
-- flag can't reject a legit personal insert.
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (
    group_id = public.my_group_id() and created_by = auth.uid()
    and (is_private is not true
         or exists (select 1 from public.groups g where g.id = group_id and coalesce(g.is_personal, false)))
  );
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (
    group_id = public.my_group_id()
    and (created_by = auth.uid() or assigned_to = auth.uid() or assigned_to is null)
  ) with check (
    group_id = public.my_group_id()
    and (created_by = auth.uid() or assigned_to = auth.uid() or assigned_to is null)
    and (is_private is not true
         or exists (select 1 from public.groups g where g.id = group_id and coalesce(g.is_personal, false)))
  );
drop policy if exists "events_insert" on public.events;
create policy "events_insert" on public.events
  for insert with check (
    group_id = public.my_group_id() and created_by = auth.uid()
    and (is_private is not true
         or exists (select 1 from public.groups g where g.id = group_id and coalesce(g.is_personal, false)))
  );
drop policy if exists "events_update" on public.events;
create policy "events_update" on public.events
  for update using (group_id = public.my_group_id())
  with check (
    group_id = public.my_group_id()
    and (is_private is not true
         or exists (select 1 from public.groups g where g.id = group_id and coalesce(g.is_personal, false)))
  );

-- note_comments (legacy): the WITH CHECK it was missing.
drop policy if exists "note_comments_update" on public.note_comments;
create policy "note_comments_update" on public.note_comments
  for update using (created_by = auth.uid())
  with check (created_by = auth.uid() and group_id = public.my_group_id());

-- notifications INSERT: only notify actual members of your active group (the
-- notifications realtime channel filters by user_id, so an arbitrary user_id
-- here would forge an alert into a non-member's inbox). This hardened policy
-- lives in schema.sql too; re-stated here so this run-file is self-contained.
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert with check (
    group_id = public.my_group_id()
    and user_id in (select user_id from public.group_members
                    where group_id = public.my_group_id())
  );

-- notifications: a missing WITH CHECK let a user UPDATE their own notification's
-- user_id, moving it into another user's inbox (the notifications realtime
-- channel is filtered by user_id, so the victim's client would ingest it).
-- Pin the post-image user_id to the caller. (Do NOT pin group_id here — a user's
-- notifications legitimately span multiple groups, and mark-read must still work
-- while active in a different group.)
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- task_suggestions: pin delete to the active group (self-scoped integrity).
drop policy if exists "task_suggestions_delete" on public.task_suggestions;
create policy "task_suggestions_delete" on public.task_suggestions
  for delete using (suggested_by = auth.uid() and group_id = public.my_group_id());

-- ── Spaces & Shared-Lists: bring child-row and UPDATE policies up to the same
--    bar as tasks/events. Two gaps, both the same class earlier cycles fixed
--    elsewhere but never applied here:
--    (1) child INSERT/UPDATE only checked the child's own group_id, never that
--        the parent space/list is in your group → a client could attach a child
--        to another group's parent (silent stored injection into detail views).
--    (2) spaces/shared_lists/their items had UPDATE USING but no WITH CHECK →
--        a member of two groups could relocate a row (and its space_id-linked
--        children) from one group into the other, leaking its contents.

-- spaces
drop policy if exists "spaces_update" on public.spaces;
create policy "spaces_update" on public.spaces
  for update using (group_id = public.my_group_id())
  with check (group_id = public.my_group_id());

-- space_items (parent = spaces)
drop policy if exists "space_items_insert" on public.space_items;
create policy "space_items_insert" on public.space_items
  for insert with check (
    group_id = public.my_group_id()
    and created_by = auth.uid()
    and exists (select 1 from public.spaces s where s.id = space_id and s.group_id = public.my_group_id())
  );
drop policy if exists "space_items_update" on public.space_items;
create policy "space_items_update" on public.space_items
  for update using (group_id = public.my_group_id())
  with check (
    group_id = public.my_group_id()
    and exists (select 1 from public.spaces s where s.id = space_id and s.group_id = public.my_group_id())
  );

-- Pin authorship on shared-content INSERTs (spaces / shared_lists), so a member
-- can't stamp another member's uid as created_by on group-visible content.
drop policy if exists "spaces_insert" on public.spaces;
create policy "spaces_insert" on public.spaces
  for insert with check (group_id = public.my_group_id() and created_by = auth.uid());
drop policy if exists "shared_lists_insert" on public.shared_lists;
create policy "shared_lists_insert" on public.shared_lists
  for insert with check (group_id = public.my_group_id() and created_by = auth.uid());

-- shared_lists
drop policy if exists "shared_lists_update" on public.shared_lists;
create policy "shared_lists_update" on public.shared_lists
  for update using (group_id = public.my_group_id())
  with check (group_id = public.my_group_id());

-- shared_list_items (parent = shared_lists)
drop policy if exists "shared_list_items_insert" on public.shared_list_items;
create policy "shared_list_items_insert" on public.shared_list_items
  for insert with check (
    group_id = public.my_group_id()
    and created_by = auth.uid()
    and exists (select 1 from public.shared_lists l where l.id = list_id and l.group_id = public.my_group_id())
  );
drop policy if exists "shared_list_items_update" on public.shared_list_items;
create policy "shared_list_items_update" on public.shared_list_items
  for update using (group_id = public.my_group_id())
  with check (
    group_id = public.my_group_id()
    and exists (select 1 from public.shared_lists l where l.id = list_id and l.group_id = public.my_group_id())
  );

-- shared_list_activity (parent = shared_lists)
drop policy if exists "shared_list_activity_insert" on public.shared_list_activity;
create policy "shared_list_activity_insert" on public.shared_list_activity
  for insert with check (
    group_id = public.my_group_id()
    and exists (select 1 from public.shared_lists l where l.id = list_id and l.group_id = public.my_group_id())
  );

-- Ownership-scope DELETE on shared content so one member can't delete another
-- member's space / list / item. Previously these were group-scoped only, letting
-- any member hard-delete anyone's rows (space delete cascades its items). Now
-- matches the tasks/notes/events ownership model: spaces & lists → creator only;
-- their items → creator, assignee, or unassigned.
drop policy if exists "spaces_delete" on public.spaces;
create policy "spaces_delete" on public.spaces
  for delete using (group_id = public.my_group_id() and created_by = auth.uid());
drop policy if exists "shared_lists_delete" on public.shared_lists;
create policy "shared_lists_delete" on public.shared_lists
  for delete using (group_id = public.my_group_id() and created_by = auth.uid());
drop policy if exists "space_items_delete" on public.space_items;
create policy "space_items_delete" on public.space_items
  for delete using (
    group_id = public.my_group_id()
    and (created_by = auth.uid() or assigned_to = auth.uid() or assigned_to is null)
  );
drop policy if exists "shared_list_items_delete" on public.shared_list_items;
create policy "shared_list_items_delete" on public.shared_list_items
  for delete using (
    group_id = public.my_group_id()
    and (created_by = auth.uid() or assigned_to = auth.uid() or assigned_to is null)
  );

-- ─── Realtime: REPLICA IDENTITY FULL ─────────────────────────────────────────
-- Without this, a DELETE's WAL record carries only the primary key, so the
-- group_id/user_id realtime channel filter can't apply and deletes broadcast
-- (row id + timing) to every tenant. FULL puts the old row in the record.
alter table public.tasks                replica identity full;
alter table public.events               replica identity full;
-- notes carries base64 photo payloads, so REPLICA IDENTITY FULL ships the WHOLE
-- old row (photos included, up to a few MB) through WAL + the realtime socket on
-- every pin/vote/soft-delete. The realtime channel only filters on group_id and
-- the DELETE handler only reads old.id, so a narrow (group_id, id) index identity
-- carries everything needed at ~1/1000th the old-image size.
create unique index if not exists notes_replica_gid_id on public.notes (group_id, id);
alter table public.notes                replica identity using index notes_replica_gid_id;
alter table public.notifications        replica identity full;
alter table public.task_suggestions     replica identity full;
alter table public.spaces               replica identity full;
alter table public.space_items          replica identity full;
alter table public.shared_lists         replica identity full;
alter table public.shared_list_items    replica identity full;
alter table public.shared_list_activity replica identity full;

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Recurring-dedup partial index; drop the low-selectivity boolean indexes.
create index if not exists tasks_recur_dedupe_idx
  on public.tasks (group_id, due_date)
  where completed = false and recurrence is not null;
drop index if exists public.tasks_is_private_idx;
drop index if exists public.events_is_private_idx;

-- group_id indexes on three group-scoped tables (loaded + RLS-checked by
-- group_id every access/realtime event, but previously only parent-key indexed).
create index if not exists shared_list_items_group_idx on public.shared_list_items (group_id);
create index if not exists space_items_group_idx       on public.space_items       (group_id);
create index if not exists task_suggestions_group_idx  on public.task_suggestions  (group_id, created_at);

-- ─── Re-assert EXECUTE grants ────────────────────────────────────────────────
-- `create or replace function` preserves an existing ACL, but if any of these
-- were re-created on a DB where they didn't already carry the tightened grant,
-- the default (EXECUTE to PUBLIC, incl. anon) would apply. Re-assert defensively.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'respawn_recurring_task','respond_baton','vote_on_poll','set_event_rsvp',
        'grab_task','decide_suggestion','join_group_by_code','create_group'
      )
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- ─── Cycle 8: FK indexes for cascade/set-null paths ──────────────────────────
-- Deleting an event/note/group had to seq-scan the child table to find rows
-- to cascade or null out. Cheap, rare-path, but free to fix.
create index if not exists tasks_event_idx         on public.tasks         (event_id);
create index if not exists tasks_note_idx          on public.tasks         (note_id);
create index if not exists events_note_idx         on public.events        (note_id);
create index if not exists group_members_group_idx on public.group_members (group_id);
