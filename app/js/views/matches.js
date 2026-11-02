// Zakładka MECZE: wyzwania, check-in, wynik, potwierdzenia, walkowery
import { t } from '../i18n.js';
import { RULES, OPEN_STATUSES, M } from '../rules.js';
import { currentPos } from '../geo.js';
import { esc, bind, modal, teamTag, fmtDate, fmtLeft, confirmBox } from '../ui.js';
import {
  store, act, now, T, teamById, profileById, courtById, courtName, signups, isCaptainOf, myTeam, isAdmin,
} from '../state.js';

// Co aktualny użytkownik może zrobić z danym wyzwaniem
export function actionsFor(c) {
  const me = store.me;
  const out = [];
  if (!me || !me.team_id) return out;
  const side = me.team_id === c.challenger_team_id ? 'c' : me.team_id === c.defender_team_id ? 'd' : null;
  if (!side) return out;
  const cap = isCaptainOf(me.team_id);
  const start = T(c.scheduled_at);
  const n = now();
  const ups = signups(c.id);
  const mine = ups.find((x) => x.player_id === me.id);
  const inC = ups.some((x) => x.team_id === c.challenger_team_id && x.checked_in_at);
  const inD = ups.some((x) => x.team_id === c.defender_team_id && x.checked_in_at);
  const myIn = side === 'c' ? inC : inD;
  const otherIn = side === 'c' ? inD : inC;

  if (c.status === 'pending') {
    if (cap && side === 'd') out.push({ act: 'accept', label: t('accept'), cls: 'primary', urgent: true }, { act: 'forfeit', label: t('forfeit'), cls: 'ghost danger' });
    if (cap && side === 'c') out.push({ act: 'cancel', label: t('cancel_challenge'), cls: 'ghost' });
  }
  if (['pending', 'accepted'].includes(c.status)) {
    if (!mine) out.push({ act: 'join', label: t('sign_up'), cls: '', urgent: c.status === 'accepted' });
    else if (!mine.checked_in_at && n < start - RULES.CHECKIN_BEFORE_MIN * M) out.push({ act: 'unjoin', label: t('sign_out'), cls: 'ghost' });
  }
  if (c.status === 'accepted') {
    const winOpen = n >= start - RULES.CHECKIN_BEFORE_MIN * M && n <= start + RULES.WALKOVER_GRACE_MIN * M;
    if (winOpen && !(mine && mine.checked_in_at)) out.push({ act: 'checkin', label: '📍 ' + t('check_in'), cls: 'primary', urgent: true });
    if (cap && inC && inD && n >= start - RULES.CHECKIN_BEFORE_MIN * M) out.push({ act: 'report', label: t('report_result'), cls: 'primary', urgent: true });
    if (cap && myIn && !otherIn && n >= start + RULES.WALKOVER_GRACE_MIN * M) out.push({ act: 'walkover', label: t('claim_walkover'), cls: 'primary', urgent: true });
    if (cap && side === 'd') out.push({ act: 'forfeit', label: t('forfeit'), cls: 'ghost danger' });
  }
  if (c.status === 'reported' && cap) {
    const iConfirmed = side === 'c' ? c.challenger_confirmed : c.defender_confirmed;
    if (!iConfirmed) out.push({ act: 'confirm', label: '✔ ' + t('confirm_result'), cls: 'primary', urgent: true }, { act: 'dispute', label: '✖ ' + t('dispute'), cls: 'ghost danger' });
  }
  return out;
}

export function pendingActionsCount() {
  if (!store.me || !store.data) return 0;
  return store.data.challenges.filter((c) => OPEN_STATUSES.includes(c.status) && actionsFor(c).some((a) => a.urgent)).length;
}

