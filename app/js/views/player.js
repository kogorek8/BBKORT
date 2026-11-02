// Karta zawodnika w stylu gier koszykarskich + edycja skilli (do akceptacji admina)
import { t } from '../i18n.js';
import { RULES } from '../rules.js';
import { SKILL_GROUPS, ALL_SKILLS, POSITIONS, ovr, tier, groupAvg, defaultSkills } from '../skills.js';
import { esc, bind, modal, teamTag, fmtDate } from '../ui.js';
import { store, act, teamById, profileById } from '../state.js';

let viewPending = {};   // playerId -> bool

export function skillBars(skills, compare) {
  return SKILL_GROUPS.map((g) => {
    const ga = groupAvg(skills, g);
    return `<div class="sgroup">
      <div class="sgroup-head"><span>${t(g.key)}</span><b class="${tier(ga)}">${ga ?? '—'}</b></div>
      ${g.items.map((k) => {
        const v = skills ? skills[k] : null;
        const old = compare ? compare[k] : null;
        const diff = compare && v != null && old != null ? v - old : 0;
        return `<div class="sbar">
          <span class="sbar-label">${t('sk_' + k)}</span>
          <div class="sbar-track"><div class="sbar-fill ${tier(v)}" style="width:${v ? ((v - 25) / 74) * 100 : 0}%"></div></div>
          <span class="sbar-val ${tier(v)}">${v ?? '—'}</span>
          ${diff ? `<span class="diff ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}</span>` : '<span class="diff"></span>'}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

export function renderPlayer(root, id) {
  if (id === 'me') {
    if (!store.me) { location.hash = '#/login'; return; }
    id = store.me.id;
  }
  const p = profileById(id);
  if (!p) { root.innerHTML = `<p class="muted">${t('not_found')}</p>`; return; }
  const tm = p.team_id ? teamById(p.team_id) : null;
  const own = store.me && store.me.id === p.id;
  const pending = p.skills_status === 'pending' && p.skills_pending;
  const showPending = pending && (viewPending[p.id] ?? !p.skills);
  const shown = showPending ? p.skills_pending : p.skills;
  const o = ovr(shown);
  const color = tm ? tm.color : '#ff7a1a';

  root.innerHTML = `
    ${tm ? `<a class="back" href="#/team/${esc(tm.id)}">← ${esc(tm.name)}</a>` : `<a class="back" href="#/teams">← ${t('nav_teams')}</a>`}
    <div class="pcard ${showPending ? 'is-pending' : ''}" style="--c:${esc(color)}">
      ${pending ? `<div class="pending-ribbon">⏳ ${t('skills_pending')}</div>` : ''}
      <div class="pcard-top">
        <div class="pcard-ovr ${tier(o)}"><b>${o ?? '—'}</b><span>OVR</span></div>
        <div class="pcard-id">
          <div class="pcard-pos">${esc(p.position || '—')}${p.number != null ? ` <span>#${p.number}</span>` : ''}</div>
          <h1>${esc(p.nick)}</h1>
          <div class="small">${tm ? teamTag(tm) + ' ' + esc(tm.name) : `<span class="muted">${t('free_agent')}</span>`}
            ${tm && tm.captain_id === p.id ? ` · <span class="badge cap">C</span> ${t('captain')}` : ''}</div>
          <div class="small muted">${p.height_cm ? p.height_cm + ' cm' : ''}</div>
        </div>
      </div>
      <div class="pcard-badges">
        ${p.skills_status === 'approved' ? `<span class="pill ok">✔ ${t('skills_approved')}</span>` : ''}
        ${p.skills_status === 'rejected' ? `<span class="pill err">✖ ${t('skills_rejected')}${p.skills_note ? ': ' + esc(p.skills_note) : ''}</span>` : ''}
        ${p.skills_status === 'none' && !pending ? `<span class="pill">${t('skills_none')}</span>` : ''}
        ${p.ghost_count ? `<span class="pill ghost">👻 ${t('ghost')} ×${p.ghost_count}</span>` : ''}
      </div>
      ${pending ? `<div class="seg wide">
          <button data-act="view" data-v="0" class="${showPending ? '' : 'on'}" ${p.skills ? '' : 'disabled'}>✔ ${t('approved_values')}</button>
          <button data-act="view" data-v="1" class="${showPending ? 'on' : ''}">⏳ ${t('pending_values')}</button></div>
        ${showPending ? `<div class="small muted center">${t('pending_explain')} · ${fmtDate(p.skills_submitted_at)}</div>` : ''}` : ''}
      <div class="skills">${shown ? skillBars(shown, showPending ? p.skills : null) : `<p class="muted center">${t('no_skills_yet')}</p>`}</div>
      ${p.skills_video ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${esc(p.skills_video)}">🎬 ${t('video')}</a>` : ''}
    </div>
    ${own ? `<div class="row"><button class="btn primary" data-act="edit-skills">✏️ ${t('edit_skills')}</button>
      <button class="btn" data-act="edit-profile">${t('edit_profile')}</button></div>` : ''}`;

  bind(root, {
    view: (d) => { viewPending[p.id] = d.v === '1'; renderPlayer(root, p.id); },
    'edit-skills': () => openSkillEditor(p),
    'edit-profile': () => openProfileEditor(p),
  });
}

function openSkillEditor(p) {
  const start = { ...defaultSkills(), ...(p.skills || {}), ...(p.skills_pending || {}) };
  const vals = { ...start };
  modal(`<h3>✏️ ${t('edit_skills')}</h3>
    <p class="small muted">${t('skills_editor_hint')}</p>
    <div class="ovr-live">OVR <b id="ovrl">${ovr(vals)}</b></div>
    <div class="editor">${SKILL_GROUPS.map((g) => `<div class="sgroup"><div class="sgroup-head"><span>${t(g.key)}</span></div>
      ${g.items.map((k) => `<label class="slider"><span>${t('sk_' + k)}</span>
        <input type="range" min="${RULES.MIN_SKILL}" max="${RULES.MAX_SKILL}" value="${vals[k]}" data-k="${k}">
        <b class="${tier(vals[k])}" id="v-${k}">${vals[k]}</b></label>`).join('')}</div>`).join('')}</div>
    <label>${t('video_link')}<input id="vid" type="url" placeholder="https://youtube.com/..." value="${esc(p.skills_video || '')}"></label>
    <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button>
    <button class="btn primary" id="send">${t('send_for_review')}</button></div>`, (m, close) => {
    m.querySelectorAll('input[type=range]').forEach((r) => (r.oninput = () => {
      vals[r.dataset.k] = Number(r.value);
      const b = m.querySelector('#v-' + r.dataset.k);
      b.textContent = r.value; b.className = tier(Number(r.value));
      m.querySelector('#ovrl').textContent = ovr(vals);
    }));
    m.querySelector('#send').onclick = async () => {
      const skills = Object.fromEntries(ALL_SKILLS.map((k) => [k, vals[k]]));
      if (await act('submit_skills', { p_skills: skills, p_video: m.querySelector('#vid').value }, 'ok_skills_sent')) close();
    };
  });
}

function openProfileEditor(p) {
  modal(`<h3>${t('edit_profile')}</h3>
    <label>${t('nick')}<input id="nk" maxlength="24" value="${esc(p.nick)}"></label>
    <label>${t('position')}<select id="ps"><option value="">—</option>${POSITIONS.map((x) => `<option ${p.position === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <div class="row2"><label>${t('number')}<input id="nr" type="number" min="0" max="99" value="${p.number ?? ''}"></label>
    <label>${t('height')}<input id="ht" type="number" min="120" max="240" value="${p.height_cm ?? ''}"></label></div>
    <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('save')}</button></div>`,
  (m, close) => {
    m.querySelector('#ok').onclick = async () => {
      const num = (s) => (s === '' ? null : Number(s));
      if (await act('update_profile', {
        p_nick: m.querySelector('#nk').value, p_position: m.querySelector('#ps').value || null,
        p_number: num(m.querySelector('#nr').value), p_height: num(m.querySelector('#ht').value),
      }, 'ok_saved')) close();
    };
  });
}
