// TABLICA WYZWAŃ (publiczna): wyzwania, check-in, zgłoszenia wyników, sędziowanie
import { t } from '../i18n.js';
import { RULES, OPEN_STATUSES, SPORTS, SPORT_ICON, STAT_KEYS, M } from '../rules.js';
import { currentPos } from '../geo.js';
import { esc, bind, modal, toast, teamTag, fmtDate, fmtLeft, confirmBox } from '../ui.js';
import {
  store, act, now, T, teamById, profileById, courtById, courtName, signups, isCaptainOf, myTeam, isStaff,
  ui, setSport, sportOk, challengeSport, backers,
} from '../state.js';

const reportOf = (c, side) => (side === 'c' ? c.challenger_report : c.defender_report);
const sameReport = (a, b) => !!(a && b && !a.walkover && !b.walkover && a.a === b.a && a.b === b.b);

// Co aktualny użytkownik może zrobić z danym wyzwaniem
export function actionsFor(c) {
  const me = store.me;
  const out = [];
  if (!me) return out;
  const n = now();
  const start = T(c.scheduled_at);

  if (isStaff() && ['pending', 'accepted', 'reported'].includes(c.status)) {
    if (c.referee_id !== me.id) out.push({ act: 'take', label: '🧑‍⚖️ ' + t('take_referee'), cls: c.referee_id ? 'ghost' : '', urgent: !c.referee_id && c.status !== 'pending', staff: true });
    else out.push({ act: 'untake', label: t('drop_referee'), cls: 'ghost', staff: true });
    if (c.status !== 'pending') out.push({ act: 'referee', label: '✅ ' + t('referee_result'), cls: 'primary', urgent: c.status === 'reported', staff: true });
  }

  // admin / sędzia: akceptacja zgłoszeń (wyzwanie lub przejęcie)
  if (isStaff() && ['review', 'proposed'].includes(c.status)) {
    out.push({ act: 'rv-yes', label: '✔ ' + t('approve'), cls: 'primary', urgent: c.status === 'review', staff: true },
      { act: 'rv-no', label: '✖ ' + t('reject'), cls: 'ghost danger', staff: true });
  }
  if (!me.team_id) return out;
  // zgłoszenie czeka na poparcie drużyny / akceptację admina
  if (['proposed', 'review'].includes(c.status)) {
    if (me.team_id !== c.challenger_team_id) return out;
    const mineBack = backers(c.id).some((b) => b.player_id === me.id);
    if (c.status === 'proposed' && !mineBack) out.push({ act: 'support', label: '✋ ' + t('support'), cls: 'primary', urgent: true });
    if (c.created_by === me.id || isCaptainOf(me.team_id)) out.push({ act: 'cancel', label: t('withdraw'), cls: 'ghost' });
    return out;
  }
  // statystyki po meczu: każdy zawodnik zgłasza swoje, admin zatwierdza
  if (c.kind !== 'claim' && ['reported', 'confirmed'].includes(c.status) && [c.challenger_team_id, c.defender_team_id].includes(me.team_id)) {
    const ms = store.data.match_stats.find((m) => m.challenge_id === c.id && m.player_id === me.id);
    if (!ms || ms.status !== 'approved') out.push({ act: 'stats', label: '📊 ' + (ms ? t('stats_change') : t('stats_send')), cls: ms ? 'ghost' : '', urgent: !ms && c.status === 'confirmed' && T(c.resolved_at) > n - 72 * 3600e3 });
  }
  if (!OPEN_STATUSES.includes(c.status)) return out;
  const side = me.team_id === c.challenger_team_id ? 'c' : me.team_id === c.defender_team_id ? 'd' : null;
  if (!side) return out;
  const cap = isCaptainOf(me.team_id);
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
    if (cap && side === 'd') out.push({ act: 'forfeit', label: t('forfeit'), cls: 'ghost danger' });
  }
  if (['accepted', 'reported'].includes(c.status) && cap && n >= start - RULES.CHECKIN_BEFORE_MIN * M) {
    const has = reportOf(c, side);
    out.push({ act: 'report', label: '📝 ' + (has ? t('change_report') : t('report_result')), cls: has ? 'ghost' : 'primary', urgent: !has && n >= start });
    if (c.status === 'accepted' && myIn && !otherIn && n >= start + RULES.WALKOVER_GRACE_MIN * M)
      out.push({ act: 'walkover', label: '🏳️ ' + t('claim_walkover'), cls: '', urgent: true });
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
    case 'proposed': return `✋ ${t('st_proposed', { n: backers(c.id).length, m: RULES.BACKERS })} · ${t('time_left')} <b>${fmtLeft(T(c.created_at) + 48 * 3600e3 - n)}</b>`;
    case 'review': return `🧑‍⚖️ ${t('st_review')}`;
    case 'rejected': return `✖ ${t('st_rejected')}${c.note ? ': ' + esc(c.note) : ''}`;
    case 'claimed': return `👑 ${t('st_claimed')}`;
    case 'pending': return `⏳ ${t('st_pending')} · ${t('time_left')} <b>${fmtLeft(T(c.accept_deadline) - n)}</b>`;
    case 'accepted':
      if (n < start - RULES.CHECKIN_BEFORE_MIN * M) return `✅ ${t('st_accepted')} · ${t('starts_in')} ${fmtLeft(start - n)}`;
      if (n <= start + RULES.WALKOVER_GRACE_MIN * M) return `🟢 ${t('checkin_open')}`;
      return `🏀 ${t('st_playing')}`;
    case 'reported': return `📝 ${t('st_reported')}`;
    case 'confirmed': return `🏁 ${t('st_confirmed')}`;
    case 'walkover': return `🏳️ ${t('st_walkover')} · ${t('wo_' + (c.note || 'no_show'))}`;
    default: return t('st_' + c.status);
  }
}

