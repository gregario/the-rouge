-- Accounts & Progress Sync schema
-- Supports: AC-ACCT-03 through AC-ACCT-13

-- Profiles table (extends Supabase Auth users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) <= 30),
  guardian_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Synced progress table (one per account)
create table public.synced_progress (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.profiles(id) on delete cascade,
  completed_items text[] not null default '{}',
  completed_at jsonb not null default '{}',
  category_badges text[] not null default '{}',
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_played_date text,
  daily_stamps text[] not null default '{}',
  total_quiz_correct integer not null default 0,
  total_quiz_answered integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.synced_progress enable row level security;

-- Profiles: users can only read/update their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Synced progress: users can only access their own progress
create policy "Users can read own progress"
  on public.synced_progress for select
  using (auth.uid() = account_id);

create policy "Users can insert own progress"
  on public.synced_progress for insert
  with check (auth.uid() = account_id);

create policy "Users can update own progress"
  on public.synced_progress for update
  using (auth.uid() = account_id);

-- Function to handle new user creation (creates profile + empty progress)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, guardian_confirmed)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    coalesce((new.raw_user_meta_data->>'guardian_confirmed')::boolean, false)
  );
  insert into public.synced_progress (account_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users insert
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at timestamp
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger synced_progress_updated_at
  before update on public.synced_progress
  for each row execute function public.update_updated_at();
