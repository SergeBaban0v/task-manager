create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  dependencies text[] not null default '{}',
  label_ids jsonb not null default '[]'::jsonb,
  chain_task_ids jsonb not null default '[]'::jsonb,
  parallel_group_id text,
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

alter table public.tasks
  add column if not exists parallel_group_id text;

alter table public.tasks
  add column if not exists label_ids jsonb not null default '[]'::jsonb;

alter table public.tasks
  add column if not exists chain_task_ids jsonb not null default '[]'::jsonb;

create table if not exists public.label_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  behaviors jsonb not null default '{}'::jsonb,
  updated_at bigint not null
);

alter table public.tasks enable row level security;
alter table public.label_settings enable row level security;

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

drop policy if exists "Users can read own label settings" on public.label_settings;
create policy "Users can read own label settings"
  on public.label_settings
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own label settings" on public.label_settings;
create policy "Users can insert own label settings"
  on public.label_settings
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own label settings" on public.label_settings;
create policy "Users can update own label settings"
  on public.label_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
