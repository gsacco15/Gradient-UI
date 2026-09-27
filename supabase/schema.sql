-- Atmos community schema. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run: it only creates what is missing.

create table if not exists public.shared_gradients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author text not null default 'anonymous',
  name text not null,
  place text not null default '',
  gradient jsonb not null,
  created_at timestamptz not null default now(),
  constraint name_length check (char_length(name) between 1 and 40),
  constraint author_length check (char_length(author) between 1 and 32),
  constraint place_length check (char_length(place) <= 40),
  constraint gradient_size check (octet_length(gradient::text) < 20000)
);

create table if not exists public.gradient_likes (
  gradient_id uuid not null references public.shared_gradients (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (gradient_id, user_id)
);

create index if not exists shared_gradients_created_idx on public.shared_gradients (created_at desc);

-- Gradients with their like counts, for the community wall.
create or replace view public.community_gradients with (security_invoker = true) as
  select g.id, g.user_id, g.author, g.name, g.place, g.gradient, g.created_at,
         (select count(*) from public.gradient_likes l where l.gradient_id = g.id)::int as likes
  from public.shared_gradients g;

-- Row level security: anyone can read; you can only add or remove your own rows.
alter table public.shared_gradients enable row level security;
alter table public.gradient_likes enable row level security;

drop policy if exists "read shared" on public.shared_gradients;
create policy "read shared" on public.shared_gradients for select using (true);
drop policy if exists "insert own shared" on public.shared_gradients;
create policy "insert own shared" on public.shared_gradients for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "delete own shared" on public.shared_gradients;
create policy "delete own shared" on public.shared_gradients for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "read likes" on public.gradient_likes;
create policy "read likes" on public.gradient_likes for select using (true);
drop policy if exists "insert own like" on public.gradient_likes;
create policy "insert own like" on public.gradient_likes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "delete own like" on public.gradient_likes;
create policy "delete own like" on public.gradient_likes for delete to authenticated using (auth.uid() = user_id);

-- Explicit Data API access (works whether or not "automatically expose new tables" is on).
-- Row level security above still decides which rows each person can touch.
grant usage on schema public to anon, authenticated;
grant select on public.shared_gradients, public.gradient_likes, public.community_gradients to anon, authenticated;
grant insert, delete on public.shared_gradients, public.gradient_likes to authenticated;
