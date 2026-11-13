-- =====================================================================
--  BBKORT – MIGRACJA 2: oceny boisk (gwiazdki 1–5 w kilku kategoriach)
--  Bezpieczna do wielokrotnego uruchomienia.
--  Kryteria są w app/js/rules.js (COURT_CRITERIA) – można je zmienić
--  bez ruszania bazy (zapisywane jako JSON).
-- =====================================================================

create table if not exists public.court_ratings (
  court_id    uuid not null references public.courts(id) on delete cascade,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  scores      jsonb not null,            -- {"surface":4,"hoops":5,...}
  comment     text check (char_length(comment) <= 280),
  created_at  timestamptz not null default now(),
  primary key (court_id, player_id)
);

alter table public.court_ratings enable row level security;
drop policy if exists read_all on public.court_ratings;
create policy read_all on public.court_ratings for select using (true);
do $$ begin
  alter publication supabase_realtime add table public.court_ratings;
exception when others then null; end $$;

-- Ocena boiska przez zalogowanego gracza (jedna ocena na gracza, można ją zmienić)
create or replace function public.rate_court(p_court uuid, p_scores jsonb, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; r record; n int := 0;
begin
  me := public.bb_me();
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'err_not_found'; end if;
  if jsonb_typeof(p_scores) <> 'object' then raise exception 'err_bad_request'; end if;
  for r in select * from jsonb_each(p_scores) loop
    n := n + 1;
    if jsonb_typeof(r.value) <> 'number' or (r.value)::int not between 1 and 5 then
      raise exception 'err_bad_rating';
    end if;
  end loop;
  if n = 0 or n > 12 then raise exception 'err_bad_rating'; end if;
  insert into public.court_ratings (court_id, player_id, scores, comment)
  values (p_court, me.id, p_scores, nullif(left(trim(coalesce(p_comment,'')), 280), ''))
  on conflict (court_id, player_id)
  do update set scores = excluded.scores, comment = excluded.comment, created_at = now();
end $$;

-- Admin może usunąć ocenę (np. spam)
create or replace function public.admin_delete_rating(p_court uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  delete from public.court_ratings where court_id = p_court and player_id = p_player;
end $$;

select 'BBKORT migracja 2 OK' as wynik;