function sideBlock(c, tid) {
  const tm = teamById(tid);
  const ups = signups(c.id).filter((x) => x.team_id === tid);
  const win = c.winner_team_id === tid;
  return `<div class="side ${win ? 'win' : ''}" style="--c:${esc(tm?.color || '#888')}">
    <a href="#/team/${esc(tid)}" class="side-name">${teamTag(tm)} <span>${esc(tm?.name || '?')}</span></a>
    <div class="side-players">${ups.map((x) => {
      const p = profileById(x.player_id);
      const ghost = !x.checked_in_at && ['confirmed', 'walkover', 'expired'].includes(c.status);
      return `<span class="chip ${x.checked_in_at ? 'in' : ''} ${ghost ? 'ghost' : ''}">${x.checked_in_at ? '✓ ' : ghost ? '👻 ' : ''}${esc(p?.nick || '?')}</span>`;
    }).join('') || `<span class="muted small">${t('no_signups')}</span>`}</div>
  </div>`;
}

function reportsBlock(c) {
  const reps = [['c', c.challenger_team_id], ['d', c.defender_team_id]].filter(([s]) => reportOf(c, s));
  if (!reps.length || !OPEN_STATUSES.includes(c.status)) return '';
  const a = c.challenger_report, b = c.defender_report;
  const conflict = a && b && !(a.walkover || b.walkover) && (a.a !== b.a || a.b !== b.b);
  return `<div class="reports small">
    <div class="muted">${t('captain_reports')}:</div>
    ${reps.map(([s, tid]) => {
      const r = reportOf(c, s);
      return `<div>${teamTag(teamById(tid))} ${r.walkover ? `🏳️ ${t('claims_walkover')}` : `<b>${r.a} : ${r.b}</b>`}
        ${r.video ? ` · <a href="${esc(r.video)}" target="_blank" rel="noopener">🎬 ${t('video')}</a>` : ''}</div>`;
    }).join('')}
    ${conflict ? `<div class="warn">⚠️ ${t('reports_differ')}</div>` : a && b && sameReport(a, b) ? `<div class="okline">✔ ${t('reports_match')}</div>` : ''}
  </div>`;
}

function refereeLine(c) {
  if (['cancelled', 'expired'].includes(c.status)) return '';
  const ref = c.referee_id ? profileById(c.referee_id) : null;
  if (ref) return `<div class="small ref">🧑‍⚖️ ${t('referee')}: <b>${esc(ref.nick)}</b></div>`;
  if (OPEN_STATUSES.includes(c.status)) return `<div class="small warn">⚠️ ${t('no_referee')}</div>`;
  return '';
}

