-- SaveBrain schema: every save belongs to one signed-in user.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.

create table if not exists savebrain_items (
  id text primary key default gen_random_uuid()::text,
  platform text, author text, title text, url text,
  summary text, category text, urgency text, trust text,
  deadline text, action text, status text default 'todo',
  created_at timestamptz default now()
);

alter table savebrain_items
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
create index if not exists savebrain_items_user_id_idx on savebrain_items(user_id);

alter table savebrain_items enable row level security;

-- Remove the old wide-open policies
drop policy if exists "public read" on savebrain_items;
drop policy if exists "public insert" on savebrain_items;
drop policy if exists "public update" on savebrain_items;
drop policy if exists "public delete" on savebrain_items;

drop policy if exists "own read" on savebrain_items;
drop policy if exists "own insert" on savebrain_items;
drop policy if exists "own update" on savebrain_items;
drop policy if exists "own delete" on savebrain_items;

create policy "own read" on savebrain_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own insert" on savebrain_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own update" on savebrain_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on savebrain_items for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Optional: after you sign up, claim rows created before auth existed.
-- update savebrain_items set user_id = (select id from auth.users where email = 'you@example.com') where user_id is null;
