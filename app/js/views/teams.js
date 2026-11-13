// Zakładka DRUŻYNY: ranking, profil drużyny, skład
import { t } from '../i18n.js';
import { playerOvr, tier, teamRating } from '../skills.js';
import { SPORTS, SPORT_ICON } from '../rules.js';
import { esc, bind, modal, teamTag, fmtDate, confirmBox } from '../ui.js';
import {
  store, act, teamById, members, courtsOf, teamRecord, myTeam, isCaptainOf, teamChallenges, courtName,
  ui, setSport, sportOk, standings, teamRequests, profileById,
} from '../state.js';
import { challengeCard, challengeHandlers } from './matches.js';

let sortMode = 'rank', query = '', inviteQ = '';

export function playerMini(p, team) {
  const o = playerOvr(p, team ? team.sport : p.sport);
  const cap = team && team.captain_id === p.id;
  return `<a class="pmini" href="#/player/${esc(p.id)}">
    <div class="ovr ${tier(o)}">${o ?? '—'}</div>
    <div class="pmini-body">
      <div class="pmini-name">${esc(p.nick)} ${cap ? `<span class="badge cap" title="${t('captain')}">C</span>` : ''}</div>
      <div class="small muted">${esc(p.position || '—')}${p.number != null ? ' · #' + p.number : ''}${p.height_cm ? ' · ' + p.height_cm + ' cm' : ''}</div>
    </div>
    <div class="pmini-badges">
      ${p.skills_status === 'pending' ? `<span class="badge wait" title="${t('skills_pending')}">⏳</span>` : ''}
      ${p.ghost_count ? `<span class="badge ghost" title="${t('ghost_count')}">👻${p.ghost_count}</span>` : ''}
    </div></a>`;
}

function teamCard(tm, rank) {
  const ms = members(tm.id);
  const rec = teamRecord(tm.id);
  const courts = courtsOf(tm.id).length;
  const rating = teamRating(ms, tm.sport);
  return `<a class="tcard" href="#/team/${esc(tm.id)}" style="--c:${esc(tm.color)}">
    <div class="tcard-rank">${rank}</div>
    <div class="tcard-body">
      <div class="tcard-name">${SPORT_ICON[tm.sport]} ${esc(tm.name)} ${teamTag(tm)}</div>
      <div class="small muted">👥 ${ms.length} · 👑 ${courts} · ${rec.w}W-${rec.l}L</div>
    </div>
    <div class="tcard-rating" title="${t('rating_temp')}"><div class="small muted">${t('rating')}</div><b>${rating ?? '—'}</b></div>
  </a>`;
}

export function renderTeams(root) {
  // pozycja = miejsce w tabeli swojego sportu
  const pos = {};
  SPORTS.forEach((s) => standings(s).forEach((r) => (pos[r.team.id] = r.pos)));
  const teams = store.data.teams.filter((tm) => sportOk(tm.sport));
  if (sortMode === 'rank') teams.sort((a, b) => pos[a.id] - pos[b.id] || a.sport.localeCompare(b.sport));
  else if (sortMode === 'rating') teams.sort((a, b) => (teamRating(members(b.id), b.sport) ?? 0) - (teamRating(members(a.id), a.sport) ?? 0));
  else teams.sort((a, b) => a.name.localeCompare(b.name));
  const q = query.trim().toLowerCase();
  const list = teams.filter((x) => !q || x.name.toLowerCase().includes(q) || x.tag.toLowerCase().includes(q));
  const mine = myTeam();

  root.innerHTML = `
    <div class="page-head"><h1>${t('nav_teams')}</h1>
      ${store.me && !mine ? `<button class="btn primary" data-act="create">+ ${t('create_team')}</button>` : ''}
      ${mine ? `<a class="btn" href="#/team/${esc(mine.id)}">${t('my_team')}: ${teamTag(mine)}</a>` : ''}</div>
    <div class="toolbar">
      <input type="search" id="tq" placeholder="${t('search_team')}" value="${esc(query)}">
      <div class="seg">${['rank', 'rating', 'az'].map((m) => `<button data-act="sort" data-m="${m}" class="${sortMode === m ? 'on' : ''}">${t('sort_' + m)}</button>`).join('')}</div>
    </div>
    <div class="seg wide">${['all', ...SPORTS].map((s) => `<button data-act="sport" data-s="${s}" class="${ui.sport === s ? 'on' : ''}">${s === 'all' ? t('all') : SPORT_ICON[s] + ' ' + t('sport_' + s)}</button>`).join('')}</div>
    <div class="tlist">${list.map((tm) => teamCard(tm, pos[tm.id])).join('') || `<p class="muted">${t('no_teams')}</p>`}</div>
    <p class="small muted center"><a href="#/table">📊 ${t('see_table')}</a></p>`;

  const input = root.querySelector('#tq');
  input.oninput = () => { query = input.value; renderTeams(root); const i = root.querySelector('#tq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  bind(root, {
    sort: (d) => { sortMode = d.m; renderTeams(root); },
    sport: (d) => { setSport(d.s); renderTeams(root); },
    create: openCreateTeam,
  });
}

