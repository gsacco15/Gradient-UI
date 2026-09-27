-- Atmos sharing update: short links, private (link-only) shares and link-preview images.
-- Run once in Supabase → SQL Editor after schema.sql. Safe to re-run.

alter table public.shared_gradients add column if not exists slug text;
alter table public.shared_gradients add column if not exists listed boolean not null default true;
alter table public.shared_gradients add column if not exists preview_path text;
update public.shared_gradients set slug = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) where slug is null;
alter table public.shared_gradients alter column slug set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
alter table public.shared_gradients alter column slug set not null;
create unique index if not exists shared_gradients_slug_idx on public.shared_gradients (slug);

-- The view gains the new columns (a view's columns can't be reordered in place, so recreate it).
drop view if exists public.community_gradients;
create view public.community_gradients with (security_invoker = true) as
  select g.id, g.slug, g.user_id, g.author, g.name, g.place, g.gradient, g.listed, g.preview_path, g.created_at,
         (select count(*) from public.gradient_likes l where l.gradient_id = g.id)::int as likes
  from public.shared_gradients g;
grant select on public.community_gradients to anon, authenticated;

-- Link-preview images: a public bucket; people can only upload into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('previews', 'previews', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload own previews" on storage.objects;
create policy "upload own previews" on storage.objects for insert to authenticated
  with check (bucket_id = 'previews' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own previews" on storage.objects;
create policy "delete own previews" on storage.objects for delete to authenticated
  using (bucket_id = 'previews' and (storage.foldername(name))[1] = auth.uid()::text);

-- Make the API see the new columns right away.
notify pgrst, 'reload schema';
