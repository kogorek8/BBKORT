// Wspólny stan aplikacji + selektory
import { api } from './api/index.js';
import { t, has } from './i18n.js';
import { toast } from './ui.js';
import { OPEN_STATUSES, WIN_STATUSES, ZONE_LAT, ZONE_LNG, COURT_CRITERIA, RULES, BADGES, SEASON_POINTS, STAT_KEYS, seasonAt, H } from './rules.js';
import { teamRating } from './skills.js';

export const store = { data: null, me: null };

let renderFn = () => {};
export const onRender = (fn) => (renderFn = fn);
export const rerender = () => renderFn();

let lastResolve = 0;
export async function reload() {
  if (Date.now() - lastResolve > 30000) {
    lastResolve = Date.now();
    try { await api.rpc('resolve_expired', {}); } catch { /* ignore */ }
  }
  const d = await api.load();
  for (const k of ['court_ratings', 'court_reviews', 'team_requests', 'games', 'game_players', 'court_issues', 'court_presence', 'notifications',
    'challenge_backers', 'match_stats', 'player_badges', 'posts', 'shop_items', 'drops', 'purchases', 'coin_ledger']) d[k] = d[k] || [];
  // boiska zgłoszone przez graczy czekają na akceptację – nie są jeszcze na mapie
  d.pending_courts = d.courts.filter((c) => c.status === 'pending');
  d.courts = d.courts.filter((c) => c.status !== 'pending');
  store.data = d;
  store.me = await api.me(store.data);
  renderFn();
}

let reloadTimer;
export function softReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => reload().catch(() => {}), 400);
}

export function errText(e) {
  const m = (e && e.message) || String(e);
  const code = (m.match(/err_[a-z_]+/) || [])[0];
  return code && has(code) ? t(code) : `${t('err_generic')}: ${m}`;
}

// Wywołanie akcji gry + odświeżenie
export async function act(name, args, okKey) {
  try {
    const r = await api.rpc(name, args);
    if (okKey) toast(t(okKey), 'ok');
    lastResolve = 0;
    await reload();
    return r ?? true;
  } catch (e) {
    toast(errText(e), 'err');
    return null;
  }
}

export const now = () => api.now();
export const T = (s) => (s ? Date.parse(s) : NaN);

export const teamById = (id) => store.data.teams.find((x) => x.id === id);
export const profileById = (id) => store.data.profiles.find((x) => x.id === id);
export const courtById = (id) => store.data.courts.find((x) => x.id === id);
export const members = (tid) => store.data.profiles.filter((p) => p.team_id === tid)
  .sort((a, b) => (teamById(tid)?.captain_id === a.id ? -1 : teamById(tid)?.captain_id === b.id ? 1 : a.nick.localeCompare(b.nick)));
export const myTeam = () => (store.me?.team_id ? teamById(store.me.team_id) : null);
export const isCaptainOf = (tid) => !!(store.me && tid && teamById(tid)?.captain_id === store.me.id);
export const isAdmin = () => !!store.me?.is_admin;
export const isStaff = () => !!(store.me && (store.me.is_admin || store.me.is_moderator));

// ---- filtr sportu (wspólny dla mapy, tabeli, drużyn, meczów)
export const ui = { sport: 'all' };
try { ui.sport = localStorage.getItem('bbkort_sport') || 'all'; } catch { /* ignore */ }
export function setSport(s) {
  ui.sport = s;
  try { localStorage.setItem('bbkort_sport', s); } catch { /* ignore */ }
}
export const sportOk = (sport) => ui.sport === 'all' || ui.sport === sport;
export const challengeSport = (c) => courtById(c.court_id)?.sport || teamById(c.challenger_team_id)?.sport;

// ---- STREFY TERENU: siatka ~1 km, strefa należy do drużyny z największą liczbą boisk
export function zones() {
  const cells = new Map();
  for (const c of store.data.courts) {
    if (!c.king_team_id || !sportOk(c.sport)) continue;
    const i = Math.floor(c.lat / ZONE_LAT), j = Math.floor(c.lng / ZONE_LNG);
    const k = `${c.sport}:${i}:${j}`;
    let z = cells.get(k);
    if (!z) cells.set(k, (z = { key: k, sport: c.sport, i, j, counts: {}, total: 0 }));
    z.counts[c.king_team_id] = (z.counts[c.king_team_id] || 0) + 1;
    z.total++;
  }
  for (const z of cells.values()) {
    const sorted = Object.entries(z.counts).sort((a, b) => b[1] - a[1]);
    z.owner = sorted.length === 1 || sorted[0][1] > sorted[1][1] ? sorted[0][0] : null;
    z.bounds = [[z.i * ZONE_LAT, z.j * ZONE_LNG], [(z.i + 1) * ZONE_LAT, (z.j + 1) * ZONE_LNG]];
  }
  return [...cells.values()];
}

