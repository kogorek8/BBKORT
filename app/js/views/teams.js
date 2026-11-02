// Zakładka DRUŻYNY: ranking, profil drużyny, skład
import { t } from '../i18n.js';
import { ovr, tier, teamRating } from '../skills.js';
import { esc, bind, modal, teamTag, fmtDate, confirmBox } from '../ui.js';
import {
  store, act, teamById, members, courtsOf, teamRecord, myTeam, isCaptainOf, teamChallenges, courtName,
} from '../state.js';
import { challengeCard, challengeHandlers } from './matches.js';

let sortMode = 'rank', query = '';

export function playerMini(p, team) {
  const o = ovr(p.skills);
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
  const rating = teamRating(ms);
  return `<a class="tcard" href="#/team/${esc(tm.id)}" style="--c:${esc(tm.color)}">
    <div class="tcard-rank">${rank}</div>
    <div class="tcard-body">
      <div class="tcard-name">${esc(tm.name)} ${teamTag(tm)}</div>
      <div class="small muted">👥 ${ms.length} · 👑 ${courts} · ${rec.w}W-${rec.l}L</div>
    </div>
    <div class="tcard-rating" title="${t('rating_temp')}"><div class="small muted">${t('rating')}</div><b>${rating ?? '—'}</b></div>
  </a>`;
}

export function renderTeams(root) {
  const teams = [...store.data.teams];
  const score = (tm) => courtsOf(tm.id).length * 1000 + teamRecord(tm.id).w * 10 - teamRecord(tm.id).l;
  if (sortMode === 'rank') teams.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  else if (sortMode === 'rating') teams.sort((a, b) => (teamRating(members(b.id)) ?? 0) - (teamRating(members(a.id)) ?? 0));
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
    <div class="tlist">${list.map((tm) => teamCard(tm, teams.indexOf(tm) + 1)).join('') || `<p class="muted">${t('no_teams')}</p>`}</div>`;

  const input = root.querySelector('#tq');
  input.oninput = () => { query = input.value; renderTeams(root); const i = root.querySelector('#tq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  bind(root, {
    sort: (d) => { sortMode = d.m; renderTeams(root); },
    create: openCreateTeam,
  });
}

const COLORS = ['#ff7a1a', '#ffd23f', '#2ec4b6', '#3a86ff', '#9b5de5', '#f15bb5', '#ef233c', '#06d6a0', '#ffffff'];

function openCreateTeam() {
  modal(`<h3>${t('create_team')}</h3>
    <label>${t('team_name')}<input id="tn" maxlength="40" placeholder="np. Mokotów Ballers"></label>
    <label>${t('team_tag')}<input id="tt" maxlength="4" placeholder="MKB" style="text-transform:uppercase"></label>
    <div class="label">${t('team_color')}</div>
    <div class="colors">${COLORS.map((c, i) => `<button class="sw ${i === 0 ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
    <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('create')}</button></div>`,
  (m, close) => {
    let color = COLORS[0];
    m.querySelectorAll('.sw').forEach((b) => (b.onclick = () => { m.querySelectorAll('.sw').forEach((x) => x.classList.remove('on')); b.classList.add('on'); color = b.dataset.c; }));
    m.querySelector('#ok').onclick = async () => {
      const id = await act('create_team', { p_name: m.querySelector('#tn').value, p_tag: m.querySelector('#tt').value, p_color: color }, 'ok_team_created');
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
  const rating = teamRating(ms);
  const me = store.me;
  const isMember = me && me.team_id === tm.id;
  const cap = isCaptainOf(tm.id);
  const matches = teamChallenges(tm.id).slice(0, 8);

  root.innerHTML = `
    <a class="back" href="#/teams">← ${t('nav_teams')}</a>
    <div class="team-hero" style="--c:${esc(tm.color)}">
      <div class="team-logo">${esc(tm.tag)}</div>
      <div><h1>${esc(tm.name)}</h1>
        <div class="muted small">${t('captain')}: ${esc(ms.find((p) => p.id === tm.captain_id)?.nick || '—')} · ${t('since')} ${fmtDate(tm.created_at)}</div></div>
    </div>
    <div class="stats">
      <div class="stat"><b>${rating ?? '—'}</b><span>${t('rating')}<sup title="${t('rating_temp')}">*</sup></span></div>
      <div class="stat"><b>${courts.length}</b><span>👑 ${t('courts_held')}</span></div>
      <div class="stat"><b>${rec.w}-${rec.l}</b><span>${t('record')}</span></div>
      <div class="stat"><b>${ms.length}</b><span>${t('players')}</span></div>
    </div>
    <div class="row">
      ${me && !me.team_id ? `<button class="btn primary" data-act="join">${t('join_team')}</button>` : ''}
      ${isMember ? `<button class="btn ghost danger" data-act="leave">${t('leave_team')}</button>` : ''}
    </div>
    <h3>${t('roster')}</h3>
    <div class="roster">${ms.map((p) => `<div class="roster-item">${playerMini(p, tm)}
      ${cap && p.id !== me.id ? `<button class="icon-btn" data-act="kick" data-id="${esc(p.id)}" title="${t('kick')}">✕</button>` : ''}</div>`).join('')}</div>
    <h3>👑 ${t('courts_held')}</h3>
    ${courts.length ? `<ul class="clist">${courts.map((c) => `<li><a href="#/map/${esc(c.id)}">${esc(courtName(c))}</a> <span class="muted small">· ${t('defenses')}: ${c.defenses}</span></li>`).join('')}</ul>` : `<p class="muted">${t('no_courts')}</p>`}
    <h3>${t('recent_matches')}</h3>
    <div class="matches">${matches.map((c) => challengeCard(c, true)).join('') || `<p class="muted">${t('no_matches')}</p>`}</div>
    <p class="small muted">* ${t('rating_temp')}</p>`;

  bind(root, {
    ...challengeHandlers,
    join: () => act('join_team', { p_team: tm.id }, 'ok_joined'),
    leave: async () => { if (await confirmBox(t('leave_team_confirm'))) act('leave_team', {}, 'ok_left'); },
    kick: async (d) => { if (await confirmBox(t('kick') + '?')) act('kick_member', { p_player: d.id }, 'ok_saved'); },
  });
}

