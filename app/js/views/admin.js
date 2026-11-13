// PANEL (admin + moderatorzy): wyniki do zatwierdzenia, skille, moderatorzy, narzędzia demo
import { api } from '../api/index.js';
import { t } from '../i18n.js';
import { H } from '../rules.js';
import { ovr, tier, skillsOf } from '../skills.js';
import { esc, bind, teamTag, fmtDate, fmtLeft, confirmBox } from '../ui.js';
import { store, act, teamById, isAdmin, isStaff, teamChallenges, now, T } from '../state.js';
import { skillBars } from './player.js';
import { challengeCard, challengeHandlers } from './matches.js';

let tab = 'results', q = '';

const recentLine = (p) => {
  if (!p.team_id) return `<span class="muted">${t('free_agent')}</span>`;
  const ms = teamChallenges(p.team_id).filter((c) => c.winner_team_id).slice(0, 5);
  return ms.map((c) => `<span class="res ${c.winner_team_id === p.team_id ? 'w' : 'l'}">${c.winner_team_id === p.team_id ? 'W' : 'L'}</span>`).join('') || `<span class="muted">${t('no_matches')}</span>`;
};

function resultsTab() {
  const toApprove = store.data.challenges.filter((c) => c.status === 'reported').sort((a, b) => T(a.scheduled_at) - T(b.scheduled_at));
  const noRef = store.data.challenges.filter((c) => ['pending', 'accepted'].includes(c.status) && !c.referee_id).sort((a, b) => T(a.scheduled_at) - T(b.scheduled_at));
  const mine = store.data.challenges.filter((c) => c.status === 'accepted' && c.referee_id === store.me.id);
  return `
    <h3>📝 ${t('results_to_approve')} (${toApprove.length})</h3>
    ${toApprove.length ? `<div class="matches">${toApprove.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${t('queue_empty')}</p>`}
    <h3>🧑‍⚖️ ${t('my_refereeing')} (${mine.length})</h3>
    ${mine.length ? `<div class="matches">${mine.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${t('none')}</p>`}
    <h3>⚠️ ${t('need_referee')} (${noRef.length})</h3>
    ${noRef.length ? `<div class="matches">${noRef.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${t('none')}</p>`}`;
}

function skillsTab() {
  const queue = store.data.profiles.filter((p) => p.skills_status === 'pending')
    .sort((a, b) => T(a.skills_submitted_at) - T(b.skills_submitted_at));
  if (!queue.length) return `<p class="muted small">${t('queue_empty')}</p>`;
  return queue.map((p) => {
    const tm = teamById(p.team_id);
    const sport = p.skills_pending_sport || p.sport;
    const old = skillsOf(p, sport);
    return `<div class="review">
      <div class="review-head">
        <a href="#/player/${esc(p.id)}"><b>${esc(p.nick)}</b></a> ${teamTag(tm)} <span class="muted small">${t('sport_' + sport)} · ${esc(p.position || '')} · ${fmtDate(p.skills_submitted_at)}</span>
        <div class="review-ovr"><span class="ovr ${tier(ovr(old, sport, p.position))}">${ovr(old, sport, p.position) ?? '—'}</span> → <span class="ovr ${tier(ovr(p.skills_pending, sport, p.position))}">${ovr(p.skills_pending, sport, p.position)}</span></div>
      </div>
      <div class="small">${t('last_results')}: ${recentLine(p)} ${p.ghost_count ? ` · 👻 ×${p.ghost_count}` : ''}</div>
      ${p.skills_video ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${esc(p.skills_video)}">🎬 ${t('video')}</a>` : `<span class="small muted">${t('no_video')}</span>`}
      <details><summary>${t('show_diff')}</summary><div class="skills">${skillBars(p.skills_pending, old, sport)}</div></details>
      <input class="note" placeholder="${t('admin_note')}" id="note-${esc(p.id)}">
      <div class="row"><button class="btn primary" data-act="approve" data-id="${esc(p.id)}">✔ ${t('approve')}</button>
      <button class="btn ghost danger" data-act="reject" data-id="${esc(p.id)}">✖ ${t('reject')}</button></div>
    </div>`;
  }).join('');
}

function modsTab() {
  const ql = q.trim().toLowerCase();
  const people = store.data.profiles
    .filter((p) => !p.is_admin && (p.is_moderator || (ql && p.nick.toLowerCase().includes(ql))))
    .sort((a, b) => Number(b.is_moderator) - Number(a.is_moderator) || a.nick.localeCompare(b.nick));
  return `<p class="small muted">${t('mods_hint')}</p>
    <input type="search" id="mq" placeholder="${t('search_player')}" value="${esc(q)}">
    <div class="ulist">${people.map((p) => `<div class="uitem row-between">
      <span><b>${esc(p.nick)}</b> ${teamTag(teamById(p.team_id))} ${p.is_moderator ? `<span class="pill ok">🧑‍⚖️ ${t('moderator')}</span>` : ''}</span>
      <button class="btn small ${p.is_moderator ? 'ghost danger' : 'primary'}" data-act="mod" data-id="${esc(p.id)}" data-on="${p.is_moderator ? '0' : '1'}">${p.is_moderator ? t('remove_mod') : t('make_mod')}</button>
    </div>`).join('') || `<p class="muted small">${t('type_to_search')}</p>`}</div>`;
}

function demoTab() {
  return `<div class="review">
    <p class="small muted">${t('demo_tools_hint')}</p>
    <div class="small">${t('demo_time')}: <b>${fmtDate(new Date(now()).toISOString())}</b>${api.demo.timeOffset() ? ` (+${fmtLeft(api.demo.timeOffset())})` : ''}</div>
    <div class="row"><button class="btn small" data-act="shift" data-h="0.5">+30 min</button>
      <button class="btn small" data-act="shift" data-h="1">+1 h</button>
      <button class="btn small" data-act="shift" data-h="48">+48 h</button></div>
    <label class="check"><input type="checkbox" id="fakegps" ${api.demo.fakeGps() ? 'checked' : ''}> ${t('demo_fake_gps')}</label>
    <button class="btn ghost danger small" data-act="reset">${t('demo_reset')}</button>
  </div>`;
}

export function renderAdmin(root) {
  if (!isStaff()) { root.innerHTML = `<p class="muted">${t('err_not_staff')}</p>`; return; }
  const tabs = [['results', '📝 ' + t('tab_results')], ['skills', '⏳ ' + t('tab_skills')],
    ...(isAdmin() ? [['mods', '🧑‍⚖️ ' + t('tab_mods')]] : []), ...(api.mode === 'demo' ? [['demo', '🧪 Demo']] : [])];
  if (!tabs.some(([k]) => k === tab)) tab = 'results';
  const body = { results: resultsTab, skills: skillsTab, mods: modsTab, demo: demoTab }[tab]();

  root.innerHTML = `
    <div class="page-head"><h1>🛠️ ${t('nav_admin')}</h1><span class="muted small">${isAdmin() ? 'Admin' : t('moderator')}</span></div>
    <div class="seg wide tabs">${tabs.map(([k, l]) => `<button data-act="tab" data-v="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${body}`;

  const fg = root.querySelector('#fakegps');
  if (fg) fg.onchange = () => api.demo.setFakeGps(fg.checked);
  const mq = root.querySelector('#mq');
  if (mq) mq.oninput = () => { q = mq.value; renderAdmin(root); const i = root.querySelector('#mq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  const note = (id) => root.querySelector('#note-' + CSS.escape(id))?.value || '';
  bind(root, {
    ...challengeHandlers,
    tab: (d) => { tab = d.v; renderAdmin(root); },
    approve: (d) => act('review_skills', { p_player: d.id, p_approve: true, p_note: note(d.id) }, 'ok_approved'),
    reject: (d) => act('review_skills', { p_player: d.id, p_approve: false, p_note: note(d.id) }, 'ok_rejected'),
    mod: (d) => act('admin_set_moderator', { p_player: d.id, p_on: d.on === '1' }, 'ok_saved'),
    shift: (d) => api.demo.shiftTime(Number(d.h) * H),
    reset: async () => { if (await confirmBox(t('demo_reset') + '?')) api.demo.reset(); },
  });
}
