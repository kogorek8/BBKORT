select 'BBKORT czesc 1 z 5';
create extension if not exists pgcrypto;
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 3 and 40),
  tag         text not null unique check (char_length(tag) between 2 and 4),
  color       text not null default '#ff7a1a',
  sport       text not null default 'basketball' check (sport in ('basketball','football')),
  captain_id  uuid,
  rating      numeric,
  created_at  timestamptz not null default now()
);
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  nick                  text not null check (char_length(nick) between 2 and 24),
  team_id               uuid references public.teams(id) on delete set null,
  sport                 text not null default 'basketball' check (sport in ('basketball','football')),
  position              text check (char_length(position) <= 4),
  number                int  check (number between 0 and 99),
  height_cm             int  check (height_cm between 120 and 240),
  is_admin              boolean not null default false,
  is_moderator          boolean not null default false,
  skills                jsonb not null default '{}'::jsonb,
  skills_pending        jsonb,
  skills_pending_sport  text,
  skills_video          text,
  skills_status         text not null default 'none'
                        check (skills_status in ('none','pending','approved','rejected')),
  skills_note           text,
  skills_submitted_at   timestamptz,
  ghost_count           int not null default 0,
  created_at            timestamptz not null default now()
);
do $$ begin
  alter table public.teams
    add constraint teams_captain_fk foreign key (captain_id)
    references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;
create table if not exists public.courts (
  id               uuid primary key default gen_random_uuid(),
  external_id      text unique,
  name             text not null default '',
  sport            text not null default 'basketball' check (sport in ('basketball','football')),
  lat              float8 not null,
  lng              float8 not null,
  address          text not null default '',
  source           text not null default 'manual',
  king_team_id     uuid references public.teams(id) on delete set null,
  king_since       timestamptz,
  protected_until  timestamptz,
  defenses         int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists courts_latlng on public.courts (lat, lng);
create table if not exists public.challenges (
  id                  uuid primary key default gen_random_uuid(),
  court_id            uuid not null references public.courts(id) on delete cascade,
  challenger_team_id  uuid not null references public.teams(id) on delete cascade,
  defender_team_id    uuid not null references public.teams(id) on delete cascade,
  scheduled_at        timestamptz not null,
  status              text not null default 'pending' check (status in
                      ('pending','accepted','reported','confirmed','walkover','expired','cancelled','void')),
  accept_deadline     timestamptz not null,
  referee_id          uuid references public.profiles(id) on delete set null,
  challenger_report   jsonb,
  defender_report     jsonb,
  score_challenger    int,
  score_defender      int,
  video_url           text,
  winner_team_id      uuid,
  note                text,
  resolved_by         uuid references public.profiles(id) on delete set null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);
create table if not exists public.challenge_players (
  challenge_id   uuid not null references public.challenges(id) on delete cascade,
  player_id      uuid not null references public.profiles(id) on delete cascade,
  team_id        uuid not null,
  checked_in_at  timestamptz,
  primary key (challenge_id, player_id)
);
create table if not exists public.court_history (
  id            bigint generated always as identity primary key,
  court_id      uuid not null references public.courts(id) on delete cascade,
  team_id       uuid references public.teams(id) on delete set null,
  event         text not null,
  challenge_id  uuid,
  at            timestamptz not null default now()
);
alter table public.teams             enable row level security;
alter table public.profiles          enable row level security;
alter table public.courts            enable row level security;
alter table public.challenges        enable row level security;
alter table public.challenge_players enable row level security;
alter table public.court_history     enable row level security;
do $$ declare t text; begin
  foreach t in array array['teams','profiles','courts','challenges','challenge_players','court_history'] loop
    execute format('drop policy if exists read_all on public.%I', t);
    execute format('create policy read_all on public.%I for select using (true)', t);
  end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['teams','profiles','courts','challenges','challenge_players','court_history'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;
create or replace function public.bb_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  n := left(trim(coalesce(nullif(new.raw_user_meta_data->>'nick',''), split_part(new.email,'@',1), '')), 24);
  if char_length(n) < 2 then n := 'gracz_' || left(new.id::text, 6); end if;
  insert into public.profiles (id, nick) values (new.id, n);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.bb_new_user();
