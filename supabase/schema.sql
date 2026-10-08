create table public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  category   text not null check (category in ('breakfast','lunch','dinner','snacks','misc')),
  amount     numeric(10,2) not null check (amount > 0),
  note       text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index expenses_user_date_idx on public.expenses (user_id, date);

alter table public.expenses enable row level security;

create policy "select own" on public.expenses
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own" on public.expenses
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own" on public.expenses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "delete own" on public.expenses
  for delete to authenticated using ((select auth.uid()) = user_id);

-- New Supabase projects require explicit grants for tables used through the Data API.
grant select, insert, update, delete on public.expenses to authenticated;