export function challengeCard(c, compact = false) {
  const court = courtById(c.court_id);
  const sp = challengeSport(c);
  const score = c.score_challenger != null ? `<div class="score">${c.score_challenger} : ${c.score_defender}</div>` : '<div class="vs">VS</div>';
  const acts = compact ? [] : actionsFor(c);
  const myStat = store.me ? store.data.match_stats.find((m) => m.challenge_id === c.id && m.player_id === store.me.id) : null;
  if (c.kind === 'claim') {
    const tm = teamById(c.challenger_team_id);
    return `<div class="mcard st-${c.status} claim">
      <div class="mcard-head"><a href="#/map/${esc(c.court_id)}">${SPORT_ICON[sp] || ''} ${esc(courtName(court))}</a><span class="pill">👑 ${t('claim_request')}</span></div>
      <div class="small">${teamTag(tm)} <b>${esc(tm?.name || '?')}</b> ${t('claim_wants')} · ${t('reported_by')} ${esc(profileById(c.created_by)?.nick || '?')}</div>
      <div class="mcard-status">${statusLine(c)}</div>
      ${acts.length ? `<div class="row">${acts.map((a) => `<button class="btn ${a.cls} ${a.staff ? 'staff' : ''}" data-act="${a.act}" data-id="${esc(c.id)}">${a.label}</button>`).join('')}</div>` : ''}
    </div>`;
  }
  return `<div class="mcard st-${c.status}">
    <div class="mcard-head">
      <a href="#/map/${esc(c.court_id)}">${SPORT_ICON[sp] || ''} ${esc(courtName(court))}</a>
      <span class="small muted">${fmtDate(c.scheduled_at)}</span>
    </div>
    <div class="mcard-body">
      ${sideBlock(c, c.challenger_team_id)}
      ${score}
      ${sideBlock(c, c.defender_team_id)}
    </div>
    <div class="mcard-labels small"><span>⚔️ ${t('challenger')}</span><span>👑 ${t('defender')}</span></div>
    <div class="mcard-status">${statusLine(c)}</div>
    ${refereeLine(c)}
    ${reportsBlock(c)}
    ${c.video_url ? `<a class="small" href="${esc(c.video_url)}" target="_blank" rel="noopener">🎬 ${t('match_video')}</a>` : ''}
    ${myStat ? `<div class="small ref">📊 ${t('stats_mine')}: ${Object.entries(myStat.stats).map(([k, v]) => `${t('st_' + k)} <b>${v}</b>`).join(' · ')} <span class="pill ${myStat.status === 'approved' ? 'ok' : myStat.status === 'rejected' ? 'err' : ''}">${t('mst_' + myStat.status)}</span></div>` : ''}
    ${acts.length ? `<div class="row">${acts.map((a) => `<button class="btn ${a.cls} ${a.staff ? 'staff' : ''}" data-act="${a.act}" data-id="${esc(c.id)}">${a.label}</button>`).join('')}</div>` : ''}
  </div>`;
}

const findCh = (id) => store.data.challenges.find((x) => x.id === id);

