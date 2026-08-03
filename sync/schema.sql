-- Cross-device list sync schema (Run in Supabase SQL editor)

create table if not exists sync_lists (
  code          text primary key,            -- permanent 6-char unambiguous code
  items         jsonb not null default '[]', -- array of watchlist objects
  members       jsonb not null default '[]', -- array of push tokens (for approval prompts)
  pending_joins jsonb not null default '[]', -- array of pending join objects
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

alter table sync_lists enable row level security;

-- Policies for anon access (Pages Functions use SUPABASE_KEY):
create policy sync_select on sync_lists for select to anon using (true);
create policy sync_insert on sync_lists for insert to anon with check (true);
create policy sync_update on sync_lists for update to anon using (true);