// ---- TABELA: kolejność = boiska, potem strefy, potem wygrane, potem obrony
export function standings(sport) {
  const zs = zones().filter((z) => z.sport === sport);
  const rows = store.data.teams.filter((tm) => tm.sport === sport).map((tm) => {
    const courts = courtsOf(tm.id);
    const rec = teamRecord(tm.id);
    return {
      team: tm,
      courts: courts.length,
      zones: zs.filter((z) => z.owner === tm.id).length,
      defenses: courts.reduce((s, c) => s + c.defenses, 0),
      w: rec.w, l: rec.l,
      rating: teamRating(members(tm.id), sport),
    };
  });
  rows.sort((a, b) => b.courts - a.courts || b.zones - a.zones || b.w - a.w || b.defenses - a.defenses || a.l - b.l || a.team.name.localeCompare(b.team.name));
  rows.forEach((r, i) => (r.pos = i + 1));
  return rows;
}

// ---- KANAŁ AKTYWNOŚCI: kto co zdobył
export const feed = (limit = 15) => store.data.court_history
  .filter((h) => h.event !== 'reset' && sportOk(courtById(h.court_id)?.sport))
  .sort((a, b) => T(b.at) - T(a.at)).slice(0, limit);

// jak zdobyto boisko (ostatnie przejęcie)
export const lastCapture = (cid) => courtHistory(cid).find((h) => h.event === 'claim' || h.event === 'capture');
export const courtsOf = (tid) => store.data.courts.filter((c) => c.king_team_id === tid);
export const openChallengeForCourt = (cid) => store.data.challenges.find((c) => c.court_id === cid && OPEN_STATUSES.includes(c.status));
export const signups = (chid) => store.data.challenge_players.filter((x) => x.challenge_id === chid);
export const courtName = (c) => (c ? c.name || t('court_unnamed') : '?');
export const courtHistory = (cid) => store.data.court_history.filter((h) => h.court_id === cid).sort((a, b) => T(b.at) - T(a.at));

export function teamRecord(tid) {
  let w = 0, l = 0;
  for (const c of store.data.challenges) {
    if (!WIN_STATUSES.includes(c.status) || !c.winner_team_id) continue;
    if (c.challenger_team_id !== tid && c.defender_team_id !== tid) continue;
    if (c.winner_team_id === tid) w++; else l++;
  }
  return { w, l };
}

export const teamChallenges = (tid) => store.data.challenges
  .filter((c) => c.challenger_team_id === tid || c.defender_team_id === tid)
  .sort((a, b) => T(b.scheduled_at) - T(a.scheduled_at));

