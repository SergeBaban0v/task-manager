create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  dependencies text[] not null default '{}',
  priority text not null default 'medium',
  completed boolean not null default false,
  completed_at bigint,
  created_at bigint not null,
  hold_until bigint,
  deleted boolean not null default false,
  deleted_at bigint,
  updated_at bigint not null,
  primary key (user_id, id)
);

alter table public.tasks
  add column if not exists deleted boolean not null default false;

alter table public.tasks
  add column if not exists deleted_at bigint;

alter table public.tasks enable row level security;

drop policy if exists "Users can read own tasks" on public.tasks;
create policy "Users can read own tasks"
  on public.tasks
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own tasks" on public.tasks;
create policy "Users can insert own tasks"
  on public.tasks
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own tasks" on public.tasks;
create policy "Users can update own tasks"
  on public.tasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own tasks" on public.tasks;
create policy "Users can delete own tasks"
  on public.tasks
  for delete
  using (auth.uid() = user_id);
