-- Kinnekt — Audit Cycle 2, Batch A (security). Run this whole file in the
-- Supabase SQL editor. Safe to re-run (idempotent). Nothing else needed.

-- groups: block direct client inserts (all creation is via definer RPCs)
drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert" on public.groups
  for insert to authenticated with check (false);

-- group_members: direct self-inserts pinned to role='member'
drop policy if exists "group_members_insert" on public.group_members;
create policy "group_members_insert" on public.group_members
  for insert with check (
    user_id = auth.uid() and role = 'member'
    and coalesce((select g.is_personal from public.groups g where g.id = group_id), false) = false
  );

-- notes/events UPDATE: add WITH CHECK so a row can't be relocated to another group
drop policy if exists "notes_update" on public.notes;
create policy "notes_update" on public.notes
  for update using (group_id = public.my_group_id()) with check (group_id = public.my_group_id());
drop policy if exists "events_update" on public.events;
create policy "events_update" on public.events
  for update using (group_id = public.my_group_id()) with check (group_id = public.my_group_id());

-- private items only in a personal space (else they'd leak via realtime)
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (
    group_id = public.my_group_id() and created_by = auth.uid()
    and (is_private is not true or exists (select 1 from public.groups g where g.id = group_id and g.is_personal))
  );
drop policy if exists "events_insert" on public.events;
create policy "events_insert" on public.events
  for insert with check (
    group_id = public.my_group_id() and created_by = auth.uid()
    and (is_private is not true or exists (select 1 from public.groups g where g.id = group_id and g.is_personal))
  );

-- legacy inserts: require the referenced parent row to be in your group
drop policy if exists "note_comments_insert" on public.note_comments;
create policy "note_comments_insert" on public.note_comments
  for insert with check (
    group_id = public.my_group_id() and created_by = auth.uid()
    and exists (select 1 from public.notes n where n.id = note_id and n.group_id = public.my_group_id())
  );
drop policy if exists "task_suggestions_insert" on public.task_suggestions;
create policy "task_suggestions_insert" on public.task_suggestions
  for insert with check (
    group_id = public.my_group_id() and suggested_by = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and t.group_id = public.my_group_id() and t.created_by <> auth.uid())
  );

-- narrow these 4 RPCs from PUBLIC to authenticated (auto-resolves real signature)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_event_rsvp', 'vote_on_poll', 'respond_baton', 'respawn_recurring_task')
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
