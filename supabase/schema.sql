create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hero_name text not null default 'Герой',
  age text,
  occasion text not null default 'Для ребенка',
  story text not null default 'Волшебное приключение',
  price integer not null default 1490,
  status text not null default 'draft' check (
    status in ('draft', 'generating_avatars', 'avatars_ready', 'awaiting_payment', 'creating_movie', 'ready', 'failed')
  ),
  source_photo_path text,
  selected_avatar_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.avatars (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  variant integer not null check (variant between 1 and 3),
  title text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique(order_id, variant)
);

alter table public.orders
  drop constraint if exists orders_selected_avatar_id_fkey;

alter table public.orders
  add constraint orders_selected_avatar_id_fkey
  foreign key (selected_avatar_id) references public.avatars(id) on delete set null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.avatars enable row level security;

drop policy if exists "Profiles are visible by owner" on public.profiles;
create policy "Profiles are visible by owner"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Profiles are upserted by owner" on public.profiles;
create policy "Profiles are upserted by owner"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "Profiles are updated by owner" on public.profiles;
create policy "Profiles are updated by owner"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Orders are visible by owner" on public.orders;
create policy "Orders are visible by owner"
on public.orders for select
using (auth.uid() = user_id);

drop policy if exists "Orders are created by owner" on public.orders;
create policy "Orders are created by owner"
on public.orders for insert
with check (auth.uid() = user_id);

drop policy if exists "Orders are updated by owner" on public.orders;
create policy "Orders are updated by owner"
on public.orders for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Avatars are visible by owner" on public.avatars;
create policy "Avatars are visible by owner"
on public.avatars for select
using (auth.uid() = user_id);

drop policy if exists "Avatars are created by owner" on public.avatars;
create policy "Avatars are created by owner"
on public.avatars for insert
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values
  ('source-photos', 'source-photos', false),
  ('generated-avatars', 'generated-avatars', false)
on conflict (id) do nothing;

drop policy if exists "Users can read own source photos" on storage.objects;
create policy "Users can read own source photos"
on storage.objects for select
using (bucket_id = 'source-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can upload own source photos" on storage.objects;
create policy "Users can upload own source photos"
on storage.objects for insert
with check (bucket_id = 'source-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can read own generated avatars" on storage.objects;
create policy "Users can read own generated avatars"
on storage.objects for select
using (bucket_id = 'generated-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
