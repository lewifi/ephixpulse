-- Run once in the Supabase SQL editor.
create table if not exists push_tokens (
  token       text primary key,
  platform    text,
  created_at  timestamptz default now()
);

alter table push_tokens enable row level security;

-- Allow the app (anon key) to register its own token. Tokens aren't sensitive.
create policy push_insert
  on push_tokens for insert to anon with check (true);

-- The scheduled worker reads tokens with the same key:
create policy push_select
  on push_tokens for select to anon using (true);
