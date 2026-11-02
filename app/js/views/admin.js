// Panel ADMINA: akceptacja skilli, spory o wynik, narzędzia demo
import { api } from '../api/index.js';
import { t } from '../i18n.js';
import { H } from '../rules.js';
import { ovr, tier } from '../skills.js';
import { esc, bind, teamTag, fmtDate, fmtLeft, confirmBox } from '../ui.js';
import { store, act, teamById, isAdmin, teamChallenges, now, T } from '../state.js';
import { skillBars } from './player.js';
import { challengeCard, challengeHandlers } from './matches.js';

const recentLine = (p) => {
  if (!p.team_id) return `<span class="muted">${t('free_agent')}</span>`;
  const ms = teamChallenges(p.team_id).filter((c) => c.winner_team_id).slice(0, 5);
  return ms.map((c) => `<span class="res ${c.winner_team_id === p.team_id ? 'w' : 'l'}">${c.winner_team_id === p.team_id ? 'W' : 'L'}</span>`).join('') || `<span class="muted">${t('no_matches')}</span>`;
};

export function renderAdmin(root) {
  if (!isAdmin()) { root.innerHTML = `<p class="muted">${t('err_not_admin')}</p>`; return; }
  const queue = store.data.profiles.filter((p) => p.skills_status === 'pending')
    .sort((a, b) => T(a.skills_submitted_at) - T(b.skills_submitted_at));
  const disputes = store.data.challenges.filter((c) => c.status === 'disputed');

  root.innerHTML = `
    <div class="page-head"><h1>🛠️ ${t('nav_admin')}</h1></div>
    <h3>⏳ ${t('skills_queue')} (${queue.length})</h3>
    ${queue.length ? queue.map((p) => {
      const tm = teamById(p.team_id);
      return `<div class="review">
        <div class="review-head">
          <a href="#/player/${esc(p.id)}"><b>${esc(p.nick)}</b></a> ${teamTag(tm)} <span class="muted small">${esc(p.position || '')} · ${fmtDate(p.skills_submitted_at)}</span>
          <div class="review-ovr"><span class="ovr ${tier(ovr(p.skills))}">${ovr(p.skills) ?? '—'}</span> → <span class="ovr ${tier(ovr(p.skills_pending))}">${ovr(p.skills_pending)}</span></div>
        </div>
        <div class="small">${t('last_results')}: ${recentLine(p)} ${p.ghost_count ? ` · 👻 ×${p.ghost_count}` : ''}</div>
        ${p.skills_video ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${esc(p.skills_video)}">🎬 ${t('video')}</a>` : `<span class="small muted">${t('no_video')}</span>`}
        <details><summary>${t('show_diff')}</summary><div class="skills">${skillBars(p.skills_pending, p.skills)}</div></details>
        <input class="note" placeholder="${t('admin_note')}" id="note-${esc(p.id)}">
        <div class="row"><button class="btn primary" data-act="approve" data-id="${esc(p.id)}">✔ ${t('approve')}</button>
        <button class="btn ghost danger" data-act="reject" data-id="${esc(p.id)}">✖ ${t('reject')}</button></div>
      </div>`;
    }).join('') : `<p class="muted small">${t('queue_empty')}</p>`}

    <h3>⚖️ ${t('disputes')} (${disputes.length})</h3>
    ${disputes.length ? `<div class="matches">${disputes.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${t('no_disputes')}</p>`}

    ${api.mode === 'demo' ? `
    <h3>🧪 ${t('demo_tools')}</h3>
    <div class="review">
      <p class="small muted">${t('demo_tools_hint')}</p>
      <div class="small">${t('demo_time')}: <b>${fmtDate(new Date(now()).toISOString())}</b>${api.demo.timeOffset() ? ` (+${fmtLeft(api.demo.timeOffset())})` : ''}</div>
      <div class="row"><button class="btn small" data-act="shift" data-h="0.5">+30 min</button>
        <button class="btn small" data-act="shift" data-h="1">+1 h</button>
        <button class="btn small" data-act="shift" data-h="24">+24 h</button></div>
      <label class="check"><input type="checkbox" id="fakegps" ${api.demo.fakeGps() ? 'checked' : ''}> ${t('demo_fake_gps')}</label>
      <button class="btn ghost danger small" data-act="reset">${t('demo_reset')}</button>
    </div>` : ''}`;

  const fg = root.querySelector('#fakegps');
  if (fg) fg.onchange = () => api.demo.setFakeGps(fg.checked);
  const note = (id) => root.querySelector('#note-' + CSS.escape(id))?.value || '';
  bind(root, {
    ...challengeHandlers,
    approve: (d) => act('review_skills', { p_player: d.id, p_approve: true, p_note: note(d.id) }, 'ok_approved'),
    reject: (d) => act('review_skills', { p_player: d.id, p_approve: false, p_note: note(d.id) }, 'ok_rejected'),
    shift: (d) => api.demo.shiftTime(Number(d.h) * H),
    reset: async () => { if (await confirmBox(t('demo_reset') + '?')) api.demo.reset(); },
  });
}
