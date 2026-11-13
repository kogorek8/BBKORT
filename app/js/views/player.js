// Karta zawodnika jak w grze: OVR, 6 pasków, poziom, odznaki, statystyki z meczów
import { t } from '../i18n.js';
import { RULES, SPORTS, SPORT_ICON, STAT_KEYS, SPECIAL_BADGES, levelOf } from '../rules.js';
import { skillGroups, skillKeys, POSITIONS, ovr, tier, defaultSkills, skillsOf } from '../skills.js';
import { esc, bind, modal, teamTag } from '../ui.js';
import { store, act, teamById, profileById, isStaff, isAdmin, playerTotals, playerRecord, badgesOf, specialBadges } from '../state.js';
import { jersey } from './home.js';
import { badgeChip, specialChip } from './season.js';
import { coins, levelBar } from './shop.js';

const viewPending = {};

export function skillBars(values, compare, sport) {
  return `<div class="bars6">${skillKeys(sport).map((k) => {
    const v = values ? values[k] : null;
    const old = compare ? compare[k] : null;
    const diff = compare && v != null && old != null ? v - old : 0;
    return `<div class="bar6"><div class="bar6-top"><span>${t('sk_' + k)}</span><b class="${tier(v)}">${v ?? '—'}${diff ? `<i class="diff ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}</i>` : ''}</b></div>
      <div class="sbar-track"><div class="sbar-fill ${tier(v)}" style="width:${v ? ((v - 25) / 74) * 100 : 0}%"></div></div></div>`;
  }).join('')}</div>`;
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
  const o = ovr(shown, sport);
  const color = tm ? tm.color : '#ff7a1a';
  const rec = playerRecord(p.id);
  const tot = playerTotals(p.id);
  const lv = levelOf(p.xp);
  const badges = badgesOf(p);
  const earned = badges.filter((b) => b.tier > 0).sort((a, b) => b.tier - a.tier);
  const special = specialBadges(p.id);
  const per = (k) => (tot.n ? (Number(tot.sum[k] || 0) / tot.n).toFixed(1) : '—');
  const roles = [p.is_admin ? '🛠️ Admin' : '', p.is_moderator ? `🧑‍⚖️ ${t('moderator')}` : ''].filter(Boolean);

  root.innerHTML = `
    ${tm ? `<a class="back" href="#/team/${esc(tm.id)}">← ${esc(tm.name)}</a>` : `<a class="back" href="#/teams">← ${t('nav_teams')}</a>`}
    <div class="pcard f-${esc(p.frame || 'none')} ${showPending ? 'is-pending' : ''} sport-${sport}" style="--c:${esc(color)}">
      ${pending ? `<div class="pending-ribbon">⏳ ${t('skills_pending')}</div>` : ''}
      <div class="pcard-top">
        <div class="pcard-ovr ${tier(o)}"><b>${o ?? '—'}</b><span>OVR</span></div>
        <div class="pcard-id">
          <div class="pcard-pos">${SPORT_ICON[sport]} ${esc(p.position || '—')}${p.number != null ? ` <span>#${p.number}</span>` : ''}</div>
          <h1>${esc(p.nick)}</h1>
          <div class="small">${tm ? teamTag(tm) + ' ' + esc(tm.name) : `<span class="muted">${t('free_agent')}</span>`}
            ${tm && tm.captain_id === p.id ? ` · <span class="badge cap">C</span>` : ''}</div>
          <div class="small muted">LVL ${lv.lvl} · ${t(lv.title)}${p.height_cm ? ' · ' + p.height_cm + ' cm' : ''}${roles.length ? ' · ' + roles.join(' · ') : ''}</div>
        </div>
        ${jersey(p, tm, 58)}
      </div>
      ${own ? `<div class="pcard-wallet"><a href="#/shop">${coins(p.coins || 0)} OG Coins ›</a></div>${levelBar(p)}` : ''}
      <div class="pstats four">
        <div><b>${rec.played}</b><span>${t('matches_played')}</span></div>
        <div><b>${rec.w}</b><span>${t('wins')}</span></div>
        <div><b>${p.checkins || 0}</b><span>📍 ${t('checkins')}</span></div>
        <div><b>${p.ghost_count}</b><span>👻 ${t('ghost')}</span></div>
      </div>
      ${pending ? `<div class="seg wide">
          <button data-act="view" data-v="0" class="${showPending ? '' : 'on'}" ${approved ? '' : 'disabled'}>✔ ${t('approved_values')}</button>
          <button data-act="view" data-v="1" class="${showPending ? 'on' : ''}">⏳ ${t('pending_values')}</button></div>` : ''}
      ${shown ? skillBars(shown, showPending ? approved : null, sport) : `<p class="muted center">${t('no_skills_yet2')}</p>`}
      ${tot.n ? `<div class="avgs"><div class="small muted">${t('avg_title', { n: tot.n })}</div><div class="avg-row">${STAT_KEYS[sport].map((k) => `<div><b>${per(k)}</b><span>${t('st_' + k)}</span></div>`).join('')}</div></div>` : ''}
      ${earned.length || special.length ? `<div class="badges-wrap">${special.map(specialChip).join('')}${earned.map((b) => badgeChip(b)).join('')}</div>` : `<p class="small muted center">${t('no_badges')}</p>`}
      ${p.skills_video ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${esc(p.skills_video)}">🎬 ${t('video')}</a>` : ''}
    </div>
    <div class="row">
      ${own ? `<button class="btn" data-act="edit-profile">✏️ ${t('edit_profile')}</button><button class="btn ghost" data-act="edit-skills">${t('propose_skills')}</button>
        <a class="btn ghost" href="#/season">🏅 ${t('badges_title')}</a>` : ''}
      ${isStaff() ? `<button class="btn staff primary" data-act="set-skills">🎚️ ${t('set_skills')}</button>` : ''}
      ${isAdmin() ? `<button class="btn staff" data-act="badge">🌟 ${t('grant_badge')}</button>` : ''}
    </div>
    ${own ? `<p class="small muted">${t('skills_admin_note')}</p>` : ''}`;

  bind(root, {
    view: (d) => { viewPending[p.id] = d.v === '1'; renderPlayer(root, p.id); },
    'edit-skills': () => openSkillEditor(p, sport, false),
    'set-skills': () => openSkillEditor(p, sport, true),
    'edit-profile': () => openProfileEditor(p, tm),
    badge: () => openBadgeGrant(p),
  });
}

// suwaki skilli: zawodnik = propozycja do akceptacji; admin/sędzia = ustawia od razu
export function openSkillEditor(p, sport, asStaff) {
  const vals = { ...defaultSkills(sport), ...(skillsOf(p, sport) || {}), ...(p.skills_pending_sport === sport ? p.skills_pending || {} : {}) };
  modal(`<h3>🎚️ ${asStaff ? t('set_skills') : t('propose_skills')} · ${esc(p.nick)}</h3>
    <p class="small muted">${asStaff ? t('set_skills_hint') : t('skills_editor_hint2')}</p>
    <div class="ovr-live">OVR <b id="ovrl">${ovr(vals, sport)}</b></div>
    <div class="editor">${skillGroups(sport).map((g) => g.items.map((k) => `<label class="slider"><span>${t('sk_' + k)}</span>
        <input type="range" min="${RULES.MIN_SKILL}" max="${RULES.MAX_SKILL}" value="${vals[k]}" data-k="${k}">
        <b class="${tier(vals[k])}" id="v-${k}">${vals[k]}</b></label>`).join('')).join('')}</div>
    ${asStaff ? '' : `<label>${t('video_link')}<input id="vid" type="url" placeholder="https://youtube.com/..." value="${esc(p.skills_video || '')}"></label>`}
    <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button>
    <button class="btn primary" id="send">${asStaff ? t('save') : t('send_for_review')}</button></div>`, (m, close) => {
    m.querySelectorAll('input[type=range]').forEach((r) => (r.oninput = () => {
      vals[r.dataset.k] = Number(r.value);
      const b = m.querySelector('#v-' + r.dataset.k);
      b.textContent = r.value; b.className = tier(Number(r.value));
      m.querySelector('#ovrl').textContent = ovr(vals, sport);
    }));
    m.querySelector('#send').onclick = async () => {
      const skills = Object.fromEntries(skillKeys(sport).map((k) => [k, vals[k]]));
      const ok = asStaff
        ? await act('admin_set_skills', { p_player: p.id, p_sport: sport, p_skills: skills }, 'ok_saved')
        : await act('submit_skills', { p_sport: sport, p_skills: skills, p_video: m.querySelector('#vid').value }, 'ok_skills_sent');
      if (ok) close();
    };
  });
}

function openBadgeGrant(p) {
  const has = specialBadges(p.id).map((b) => b.code);
  modal(`<h3>🌟 ${t('grant_badge')} · ${esc(p.nick)}</h3>
    <label>${t('badge_note')}<input id="bn" maxlength="80" placeholder="${t('badge_note_ph')}"></label>
    <div class="ulist">${SPECIAL_BADGES.map((c) => `<button class="uitem ${has.includes(c) ? 'on' : ''}" data-c="${c}"><b>${t('sb_' + c)}</b> <span class="small muted">${t('sb_' + c + '_d')}${has.includes(c) ? ' · ✓' : ''}</span></button>`).join('')}</div>`,
  (m, close) => {
    m.querySelectorAll('[data-c]').forEach((b) => (b.onclick = async () => {
      const on = !has.includes(b.dataset.c);
      if (await act('grant_badge', { p_player: p.id, p_code: b.dataset.c, p_note: m.querySelector('#bn').value, p_on: on }, 'ok_saved')) close();
    }));
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

