// Karta zawodnika w stylu gier sportowych + edycja skilli (do akceptacji admina/moderatora)
import { t } from '../i18n.js';
import { RULES, SPORTS, SPORT_ICON } from '../rules.js';
import { skillGroups, skillKeys, POSITIONS, ovr, tier, groupAvg, defaultSkills, skillsOf } from '../skills.js';
import { esc, bind, modal, teamTag, fmtDate } from '../ui.js';
import { store, act, teamById, profileById } from '../state.js';

const viewPending = {};   // playerId -> bool

export function skillBars(values, compare, sport) {
  return skillGroups(sport).map((g) => {
    const ga = groupAvg(values, g);
    return `<div class="sgroup">
      <div class="sgroup-head"><span>${t(g.key)}</span><b class="${tier(ga)}">${ga ?? '—'}</b></div>
      ${g.items.map((k) => {
        const v = values ? values[k] : null;
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

// mini-statystyki zawodnika z meczów jego drużyny
function playerStats(p) {
  const played = store.data.challenge_players.filter((x) => x.player_id === p.id && x.checked_in_at);
  let w = 0;
  for (const x of played) {
    const c = store.data.challenges.find((ch) => ch.id === x.challenge_id);
    if (c && c.winner_team_id === x.team_id) w++;
  }
  return { played: played.length, w };
}

export function renderPlayer(root, id) {
  if (id === 'me') {
    if (!store.me) { location.hash = '#/login'; return; }
    id = store.me.id;
  }
  const p = profileById(id);
  if (!p) { root.innerHTML = `<p class="muted">${t('not_found')}</p>`; return; }
  const tm = p.team_id ? teamById(p.team_id) : null;
  const sport = tm ? tm.sport : p.sport;
  const own = store.me && store.me.id === p.id;
  const approved = skillsOf(p, sport);
  const pending = p.skills_status === 'pending' && p.skills_pending && p.skills_pending_sport === sport ? p.skills_pending : null;
  const showPending = !!pending && (viewPending[p.id] ?? !approved);
  const shown = showPending ? pending : approved;
  const o = ovr(shown, sport, p.position);
  const color = tm ? tm.color : '#ff7a1a';
  const st = playerStats(p);
  const roles = [p.is_admin ? '🛠️ Admin' : '', p.is_moderator ? `🧑‍⚖️ ${t('moderator')}` : ''].filter(Boolean);

  root.innerHTML = `
    ${tm ? `<a class="back" href="#/team/${esc(tm.id)}">← ${esc(tm.name)}</a>` : `<a class="back" href="#/teams">← ${t('nav_teams')}</a>`}
    <div class="pcard ${showPending ? 'is-pending' : ''} sport-${sport}" style="--c:${esc(color)}">
      ${pending ? `<div class="pending-ribbon">⏳ ${t('skills_pending')}</div>` : ''}
      <div class="pcard-top">
        <div class="pcard-ovr ${tier(o)}"><b>${o ?? '—'}</b><span>OVR</span></div>
        <div class="pcard-id">
          <div class="pcard-pos">${SPORT_ICON[sport]} ${esc(p.position || '—')}${p.number != null ? ` <span>#${p.number}</span>` : ''}</div>
          <h1>${esc(p.nick)}</h1>
          <div class="small">${tm ? teamTag(tm) + ' ' + esc(tm.name) : `<span class="muted">${t('free_agent')}</span>`}
            ${tm && tm.captain_id === p.id ? ` · <span class="badge cap">C</span> ${t('captain')}` : ''}</div>
          <div class="small muted">${p.height_cm ? p.height_cm + ' cm' : ''}${roles.length ? ' · ' + roles.join(' · ') : ''}</div>
        </div>
      </div>
      <div class="pstats">
        <div><b>${st.played}</b><span>${t('matches_played')}</span></div>
        <div><b>${st.w}</b><span>${t('wins')}</span></div>
        <div><b>${p.ghost_count}</b><span>👻 ${t('ghost')}</span></div>
      </div>
      <div class="pcard-badges">
        ${p.skills_status === 'approved' && approved ? `<span class="pill ok">✔ ${t('skills_approved')}</span>` : ''}
        ${p.skills_status === 'rejected' ? `<span class="pill err">✖ ${t('skills_rejected')}${p.skills_note ? ': ' + esc(p.skills_note) : ''}</span>` : ''}
        ${!approved && !pending ? `<span class="pill">${t('skills_none')}</span>` : ''}
      </div>
      ${pending ? `<div class="seg wide">
          <button data-act="view" data-v="0" class="${showPending ? '' : 'on'}" ${approved ? '' : 'disabled'}>✔ ${t('approved_values')}</button>
          <button data-act="view" data-v="1" class="${showPending ? 'on' : ''}">⏳ ${t('pending_values')}</button></div>
        ${showPending ? `<div class="small muted center">${t('pending_explain')} · ${fmtDate(p.skills_submitted_at)}</div>` : ''}` : ''}
      <div class="skills">${shown ? skillBars(shown, showPending ? approved : null, sport) : `<p class="muted center">${t('no_skills_yet')}</p>`}</div>
      ${p.skills_video ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${esc(p.skills_video)}">🎬 ${t('video')}</a>` : ''}
    </div>
    ${own ? `<div class="row"><button class="btn primary" data-act="edit-skills">✏️ ${t('edit_skills')}</button>
      <button class="btn" data-act="edit-profile">${t('edit_profile')}</button></div>` : ''}`;

  bind(root, {
    view: (d) => { viewPending[p.id] = d.v === '1'; renderPlayer(root, p.id); },
    'edit-skills': () => openSkillEditor(p, sport),
    'edit-profile': () => openProfileEditor(p, tm),
  });
}

function openSkillEditor(p, sport) {
  const vals = { ...defaultSkills(sport), ...(skillsOf(p, sport) || {}), ...(p.skills_pending_sport === sport ? p.skills_pending || {} : {}) };
  modal(`<h3>✏️ ${t('edit_skills')} · ${SPORT_ICON[sport]} ${t('sport_' + sport)}</h3>
    <p class="small muted">${t('skills_editor_hint')}</p>
    <div class="ovr-live">OVR <b id="ovrl">${ovr(vals, sport, p.position)}</b></div>
    <div class="editor">${skillGroups(sport).map((g) => `<div class="sgroup"><div class="sgroup-head"><span>${t(g.key)}</span></div>
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
      m.querySelector('#ovrl').textContent = ovr(vals, sport, p.position);
    }));
    m.querySelector('#send').onclick = async () => {
      const skills = Object.fromEntries(skillKeys(sport).map((k) => [k, vals[k]]));
      if (await act('submit_skills', { p_sport: sport, p_skills: skills, p_video: m.querySelector('#vid').value }, 'ok_skills_sent')) close();
    };
  });
}

function openProfileEditor(p, tm) {
  let sport = tm ? tm.sport : p.sport;
  const posOptions = (s) => `<option value="">—</option>${POSITIONS[s].map((x) => `<option ${p.position === x ? 'selected' : ''}>${x}</option>`).join('')}`;
  modal(`<h3>${t('edit_profile')}</h3>
    <label>${t('nick')}<input id="nk" maxlength="24" value="${esc(p.nick)}"></label>
    ${tm ? `<p class="small muted">${t('sport')}: ${SPORT_ICON[sport]} ${t('sport_' + sport)} (${t('sport_from_team')})</p>`
      : `<div class="label">${t('sport')}</div><div class="seg wide" id="sp">${SPORTS.map((s) => `<button data-s="${s}" class="${sport === s ? 'on' : ''}">${SPORT_ICON[s]} ${t('sport_' + s)}</button>`).join('')}</div>`}
    <label>${t('position')}<select id="ps">${posOptions(sport)}</select></label>
    <div class="row2"><label>${t('number')}<input id="nr" type="number" min="0" max="99" value="${p.number ?? ''}"></label>
    <label>${t('height')}<input id="ht" type="number" min="120" max="240" value="${p.height_cm ?? ''}"></label></div>
    <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('save')}</button></div>`,
  (m, close) => {
    m.querySelectorAll('#sp button').forEach((b) => (b.onclick = () => {
      sport = b.dataset.s;
      m.querySelectorAll('#sp button').forEach((x) => x.classList.toggle('on', x === b));
      m.querySelector('#ps').innerHTML = posOptions(sport);
    }));
    m.querySelector('#ok').onclick = async () => {
      const num = (s) => (s === '' ? null : Number(s));
      if (await act('update_profile', {
        p_nick: m.querySelector('#nk').value, p_position: m.querySelector('#ps').value || null,
        p_number: num(m.querySelector('#nr').value), p_height: num(m.querySelector('#ht').value), p_sport: sport,
      }, 'ok_saved')) close();
    };
  });
}