export const challengeHandlers = {
  support: (d) => act('support_challenge', { p_id: d.id }, 'ok_supported'),
  'rv-yes': (d) => act('admin_review_challenge', { p_id: d.id, p_approve: true, p_note: null }, 'ok_approved_action'),
  'rv-no': (d) => {
    modal(`<h3>✖ ${t('reject')}</h3><label>${t('reject_reason')}<input id="rr" maxlength="200"></label>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('reject')}</button></div>`,
    (m, close) => { m.querySelector('#ok').onclick = async () => { if (await act('admin_review_challenge', { p_id: d.id, p_approve: false, p_note: m.querySelector('#rr').value }, 'ok_saved')) close(); }; });
  },
  stats(d) {
    const c = findCh(d.id);
    const keys = STAT_KEYS[challengeSport(c)] || STAT_KEYS.basketball;
    const cur = store.data.match_stats.find((m) => m.challenge_id === c.id && m.player_id === store.me.id)?.stats || {};
    modal(`<h3>📊 ${t('stats_send')}</h3><p class="small muted">${t('stats_hint')}</p>
      <div class="stat-in">${keys.map((k) => `<label>${t('st_' + k)}<input type="number" min="0" max="200" inputmode="numeric" data-k="${k}" value="${cur[k] ?? 0}"></label>`).join('')}</div>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('send')}</button></div>`,
    (m, close) => { m.querySelector('#ok').onclick = async () => {
      const stats = Object.fromEntries(keys.map((k) => [k, parseInt(m.querySelector(`[data-k=${k}]`).value, 10) || 0]));
      if (await act('submit_match_stats', { p_id: c.id, p_stats: stats }, 'ok_stats_sent')) close();
    }; });
  },
  accept: (d) => act('accept_challenge', { p_id: d.id }, 'ok_accepted'),
  async forfeit(d) { if (await confirmBox(t('forfeit_confirm'))) act('forfeit_challenge', { p_id: d.id }, 'ok_saved'); },
  cancel: (d) => act('cancel_challenge', { p_id: d.id }, 'ok_saved'),
  join: (d) => act('join_match', { p_id: d.id }, 'ok_signed_up'),
  unjoin: (d) => act('leave_match', { p_id: d.id }, 'ok_saved'),
  take: (d) => act('take_referee', { p_id: d.id, p_take: true }, 'ok_referee'),
  untake: (d) => act('take_referee', { p_id: d.id, p_take: false }, 'ok_saved'),
  async checkin(d) {
    const p = await currentPos();
    act('check_in', { p_id: d.id, p_lat: p?.lat ?? null, p_lng: p?.lng ?? null }, 'ok_checked_in');
  },
  async walkover(d) {
    if (await confirmBox(t('walkover_confirm'))) {
      act('report_result', { p_id: d.id, p_score_challenger: null, p_score_defender: null, p_video: null, p_walkover: true }, 'ok_reported');
    }
  },
  report(d) {
    const c = findCh(d.id);
    const a = teamById(c.challenger_team_id), b = teamById(c.defender_team_id);
    const mine = store.me.team_id === c.challenger_team_id ? c.challenger_report : c.defender_report;
    modal(`<h3>📝 ${t('report_result')}</h3>
      <div class="score-in">
        <label>${teamTag(a)}<input type="number" id="sa" min="0" max="200" inputmode="numeric" value="${mine && !mine.walkover ? mine.a : ''}"></label>
        <span>:</span>
        <label>${teamTag(b)}<input type="number" id="sb" min="0" max="200" inputmode="numeric" value="${mine && !mine.walkover ? mine.b : ''}"></label>
      </div>
      <label>${t('video_link')}<input id="vid" type="url" placeholder="https://youtube.com/..." value="${esc(mine?.video || '')}"></label>
      <p class="small muted">${t('report_hint')}</p>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('send')}</button></div>`,
    (m, close) => {
      m.querySelector('#ok').onclick = async () => {
        const sa = parseInt(m.querySelector('#sa').value, 10), sb = parseInt(m.querySelector('#sb').value, 10);
        if (await act('report_result', { p_id: d.id, p_score_challenger: sa, p_score_defender: sb, p_video: m.querySelector('#vid').value, p_walkover: false }, 'ok_reported')) close();
      };
    });
  },
  referee(d) {
    const c = findCh(d.id);
    const a = teamById(c.challenger_team_id), b = teamById(c.defender_team_id);
    const pre = [c.challenger_report, c.defender_report].find((r) => r && !r.walkover) || {};
    const vids = [c.challenger_report?.video, c.defender_report?.video].filter(Boolean);
    modal(`<h3>🧑‍⚖️ ${t('referee_result')}</h3>
      <p class="small muted">${t('referee_hint')}</p>
      ${reportsBlock(c)}
      <div class="seg wide" id="mode">
        <button data-m="score" class="on">${t('mode_score')}</button>
        <button data-m="woa">${t('walkover')} ${teamTag(a)}</button>
        <button data-m="wob">${t('walkover')} ${teamTag(b)}</button>
        <button data-m="void">${t('void')}</button>
      </div>
      <div class="score-in" id="scorebox">
        <label>${teamTag(a)}<input type="number" id="sa" min="0" max="200" inputmode="numeric" value="${pre.a ?? ''}"></label>
        <span>:</span>
        <label>${teamTag(b)}<input type="number" id="sb" min="0" max="200" inputmode="numeric" value="${pre.b ?? ''}"></label>
      </div>
      <label>${t('match_video')}<input id="vid" type="url" placeholder="https://..." value="${esc(c.video_url || vids[0] || '')}"></label>
      <label>${t('admin_note')}<input id="note" maxlength="200"></label>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('approve_result')}</button></div>`,
    (m, close) => {
      let mode = 'score';
      m.querySelectorAll('#mode button').forEach((btn) => (btn.onclick = () => {
        mode = btn.dataset.m;
        m.querySelectorAll('#mode button').forEach((x) => x.classList.toggle('on', x === btn));
        m.querySelector('#scorebox').style.display = mode === 'score' ? '' : 'none';
      }));
      m.querySelector('#ok').onclick = async () => {
        const sa = parseInt(m.querySelector('#sa').value, 10), sb = parseInt(m.querySelector('#sb').value, 10);
        let winner = null, A = null, B = null;
        if (mode === 'score') {
          if (isNaN(sa) || isNaN(sb) || sa === sb) return toast(t('err_bad_score'), 'err');
          winner = sa > sb ? c.challenger_team_id : c.defender_team_id; A = sa; B = sb;
        } else if (mode === 'woa') winner = c.challenger_team_id;
        else if (mode === 'wob') winner = c.defender_team_id;
        if (await act('referee_result', {
          p_id: d.id, p_winner: winner, p_score_challenger: A, p_score_defender: B,
          p_video: m.querySelector('#vid').value, p_note: m.querySelector('#note').value || null,
        }, 'ok_result_approved')) close();
      };
    });
  },
};

