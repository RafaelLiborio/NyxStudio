-- Execute este arquivo no SQL Editor do projeto Supabase.
create table if not exists public.brasa_state (
  id text primary key check (id = 'main'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.brasa_state enable row level security;
revoke all on table public.brasa_state from anon, authenticated;
grant all on table public.brasa_state to service_role;