function statusLine(c) {
  const n = now();
  const start = T(c.scheduled_at);
  switch (c.status) {
    case 'pending': return `⏳ ${t('st_pending')} · ${t('time_left')} ${fmtLeft(T(c.accept_deadline) - n)}`;
    case 'accepted':
      if (n < start - RULES.CHECKIN_BEFORE_MIN * M) return `✅ ${t('st_accepted')} · ${t('starts_in')} ${fmtLeft(start - n)}`;
      if (n <= start + RULES.WALKOVER_GRACE_MIN * M) return `🟢 ${t('checkin_open')}`;
      return `🏀 ${t('st_playing')}`;
    case 'reported': return `📝 ${t('st_reported')} · ${t('time_left')} ${fmtLeft(T(c.confirm_deadline) - n)}`;
    case 'disputed': return `⚖️ ${t('st_disputed')}`;
    case 'confirmed': return `🏁 ${t('st_confirmed')}${c.note === 'admin' ? ' (admin)' : ''}`;
    case 'walkover': return `🏳️ ${t('st_walkover')} · ${t('wo_' + (c.note || 'no_show'))}`;
    default: return t('st_' + c.status);
  }
}

function sideBlock(c, tid) {
  const tm = teamById(tid);
  const ups = signups(c.id).filter((x) => x.team_id === tid);
  const win = c.winner_team_id === tid;
  const showPlayers = ['pending', 'accepted', 'reported', 'disputed'].includes(c.status) || ups.length;
  return `<div class="side ${win ? 'win' : ''}" style="--c:${esc(tm?.color || '#888')}">
    <a href="#/team/${esc(tid)}" class="side-name">${teamTag(tm)} <span>${esc(tm?.name || '?')}</span></a>
    ${showPlayers ? `<div class="side-players">${ups.map((x) => {
      const p = profileById(x.player_id);
      const ghost = !x.checked_in_at && !OPEN_STATUSES.includes(c.status) && c.status !== 'cancelled';
      return `<span class="chip ${x.checked_in_at ? 'in' : ''} ${ghost ? 'ghost' : ''}">${x.checked_in_at ? '✓ ' : ghost ? '👻 ' : ''}${esc(p?.nick || '?')}</span>`;
    }).join('') || `<span class="muted small">${t('no_signups')}</span>`}</div>` : ''}
  </div>`;
}

export function challengeCard(c, compact = false) {
  const court = courtById(c.court_id);
  const score = c.score_challenger != null ? `<div class="score">${c.score_challenger} : ${c.score_defender}</div>` : '<div class="vs">VS</div>';
  const acts = compact ? [] : actionsFor(c);
  const adminActs = !compact && isAdmin() && ['disputed', 'reported', 'accepted', 'pending'].includes(c.status);
  return `<div class="mcard st-${c.status}">
    <div class="mcard-head">
      <a href="#/map/${esc(c.court_id)}">📍 ${esc(courtName(court))}</a>
      <span class="small muted">${fmtDate(c.scheduled_at)}</span>
    </div>
    <div class="mcard-body">
      ${sideBlock(c, c.challenger_team_id)}
      ${score}
      ${sideBlock(c, c.defender_team_id)}
    </div>
    <div class="mcard-labels small"><span>⚔️ ${t('challenger')}</span><span>👑 ${t('defender')}</span></div>
    <div class="mcard-status">${statusLine(c)}</div>
    ${acts.length ? `<div class="row">${acts.map((a) => `<button class="btn ${a.cls}" data-act="${a.act}" data-id="${esc(c.id)}">${a.label}</button>`).join('')}</div>` : ''}
    ${adminActs ? `<div class="row admin-row"><span class="small muted">Admin:</span>
      <button class="btn small" data-act="aresolve" data-id="${esc(c.id)}" data-w="${esc(c.challenger_team_id)}">${t('win_for')} ${teamTag(teamById(c.challenger_team_id))}</button>
      <button class="btn small" data-act="aresolve" data-id="${esc(c.id)}" data-w="${esc(c.defender_team_id)}">${t('win_for')} ${teamTag(teamById(c.defender_team_id))}</button>
      <button class="btn small ghost" data-act="aresolve" data-id="${esc(c.id)}" data-w="">${t('void')}</button></div>` : ''}
  </div>`;
}

