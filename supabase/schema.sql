-- SaveBrain schema: every save and reminder belongs to one signed-in user.
-- The SaveBrain setup screen runs this automatically. To run it by hand:
-- Supabase Dashboard -> SQL Editor -> paste -> Run. Safe to re-run.

-- ---------- Saved posts ----------
create table if not exists savebrain_items (
  id text primary key default gen_random_uuid()::text,
  platform text, author text, title text, url text,
  summary text, category text, urgency text, trust text,
  deadline text, action text, status text default 'To Do',
  created_at timestamptz default now()
);

-- Older copies of this table may lack an id default; set one matching the column's type
do $$ begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'savebrain_items' and column_name = 'id') = 'uuid' then
    alter table savebrain_items alter column id set default gen_random_uuid();
  else
    alter table savebrain_items alter column id set default gen_random_uuid()::text;
  end if;
end $$;

alter table savebrain_items
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  add column if not exists post_date text,
  add column if not exists post_type text,
  add column if not exists likes text,
  add column if not exists comments text,
  add column if not exists why text,
  add column if not exists steps jsonb not null default '[]'::jsonb,
  add column if not exists signals jsonb not null default '[]'::jsonb,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table savebrain_items alter column status set default 'To Do';

-- Values written by earlier versions of SaveBrain
update savebrain_items set status = 'To Do' where status = 'todo';
update savebrain_items set status = 'Done' where status = 'done';
update savebrain_items set trust = 'Check Claims' where trust = 'CHECK CLAIMS';
update savebrain_items set platform = initcap(platform) where platform in ('instagram', 'facebook');

create index if not exists savebrain_items_user_id_idx on savebrain_items(user_id);
-- One row per link per user, so re-importing from Meta AI never creates duplicates
create unique index if not exists savebrain_items_user_url_idx on savebrain_items(user_id, url);

-- ---------- Reminders ----------
create table if not exists savebrain_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  item_title text not null,
  item_link text,
  date date not null,
  created_at timestamptz default now()
);
create index if not exists savebrain_reminders_user_id_idx on savebrain_reminders(user_id);

-- ---------- Access: signed-in users only, and only their own rows ----------
revoke all on savebrain_items, savebrain_reminders from anon;
grant select, insert, update, delete on savebrain_items, savebrain_reminders to authenticated;
alter table savebrain_items enable row level security;
alter table savebrain_reminders enable row level security;

-- Remove the old wide-open policies from the first version of SaveBrain
drop policy if exists "public read" on savebrain_items;
drop policy if exists "public insert" on savebrain_items;
drop policy if exists "public update" on savebrain_items;
drop policy if exists "public delete" on savebrain_items;

do $$
declare t text;
begin
  foreach t in array array['savebrain_items', 'savebrain_reminders'] loop
    execute format('drop policy if exists "own read" on %I', t);
    execute format('drop policy if exists "own insert" on %I', t);
    execute format('drop policy if exists "own update" on %I', t);
    execute format('drop policy if exists "own delete" on %I', t);
    execute format('create policy "own read" on %I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own insert" on %I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own update" on %I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own delete" on %I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Optional: claim rows created before accounts existed (replace the email).
-- update savebrain_items set user_id = (select id from auth.users where email = 'you@example.com') where user_id is null;
