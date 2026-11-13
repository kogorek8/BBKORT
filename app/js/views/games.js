// GRAMY? – otwarte gry: umów się na boisku, dołącz do innych
import { t } from '../i18n.js';
import { GAME_LEVELS, SPORTS, SPORT_ICON, distM } from '../rules.js';
import { geo } from '../geo.js';
import { esc, bind, modal, fmtDate, fmtDist, localInputValue, confirmBox } from '../ui.js';
import { store, act, now, courtById, courtName, profileById, gamePlayers, upcomingGames, ui, setSport } from '../state.js';

export function gameCard(g, showCourt = true) {
  const c = courtById(g.court_id);
  const ps = gamePlayers(g.id);
  const me = store.me;
  const inGame = me && ps.some((x) => x.player_id === me.id);
  const host = profileById(g.host_id);
  const full = ps.length >= g.slots;
  const d = geo.pos && c ? distM(geo.pos.lat, geo.pos.lng, c.lat, c.lng) : null;
  let btn = '';
  if (!me) btn = `<a class="btn small primary" href="#/login/register">${t('g_join')}</a>`;
  else if (g.host_id === me.id) btn = `<button class="btn small ghost danger" data-act="g-leave" data-id="${esc(g.id)}" data-host="1">${t('g_cancel')}</button>`;
  else if (inGame) btn = `<button class="btn small ghost" data-act="g-leave" data-id="${esc(g.id)}">${t('g_leave')}</button>`;
  else if (!full) btn = `<button class="btn small primary" data-act="g-join" data-id="${esc(g.id)}">✋ ${t('g_join')}</button>`;
  return `<div class="gcard ${inGame ? 'mine' : ''}">
    <div class="gcard-time"><b>${fmtDate(g.starts_at)}</b>${g.level !== 'all' ? `<span class="pill">${t('lvl_' + g.level)}</span>` : ''}</div>
    ${showCourt ? `<a class="gcard-court" href="#/map/${esc(g.court_id)}">${SPORT_ICON[g.sport] || ''} ${esc(courtName(c))}${d != null ? ` <span class="muted small">· ${fmtDist(d)}</span>` : ''}</a>` : ''}
    ${g.note ? `<div class="small gnote">„${esc(g.note)}”</div>` : ''}
    <div class="gcard-foot">
      <div class="small"><b class="${full ? 'warn' : ''}">${ps.length}/${g.slots}</b> ${t('g_players')} · ${t('g_host')}: ${esc(host?.nick || '?')}
        <div class="side-players">${ps.slice(0, 8).map((x) => `<span class="chip ${me && x.player_id === me.id ? 'in' : ''}">${esc(profileById(x.player_id)?.nick || '?')}</span>`).join('')}${ps.length > 8 ? `<span class="chip">+${ps.length - 8}</span>` : ''}</div></div>
      ${btn}
    </div></div>`;
}

export const gameHandlers = {
  'g-join': (d) => act('join_game', { p_game: d.id }, 'ok_g_joined'),
  'g-leave': async (d) => { if (!d.host || await confirmBox(t('g_cancel_q'))) act('leave_game', { p_game: d.id }, d.host ? 'ok_g_cancelled' : 'ok_saved'); },
};

export function openCreateGame(courtId) {
  if (!store.me) { location.hash = '#/login/register'; return; }
  const c = courtById(courtId);
  const start = new Date(now() + 2 * 3600e3); start.setMinutes(0, 0, 0);
  modal(`<h3>🤝 ${t('g_create')}</h3>
    <p class="muted">${SPORT_ICON[c.sport]} ${esc(courtName(c))}</p>
    <label>${t('g_when')}<input type="datetime-local" id="gt" value="${localInputValue(start.getTime())}"></label>
    <div class="row2"><label>${t('g_slots')}<input type="number" id="gs" min="2" max="40" value="${c.sport === 'football' ? 10 : 6}"></label>
    <label>${t('g_level')}<select id="gl">${GAME_LEVELS.map((l) => `<option value="${l}">${t('lvl_' + l)}</option>`).join('')}</select></label></div>
    <label>${t('g_note')}<input id="gn" maxlength="200" placeholder="${t('g_note_ph')}"></label>
    <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('g_publish')}</button></div>`,
  (m, close) => {
    m.querySelector('#ok').onclick = async () => {
      const ok = await act('create_game', { p_court: courtId, p_time: new Date(m.querySelector('#gt').value).toISOString(),
        p_slots: parseInt(m.querySelector('#gs').value, 10), p_level: m.querySelector('#gl').value, p_note: m.querySelector('#gn').value }, 'ok_g_created');
      if (ok) close();
    };
  });
}

export function renderGames(root) {
  const list = upcomingGames();
  const me = store.me;
  const mine = me ? list.filter((g) => gamePlayers(g.id).some((x) => x.player_id === me.id)) : [];
  const others = list.filter((g) => !mine.includes(g));
  root.innerHTML = `
    <div class="page-head"><h1>🤝 ${t('games_title')}</h1></div>
    <p class="muted">${t('games_intro')}</p>
    <div class="toolbar"><div class="seg">${['all', ...SPORTS].map((s) => `<button data-act="sport" data-s="${s}" class="${ui.sport === s ? 'on' : ''}">${s === 'all' ? t('all') : SPORT_ICON[s]}</button>`).join('')}</div>
      <a class="btn primary" href="#/map">＋ ${t('g_create')}</a></div>
    <p class="small muted">${t('g_create_hint')}</p>
    ${mine.length ? `<h3>✅ ${t('g_mine')}</h3><div class="matches">${mine.map((g) => gameCard(g)).join('')}</div>` : ''}
    <h3>📅 ${t('g_open')}</h3>
    <div class="matches">${others.map((g) => gameCard(g)).join('') || `<p class="muted">${t('g_none')}</p>`}</div>`;
  bind(root, { ...gameHandlers, sport: (d) => { setSport(d.s); renderGames(root); } });
}