export const challengeHandlers = {
  accept: (d) => act('accept_challenge', { p_id: d.id }, 'ok_accepted'),
  async forfeit(d) { if (await confirmBox(t('forfeit_confirm'))) act('forfeit_challenge', { p_id: d.id }, 'ok_saved'); },
  cancel: (d) => act('cancel_challenge', { p_id: d.id }, 'ok_saved'),
  join: (d) => act('join_match', { p_id: d.id }, 'ok_signed_up'),
  unjoin: (d) => act('leave_match', { p_id: d.id }, 'ok_saved'),
  async checkin(d) {
    const p = await currentPos();
    act('check_in', { p_id: d.id, p_lat: p?.lat ?? null, p_lng: p?.lng ?? null }, 'ok_checked_in');
  },
  report(d) {
    const c = store.data.challenges.find((x) => x.id === d.id);
    const a = teamById(c.challenger_team_id), b = teamById(c.defender_team_id);
    modal(`<h3>${t('report_result')}</h3>
      <div class="score-in">
        <label>${teamTag(a)}<input type="number" id="sa" min="0" max="200" inputmode="numeric"></label>
        <span>:</span>
        <label>${teamTag(b)}<input type="number" id="sb" min="0" max="200" inputmode="numeric"></label>
      </div>
      <p class="small muted">${t('report_hint', { h: RULES.CONFIRM_HOURS })}</p>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('send')}</button></div>`,
    (m, close) => {
      m.querySelector('#ok').onclick = async () => {
        const sa = parseInt(m.querySelector('#sa').value, 10), sb = parseInt(m.querySelector('#sb').value, 10);
        if (await act('report_result', { p_id: d.id, p_score_challenger: sa, p_score_defender: sb }, 'ok_reported')) close();
      };
    });
  },
  confirm: (d) => act('confirm_result', { p_id: d.id, p_agree: true }, 'ok_confirmed'),
  async dispute(d) { if (await confirmBox(t('dispute_confirm'))) act('confirm_result', { p_id: d.id, p_agree: false }, 'ok_disputed'); },
  async walkover(d) { if (await confirmBox(t('walkover_confirm'))) act('claim_walkover', { p_id: d.id }, 'ok_walkover'); },
  aresolve: (d) => act('admin_resolve', { p_id: d.id, p_winner: d.w || null }, 'ok_saved'),
};

let tab = 'mine';

export function renderMatches(root) {
  const all = [...store.data.challenges];
  const mine = myTeam();
  const open = (c) => OPEN_STATUSES.includes(c.status);
  const byTime = (a, b) => T(a.scheduled_at) - T(b.scheduled_at);
  let list;
  if (tab === 'mine' && mine) list = all.filter((c) => c.challenger_team_id === mine.id || c.defender_team_id === mine.id);
  else list = all;
  const needs = list.filter((c) => open(c) && actionsFor(c).some((a) => a.urgent)).sort(byTime);
  const active = list.filter((c) => open(c) && !needs.includes(c)).sort(byTime);
  const done = list.filter((c) => !open(c)).sort((a, b) => T(b.resolved_at || b.scheduled_at) - T(a.resolved_at || a.scheduled_at)).slice(0, 30);

  const sec = (title, arr, empty) => `<h3>${title}</h3>${arr.length ? `<div class="matches">${arr.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${empty}</p>`}`;

  root.innerHTML = `
    <div class="page-head"><h1>${t('nav_matches')}</h1>
      <div class="seg">${mine ? `<button data-act="tab" data-v="mine" class="${tab === 'mine' ? 'on' : ''}">${t('my_team')}</button>` : ''}
      <button data-act="tab" data-v="all" class="${tab === 'all' || !mine ? 'on' : ''}">${t('all')}</button></div></div>
    <details class="rules"><summary>📜 ${t('rules_title')}</summary>
      <ol>${[1, 2, 3, 4, 5, 6, 7].map((i) => `<li>${t('rule_' + i, { r: RULES.CHECKIN_RADIUS_M, h: 24, m: 30 })}</li>`).join('')}</ol></details>
    ${needs.length ? sec('🔔 ' + t('needs_action'), needs, '') : ''}
    ${sec('⚔️ ' + t('active'), active, t('no_active'))}
    ${sec('🏁 ' + t('finished'), done, t('no_matches'))}`;

  bind(root, { ...challengeHandlers, tab: (d) => { tab = d.v; renderMatches(root); } });
}

