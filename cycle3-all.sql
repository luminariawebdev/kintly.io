-- ════════════════════════════════════════════════════════════════════════════
-- Kinnekt — consolidated backend migration (everything since Cycle-2 Batch A).
-- Run this ONE file in the Supabase SQL editor. Safe to re-run (idempotent).
-- It supersedes the earlier cycle2-batchB / cycle2-b18-baton / cycle2-batchC
-- files (their final, cycle-3-refined versions are included here), plus the new
-- Cycle-3 security / realtime / index fixes. You do NOT need those older files.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── RPCs (final versions) ───────────────────────────────────────────────────

-- Recurring respawn: row-locked (no double-spawn on double-complete) and the
-- dedup guard is keyed on the SERIES (created_by/space_id/due_time), not on
-- assigned_to (which let a pool-revert miss a real duplicate).
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
     v_src.due_time, v_src.recurrence, v_src.is_private, v_src.space_id, false)
  returning * into v_new;

  return v_new;
end;
$$;

-- Baton accept = ONE-TIME takeover (recurring reverts to the offerer next time);
-- non-recurring accepts clear any stale pickup state so a later recurrence edit
-- can't resurrect a wrong owner.
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
-- signup on failure (the idempotent backfill is the recovery path).
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
    null;
  end;
  return new;
end;
$$;

-- Poll vote: write only the votes subtree (no clobber of a concurrent pin/edit).
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

  if v_payload is null then
    return null;
  end if;

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

-- ─── Policies ────────────────────────────────────────────────────────────────

-- Single hardened profiles_update (you may only point your active space at a
-- group you belong to).
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

-- Keep "private" items out of shared groups on INSERT *and* UPDATE (realtime
-- ignores per-row RLS, so a private task/event in a shared group leaks). Use
-- coalesce(is_personal,false) so a NULL flag can't reject a legit personal insert.
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

-- Legacy note_comments_update: add the WITH CHECK it was missing.
drop policy if exists "note_comments_update" on public.note_comments;
create policy "note_comments_update" on public.note_comments
  for update using (created_by = auth.uid())
  with check (created_by = auth.uid() and group_id = public.my_group_id());

-- ─── Realtime: REPLICA IDENTITY FULL ─────────────────────────────────────────
-- Without this, a DELETE's WAL record carries only the primary key, so the
-- group_id/user_id realtime channel filter can't apply and deletes broadcast
-- (row id + timing) to every tenant. FULL puts the old row in the record.
alter table public.tasks                replica identity full;
alter table public.events               replica identity full;
alter table public.notes                replica identity full;
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