// ---- OCENY BOISK: średnia ogólna + średnie kryteriów
export function courtRating(cid) {
  const rows = (store.data.court_ratings || []).filter((r) => r.court_id === cid);
  if (!rows.length) return { n: 0, avg: null, by: {}, rows };
  const by = {};
  for (const k of COURT_CRITERIA) {
    const v = rows.map((r) => Number(r.scores?.[k])).filter((x) => x >= 1 && x <= 5);
    by[k] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  const parts = Object.values(by).filter((x) => x != null);
  const avg = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  return { n: rows.length, avg, by, rows: rows.sort((a, b) => T(b.created_at) - T(a.created_at)) };
}
export const myCourtRating = (cid) => (store.me ? (store.data.court_ratings || []).find((r) => r.court_id === cid && r.player_id === store.me.id) : null);

// ---- OG SPOT: oficjalna karta boiska
export const reviewOf = (cid) => store.data.court_reviews.find((r) => r.court_id === cid) || null;
export const reviewValid = (r) => !!r && Date.parse(r.valid_until) + 864e5 >= now();
export const isOgSpot = (cid) => { const r = reviewOf(cid); return !!(r && r.og_spot && reviewValid(r)); };

// ---- otwarte gry
export const gamePlayers = (gid) => store.data.game_players.filter((x) => x.game_id === gid);
export const upcomingGames = (cid) => store.data.games
  .filter((g) => g.status === 'open' && T(g.starts_at) > now() - 2 * 3600e3 && (cid ? g.court_id === cid : sportOk(g.sport)) && courtById(g.court_id))
  .sort((a, b) => T(a.starts_at) - T(b.starts_at));
export const myGames = () => (store.me ? upcomingGames().filter((g) => gamePlayers(g.id).some((x) => x.player_id === store.me.id)) : []);

// ---- usterki i prośby do drużyn
export const openIssues = (cid) => store.data.court_issues.filter((i) => i.status === 'open' && (!cid || i.court_id === cid));
export const teamRequests = (tid) => store.data.team_requests.filter((r) => r.team_id === tid);
export const myTeamRequests = () => (store.me ? store.data.team_requests.filter((r) => r.player_id === store.me.id) : []);

// ---- KTO TERAZ GRA
export const presentNow = (cid) => store.data.court_presence
  .filter((x) => (!cid || x.court_id === cid) && T(x.at) > now() - RULES.PRESENCE_HOURS * H)
  .sort((a, b) => T(b.at) - T(a.at));
export const iAmPresent = (cid) => !!(store.me && presentNow(cid).some((x) => x.player_id === store.me.id));

// ---- powiadomienia, portfel
export const unreadCount = () => store.data.notifications.filter((n) => !n.read).length;
export const todayKey = () => { const d = new Date(now()); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
export const hasLedgerKey = (key) => store.data.coin_ledger.some((l) => l.key === key);
export function streakDays() {
  let n = 0;
  const day = (i) => { const d = new Date(now() - i * 24 * H); const p = (x) => String(x).padStart(2, '0'); return `daily:checkin:${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  let i = hasLedgerKey(day(0)) ? 0 : 1;
  while (hasLedgerKey(day(i))) { n++; i++; }
  return n;
}

// ---- statystyki zawodnika z zatwierdzonych meczów
export function playerTotals(pid) {
  const rows = store.data.match_stats.filter((m) => m.player_id === pid && m.status === 'approved');
  const sum = {};
  let best = 0;
  for (const r of rows) for (const [k, v] of Object.entries(r.stats || {})) {
    sum[k] = (sum[k] || 0) + Number(v || 0);
    if (k === 'pts' || k === 'goals') best = Math.max(best, Number(v || 0));
  }
  return { n: rows.length, sum, best };
}
export function playerRecord(pid) {
  const played = store.data.challenge_players.filter((x) => x.player_id === pid && x.checked_in_at);
  let w = 0;
  for (const x of played) {
    const c = store.data.challenges.find((ch) => ch.id === x.challenge_id);
    if (c && WIN_STATUSES.includes(c.status) && c.winner_team_id === x.team_id) w++;
  }
  return { played: played.length, w, pct: played.length ? Math.round((100 * w) / played.length) : null };
}

// ---- ODZNAKI: wartości liczone z danych gry
export function badgeMetrics(p) {
  const d = store.data;
  const rec = playerRecord(p.id);
  const tid = p.team_id;
  const hist = tid ? d.court_history.filter((h) => h.team_id === tid) : [];
  return {
    checkins: p.checkins || 0,
    wins: rec.w,
    played: rec.played,
    defenses: hist.filter((h) => h.event === 'defend').length,
    captures: hist.filter((h) => h.event === 'capture').length,
    best: playerTotals(p.id).best,
    games: d.games.filter((g) => g.host_id === p.id && g.status === 'open' && T(g.starts_at) < now()).length,
    opinions: d.court_ratings.filter((r) => r.player_id === p.id).length,
    referrals: d.profiles.filter((x) => x.invited_by === p.id).length,
    drops: d.drops.filter((x) => x.claimed_by === p.id).length,
  };
}
export function badgesOf(p) {
  const m = badgeMetrics(p);
  return BADGES.map((b) => {
    const v = m[b.metric] || 0;
    const tier = b.tiers.filter((t) => v >= t).length;          // 0 = jeszcze nie zdobyta
    return { ...b, value: v, tier, next: b.tiers[tier] ?? null };
  });
}
export const specialBadges = (pid) => store.data.player_badges.filter((b) => b.player_id === pid);

// ---- SEZON: punkty drużyn w bieżącym sezonie
export function seasonStandings(sport, at = now()) {
  const se = seasonAt(at);
  const inSeason = (t) => T(t) >= se.start && T(t) < se.end;
  const rows = store.data.teams.filter((tm) => tm.sport === sport).map((tm) => {
    const wins = store.data.challenges.filter((c) => WIN_STATUSES.includes(c.status) && c.winner_team_id === tm.id && inSeason(c.resolved_at)).length;
    const h = store.data.court_history.filter((x) => x.team_id === tm.id && inSeason(x.at));
    const cnt = (e) => h.filter((x) => x.event === e).length;
    const pts = wins * SEASON_POINTS.win + cnt('capture') * SEASON_POINTS.capture + cnt('defend') * SEASON_POINTS.defend + cnt('claim') * SEASON_POINTS.claim;
    return { team: tm, pts, wins, captures: cnt('capture'), defends: cnt('defend'), claims: cnt('claim') };
  });
  rows.sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.team.name.localeCompare(b.team.name));
  rows.forEach((r, i) => (r.pos = i + 1));
  return { season: se, rows };
}
// królowie strzelców sezonu (z zatwierdzonych statystyk)
export function seasonScorers(sport, at = now()) {
  const se = seasonAt(at);
  const key = STAT_KEYS[sport][0];
  const by = {};
  for (const m of store.data.match_stats) {
    if (m.status !== 'approved') continue;
    const c = store.data.challenges.find((x) => x.id === m.challenge_id);
    const p = profileById(m.player_id);
    if (!c || !p || p.sport !== sport || !(T(c.scheduled_at) >= se.start && T(c.scheduled_at) < se.end)) continue;
    by[p.id] = by[p.id] || { p, total: 0, n: 0 };
    by[p.id].total += Number(m.stats?.[key] || 0); by[p.id].n++;
  }
  return Object.values(by).sort((a, b) => b.total - a.total).slice(0, 5);
}
export const backers = (chid) => store.data.challenge_backers.filter((b) => b.challenge_id === chid);
