// Wspólny stan aplikacji + selektory
import { api } from './api/index.js';
import { t, has } from './i18n.js';
import { toast } from './ui.js';
import { OPEN_STATUSES, WIN_STATUSES, ZONE_LAT, ZONE_LNG, COURT_CRITERIA } from './rules.js';
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
  store.data = await api.load();
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