const COLORS = ['#ff7a1a', '#ffd23f', '#2ec4b6', '#3a86ff', '#9b5de5', '#f15bb5', '#ef233c', '#06d6a0', '#ffffff'];

function openCreateTeam() {
  modal(`<h3>${t('create_team')}</h3>
    <label>${t('team_name')}<input id="tn" maxlength="40" placeholder="np. Mokotów Ballers"></label>
    <label>${t('team_tag')}<input id="tt" maxlength="4" placeholder="MKB" style="text-transform:uppercase"></label>
    <div class="label">${t('sport')}</div>
    <div class="seg wide" id="sp">${SPORTS.map((s, i) => `<button data-s="${s}" class="${(store.me?.sport || 'basketball') === s ? 'on' : ''}">${SPORT_ICON[s]} ${t('sport_' + s)}</button>`).join('')}</div>
    <div class="label">${t('team_color')}</div>
    <div class="colors">${COLORS.map((c, i) => `<button class="sw ${i === 0 ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
    <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('create')}</button></div>`,
  (m, close) => {
    let color = COLORS[0];
    let sport = store.me?.sport || 'basketball';
    m.querySelectorAll('#sp button').forEach((b) => (b.onclick = () => { m.querySelectorAll('#sp button').forEach((x) => x.classList.toggle('on', x === b)); sport = b.dataset.s; }));
    m.querySelectorAll('.sw').forEach((b) => (b.onclick = () => { m.querySelectorAll('.sw').forEach((x) => x.classList.remove('on')); b.classList.add('on'); color = b.dataset.c; }));
    m.querySelector('#ok').onclick = async () => {
      const id = await act('create_team', { p_name: m.querySelector('#tn').value, p_tag: m.querySelector('#tt').value, p_color: color, p_sport: sport }, 'ok_team_created');
      if (id) { close(); location.hash = '#/team/' + id; }
    };
  });
}

export function renderTeam(root, id) {
  const tm = teamById(id);
  if (!tm) { root.innerHTML = `<p class="muted">${t('not_found')}</p>`; return; }
  const ms = members(tm.id);
  const rec = teamRecord(tm.id);
  const courts = courtsOf(tm.id);
  const rating = teamRating(ms, tm.sport);
  const row = standings(tm.sport).find((r) => r.team.id === tm.id);
  const me = store.me;
  const isMember = me && me.team_id === tm.id;
  const cap = isCaptainOf(tm.id);
  const matches = teamChallenges(tm.id).slice(0, 8);

  // dołączanie: zgoda obu stron (gracz prosi → kapitan akceptuje, albo kapitan zaprasza → gracz akceptuje)
  const reqs = teamRequests(tm.id);
  const mineReq = me ? reqs.find((r) => r.player_id === me.id) : null;
  let joinUi = '';
  if (me && !me.team_id) {
    if (!mineReq) joinUi = `<button class="btn primary" data-act="join">✋ ${t('ask_to_join')}</button>`;
    else if (mineReq.kind === 'request') joinUi = `<span class="pill">⏳ ${t('request_sent')}</span><button class="btn ghost small" data-act="req-no" data-id="${esc(me.id)}">${t('withdraw')}</button>`;
    else joinUi = `<span class="pill ok">📩 ${t('you_are_invited')}</span><button class="btn primary" data-act="req-yes" data-id="${esc(me.id)}">${t('accept_invite')}</button><button class="btn ghost" data-act="req-no" data-id="${esc(me.id)}">${t('decline')}</button>`;
  } else if (!me) joinUi = `<a class="btn primary" href="#/login/register">✋ ${t('ask_to_join')}</a>`;
  const ql = inviteQ.trim().toLowerCase();
  const candidates = cap && ql.length >= 2 ? store.data.profiles.filter((p) => !p.team_id && p.nick.toLowerCase().includes(ql) && !reqs.some((r) => r.player_id === p.id)).slice(0, 6) : [];
  const capUi = cap ? `
    <h3>📥 ${t('join_requests')} (${reqs.filter((r) => r.kind === 'request').length})</h3>
    ${reqs.filter((r) => r.kind === 'request').map((r) => { const p = profileById(r.player_id); return p ? `<div class="roster-item">${playerMini(p, null)}
      <button class="btn small primary" data-act="req-yes" data-id="${esc(p.id)}">✔</button><button class="btn small ghost danger" data-act="req-no" data-id="${esc(p.id)}">✕</button></div>` : ''; }).join('') || `<p class="muted small">${t('none')}</p>`}
    <h3>📩 ${t('invite_player')}</h3>
    <input type="search" id="iq" placeholder="${t('search_player')}" value="${esc(inviteQ)}">
    ${candidates.map((p) => `<div class="roster-item">${playerMini(p, null)}<button class="btn small primary" data-act="invite" data-id="${esc(p.id)}">${t('invite')}</button></div>`).join('')}
    ${reqs.filter((r) => r.kind === 'invite').map((r) => { const p = profileById(r.player_id); return p ? `<div class="roster-item">${playerMini(p, null)}<span class="pill">⏳ ${t('invited')}</span>
      <button class="btn small ghost" data-act="req-no" data-id="${esc(p.id)}">${t('withdraw')}</button></div>` : ''; }).join('')}` : '';

  root.innerHTML = `
    <a class="back" href="#/teams">← ${t('nav_teams')}</a>
    <div class="team-hero" style="--c:${esc(tm.color)}">
      <div class="team-logo">${esc(tm.tag)}</div>
      <div><h1>${esc(tm.name)}</h1>
        <div class="small"><b>${SPORT_ICON[tm.sport]} ${t('sport_' + tm.sport)}</b> · <a href="#/table">#${row?.pos ?? '—'} ${t('in_table')}</a></div>
        <div class="muted small">${t('captain')}: ${esc(ms.find((p) => p.id === tm.captain_id)?.nick || '—')} · ${t('since')} ${fmtDate(tm.created_at)}</div></div>
    </div>
    <div class="stats">
      <div class="stat"><b>${rating ?? '—'}</b><span>${t('rating')}<sup title="${t('rating_temp')}">*</sup></span></div>
      <div class="stat"><b>${courts.length}</b><span>👑 ${t('courts_held')}</span></div>
      <div class="stat"><b>${row?.zones ?? 0}</b><span>🚩 ${t('zones')}</span></div>
      <div class="stat"><b>${rec.w}-${rec.l}</b><span>${t('record')}</span></div>
      <div class="stat"><b>${ms.length}</b><span>${t('players')}</span></div>
    </div>
    <div class="row">
      ${joinUi}
      ${isMember ? `<button class="btn ghost danger" data-act="leave">${t('leave_team')}</button>` : ''}
    </div>
    <h3>${t('roster')}</h3>
    <div class="roster">${ms.map((p) => `<div class="roster-item">${playerMini(p, tm)}
      ${cap && p.id !== me.id ? `<button class="icon-btn" data-act="kick" data-id="${esc(p.id)}" title="${t('kick')}">✕</button>` : ''}</div>`).join('')}</div>
    ${capUi}
    <h3>👑 ${t('courts_held')}</h3>
    ${courts.length ? `<ul class="clist">${courts.map((c) => `<li><a href="#/map/${esc(c.id)}">${esc(courtName(c))}</a> <span class="muted small">· ${t('defenses')}: ${c.defenses}</span></li>`).join('')}</ul>` : `<p class="muted">${t('no_courts')}</p>`}
    <h3>${t('recent_matches')}</h3>
    <div class="matches">${matches.map((c) => challengeCard(c, true)).join('') || `<p class="muted">${t('no_matches')}</p>`}</div>
    <p class="small muted">* ${t('rating_temp')}</p>`;

  const iq = root.querySelector('#iq');
  if (iq) iq.oninput = () => { inviteQ = iq.value; renderTeam(root, id); const i = root.querySelector('#iq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  bind(root, {
    ...challengeHandlers,
    join: () => act('request_join', { p_team: tm.id }, 'ok_request_sent'),
    'req-yes': (d) => act('respond_team_request', { p_team: tm.id, p_player: d.id, p_accept: true }, 'ok_joined'),
    'req-no': (d) => act('respond_team_request', { p_team: tm.id, p_player: d.id, p_accept: false }, 'ok_saved'),
    invite: (d) => act('invite_player', { p_player: d.id }, 'ok_invited'),
    leave: async () => { if (await confirmBox(t('leave_team_confirm'))) act('leave_team', {}, 'ok_left'); },
    kick: async (d) => { if (await confirmBox(t('kick') + '?')) act('kick_member', { p_player: d.id }, 'ok_saved'); },
  });
}