let tab = 'board';

export function renderMatches(root) {
  const mine = myTeam();
  const open = (c) => OPEN_STATUSES.includes(c.status);
  const byTime = (a, b) => T(a.scheduled_at) - T(b.scheduled_at);
  if (tab === 'mine' && !mine) tab = 'board';
  if (tab === 'ref' && !isStaff()) tab = 'board';
  let list = store.data.challenges.filter((c) => sportOk(challengeSport(c)));
  if (tab === 'mine') list = list.filter((c) => c.challenger_team_id === mine.id || c.defender_team_id === mine.id);
  if (tab === 'ref') list = list.filter((c) => open(c) && c.status !== 'pending');

  const needs = list.filter((c) => open(c) && actionsFor(c).some((a) => a.urgent)).sort(byTime);
  const active = list.filter((c) => open(c) && !needs.includes(c)).sort(byTime);
  const done = tab === 'ref' ? [] : list.filter((c) => !open(c)).sort((a, b) => T(b.resolved_at || b.scheduled_at) - T(a.resolved_at || a.scheduled_at)).slice(0, 30);
  const sec = (title, arr, empty) => `<h3>${title}</h3>${arr.length ? `<div class="matches">${arr.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${empty}</p>`}`;

  root.innerHTML = `
    <div class="page-head"><h1>⚔️ ${t('board_title')}</h1></div>
    <div class="toolbar">
      <div class="seg">
        <button data-act="tab" data-v="board" class="${tab === 'board' ? 'on' : ''}">${t('tab_board')}</button>
        ${mine ? `<button data-act="tab" data-v="mine" class="${tab === 'mine' ? 'on' : ''}">${t('my_team')}</button>` : ''}
        ${isStaff() ? `<button data-act="tab" data-v="ref" class="${tab === 'ref' ? 'on' : ''}">🧑‍⚖️ ${t('tab_referee')}</button>` : ''}
      </div>
      <div class="seg">${['all', ...SPORTS].map((s) => `<button data-act="sport" data-s="${s}" class="${ui.sport === s ? 'on' : ''}">${s === 'all' ? t('all') : SPORT_ICON[s]}</button>`).join('')}</div>
    </div>
    <details class="rules"><summary>📜 ${t('rules_title')}</summary>
      <ol>${[1, 2, 3, 4, 5, 6, 7].map((i) => `<li>${t('rule_' + i, { r: RULES.CHECKIN_RADIUS_M, h: RULES.ACCEPT_HOURS, m: 30, p: RULES.PROTECTION_HOURS, b: RULES.BACKERS })}</li>`).join('')}</ol></details>
    ${needs.length ? sec('🔔 ' + t('needs_action'), needs, '') : ''}
    ${sec('⚔️ ' + t('active'), active, t('no_active'))}
    ${tab === 'ref' ? '' : sec('🏁 ' + t('finished'), done, t('no_matches'))}`;

  bind(root, {
    ...challengeHandlers,
    tab: (d) => { tab = d.v; renderMatches(root); },
    sport: (d) => { setSport(d.s); renderMatches(root); },
  });
}
