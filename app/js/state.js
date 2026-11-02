// Wspólny stan aplikacji + selektory
import { api } from './api/index.js';
import { t, has } from './i18n.js';
import { toast } from './ui.js';
import { OPEN_STATUSES, WIN_STATUSES } from './rules.js';

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
