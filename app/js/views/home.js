// START: dla zalogowanego – moje statystyki i drużyna; dla gościa – prezentacja pomysłu
import { t } from '../i18n.js';
import { SPORTS, SPORT_ICON, OPEN_STATUSES, WIN_STATUSES } from '../rules.js';
import { playerOvr, tier, teamRating, skillsOf } from '../skills.js';
import { esc, bind, teamTag } from '../ui.js';
import {
  store, act, myTeam, members, standings, isStaff, courtsOf, teamChallenges, teamById, myTeamRequests, myGames, upcomingGames, courtById, courtName, reviewValid,
} from '../state.js';
import { gameCard, gameHandlers } from './games.js';
import { ogBadge } from './spots.js';
import { actionsFor, challengeCard, challengeHandlers } from './matches.js';

function myStats(p) {
  const played = store.data.challenge_players.filter((x) => x.player_id === p.id && x.checked_in_at);
  let w = 0;
  for (const x of played) {
    const c = store.data.challenges.find((ch) => ch.id === x.challenge_id);
    if (c && WIN_STATUSES.includes(c.status) && c.winner_team_id === x.team_id) w++;
  }
  return { played: played.length, w, pct: played.length ? Math.round((100 * w) / played.length) : null };
}

const stat = (val, label) => `<div class="stat"><b>${val}</b><span>${label}</span></div>`;

// ---------- ZALOGOWANY ----------
function dashboard(root) {
  const p = store.me;
  const tm = myTeam();
  const sport = tm ? tm.sport : p.sport;
  const o = playerOvr(p, sport);
  const st = myStats(p);
  const urgent = store.data.challenges.filter((c) => OPEN_STATUSES.includes(c.status) && actionsFor(c).some((a) => a.urgent));
  const row = tm ? standings(tm.sport).find((r) => r.team.id === tm.id) : null;
  const teamSize = tm ? members(tm.id).length : 0;
  const steps = [
    { done: !!p.position, label: t('step_profile'), href: '#/player/me' },
    { done: !!tm, label: t('step_team'), href: '#/teams' },
    { done: !!skillsOf(p, sport) || p.skills_status === 'pending', label: t('step_skills'), href: '#/player/me' },
    { done: !!(tm && (courtsOf(tm.id).length || teamChallenges(tm.id).length)), label: t('step_court'), href: '#/map' },
  ];
  const stepsDone = steps.filter((s) => s.done).length;
  const invites = myTeamRequests().filter((r) => r.kind === 'invite');
  const mine = myGames();
  const open = upcomingGames().filter((g) => !mine.includes(g));
  const pendingRes = store.data.challenges.filter((c) => c.status === 'reported').length;
  const pendingSk = store.data.profiles.filter((x) => x.skills_status === 'pending').length;

  root.innerHTML = `
    <div class="hello">
      <div class="small muted">${t('hello')}</div>
      <h1>${esc(p.nick)} 👋</h1>
    </div>

    <a class="mecard" href="#/player/me" style="--c:${esc(tm?.color || '#ff7a1a')}">
      <div class="pcard-ovr ${tier(o)}"><b>${o ?? '—'}</b><span>OVR</span></div>
      <div class="mecard-body">
        <div class="pcard-pos">${SPORT_ICON[sport]} ${esc(p.position || '—')}${p.number != null ? ` <span>#${p.number}</span>` : ''}</div>
        <div class="mecard-name">${esc(p.nick)}</div>
        <div class="small">${tm ? `${teamTag(tm)} ${esc(tm.name)}` : `<span class="muted">${t('free_agent')}</span>`}</div>
        ${p.skills_status === 'pending' ? `<div class="small warn">⏳ ${t('skills_pending')}</div>` : ''}
      </div>
      <span class="chev">›</span>
    </a>

    <div class="stats four">
      ${stat(st.played, t('matches_played'))}
      ${stat(st.w, t('wins'))}
      ${stat(st.pct != null ? st.pct + '%' : '—', t('win_pct'))}
      ${stat(p.ghost_count, '👻 ' + t('ghost'))}
    </div>

    ${urgent.length ? `<h3>🔔 ${t('needs_action')} (${urgent.length})</h3>
      <div class="matches">${urgent.slice(0, 2).map((c) => challengeCard(c)).join('')}</div>
      ${urgent.length > 2 ? `<a class="btn ghost block" href="#/matches">${t('see_all')}</a>` : ''}` : ''}

    ${invites.length ? `<h3>📩 ${t('team_invites')}</h3>${invites.map((r) => { const x = teamById(r.team_id); return x ? `<div class="notice row-between"><span>${teamTag(x)} <b>${esc(x.name)}</b> ${t('invites_you')}</span>
      <span><button class="btn small primary" data-act="inv-yes" data-id="${esc(x.id)}">${t('accept_invite')}</button> <button class="btn small ghost" data-act="inv-no" data-id="${esc(x.id)}">✕</button></span></div>` : ''; }).join('')}` : ''}

    <h3>🤝 ${mine.length ? t('g_mine') : t('g_open')}</h3>
    <div class="matches">${(mine.length ? mine : open).slice(0, 2).map((g) => gameCard(g)).join('') || `<p class="muted small">${t('g_none')}</p>`}</div>
    <a class="btn ghost block" href="#/games">${t('g_see_all')} ›</a>

    ${isStaff() && (pendingRes || pendingSk) ? `<a class="notice staff" href="#/admin">🧑‍⚖️ ${t('staff_todo', { r: pendingRes, s: pendingSk })} ›</a>` : ''}

    <h3>🛡️ ${t('my_team')}</h3>
    ${tm ? `<div class="teambox" style="--c:${esc(tm.color)}">
        <div class="teambox-head">
          <div class="team-logo small">${esc(tm.tag)}</div>
          <div><b>${esc(tm.name)}</b><div class="small muted">${SPORT_ICON[tm.sport]} ${t('sport_' + tm.sport)} · ${teamSize} ${t('players').toLowerCase()}</div></div>
          <div class="teambox-pos"><b>#${row?.pos ?? '—'}</b><span>${t('in_table')}</span></div>
        </div>
        <div class="stats four">
          ${stat(row?.courts ?? 0, '👑 ' + t('courts_held'))}
          ${stat(row?.zones ?? 0, '🚩 ' + t('zones'))}
          ${stat(`${row?.w ?? 0}-${row?.l ?? 0}`, t('record'))}
          ${stat(teamRating(members(tm.id), tm.sport) ?? '—', t('rating'))}
        </div>
        <div class="row"><a class="btn primary" href="#/team/${esc(tm.id)}">${t('see_my_team')}</a><a class="btn" href="#/table">📊 ${t('nav_table')}</a></div>
      </div>`
    : `<div class="teambox empty"><p>${t('no_team_yet')}</p>
        <div class="row"><a class="btn primary" href="#/teams">${t('find_or_create_team')}</a></div></div>`}

    ${stepsDone < steps.length ? `<h3>🚀 ${t('first_steps')} (${stepsDone}/${steps.length})</h3>
      <div class="steps">${steps.map((s, i) => `<a class="step ${s.done ? 'done' : ''}" href="${s.href}">
        <span class="step-n">${s.done ? '✓' : i + 1}</span><span>${s.label}</span><span class="chev">›</span></a>`).join('')}</div>` : ''}

    <div class="tiles">
      <a class="tile" href="#/spots"><span>★</span>OG SPOT</a>
      <a class="tile" href="#/teams"><span>🛡️</span>${t('nav_teams')}</a>
      <a class="tile" href="#/matches"><span>⚔️</span>${t('nav_matches')}</a>
      <a class="tile" href="#/how"><span>❓</span>${t('how_title')}</a>
    </div>`;
  bind(root, {
    ...challengeHandlers, ...gameHandlers,
    'inv-yes': (d) => act('respond_team_request', { p_team: d.id, p_player: p.id, p_accept: true }, 'ok_joined'),
    'inv-no': (d) => act('respond_team_request', { p_team: d.id, p_player: p.id, p_accept: false }, 'ok_saved'),
  });
}

// ---------- JAK TO DZIAŁA (wspólne) ----------
export function howItWorks() {
  const steps = [
    ['🗺️', t('how1_t'), t('how1_d')],
    ['🤝', t('how2_t'), t('how2_d')],
    ['🛡️', t('how3_t'), t('how3_d')],
    ['⚔️', t('how4_t'), t('how4_d')],
    ['✅', t('how5_t'), t('how5_d')],
    ['📊', t('how6_t'), t('how6_d')],
  ];
  return `<div class="how">${steps.map(([ic, title, d], i) => `<div class="how-step">
    <div class="how-ic">${ic}<i>${i + 1}</i></div><div><b>${title}</b><p>${d}</p></div></div>`).join('')}</div>`;
}

export function renderHow(root) {
  root.innerHTML = `<a class="back" href="#/home">← ${t('nav_home')}</a>
    <h1>❓ ${t('how_title')}</h1>
    <p class="muted">${t('how_intro')}</p>
    ${howItWorks()}
    <h3>📜 ${t('faq_title')}</h3>
    ${[1, 2, 3, 4, 5].map((i) => `<details class="faq"><summary>${t('faq' + i + '_q')}</summary><p>${t('faq' + i + '_a')}</p></details>`).join('')}
    <div class="row"><a class="btn primary" href="#/map">${t('go_to_map')}</a></div>`;
}

// ---------- GOŚĆ ----------
function landing(root) {
  const d = store.data;
  const ogs = d.court_reviews.filter((r) => r.og_spot && reviewValid(r) && courtById(r.court_id)).sort((x, y) => y.total - x.total);
  const games = upcomingGames();
  const leaders = SPORTS.map((s) => ({ s, top: standings(s).slice(0, 3).filter((r) => r.courts || r.w) }));

  root.innerHTML = `
    <section class="hero">
      <div class="hero-ball">🏀⚽</div>
      <div class="brand big">BB<span>KORT</span></div>
      <h1>${t('land_title')}</h1>
      <p>${t('land_sub')}</p>
      <div class="hero-cta">
        <a class="btn primary big" href="#/login/register">${t('land_join')}</a>
        <a class="btn big" href="#/map">🗺️ ${t('land_map')}</a>
      </div>
      <div class="hero-nums">
        <div><b>${d.courts.length}</b><span>${t('land_courts')}</span></div>
        <div><b>${ogs.length}</b><span>★ OG SPOT</span></div>
        <div><b>${d.teams.length}</b><span>${t('land_teams')}</span></div>
        <div><b>${games.length}</b><span>${t('land_games')}</span></div>
      </div>
    </section>

    ${games.length ? `<h2 class="center">🤝 ${t('land_games_title')}</h2><div class="matches">${games.slice(0, 3).map((g) => gameCard(g)).join('')}</div>
      <a class="btn ghost block" href="#/games">${t('g_see_all')} ›</a>` : ''}

    ${ogs.length ? `<h2 class="center">★ ${t('spots_title')}</h2>
      <div class="spot-list">${ogs.slice(0, 3).map((r) => { const c = courtById(r.court_id); return `<a class="spot" href="#/map/${esc(c.id)}"><div class="spot-ph">${SPORT_ICON[c.sport]}</div>
        <div class="spot-body"><b>${esc(courtName(c))}</b><div>${ogBadge(r)}</div></div><div class="rv-score small good"><b>${r.total}</b><span>/100</span></div></a>`; }).join('')}</div>
      <a class="btn ghost block" href="#/spots">${t('spots_all')} ›</a>` : ''}

    <h2 class="center">${t('how_title')}</h2>
    ${howItWorks()}

    <div class="features">
      <div class="feature"><span>★</span><b>${t('feat1_t')}</b><p>${t('feat1_d')}</p></div>
      <div class="feature"><span>🤝</span><b>${t('feat2_t')}</b><p>${t('feat2_d')}</p></div>
      <div class="feature"><span>🃏</span><b>${t('feat3_t')}</b><p>${t('feat3_d')}</p></div>
      <div class="feature"><span>📊</span><b>${t('feat4_t')}</b><p>${t('feat4_d')}</p></div>
    </div>

    ${leaders.some((l) => l.top.length) ? `<h2 class="center">👑 ${t('land_leaders')}</h2>
      <div class="leaders-grid">${leaders.filter((l) => l.top.length).map((l) => `<div class="lcol"><h4>${SPORT_ICON[l.s]} ${t('sport_' + l.s)}</h4>
        ${l.top.map((r) => `<a class="lrow" href="#/team/${esc(r.team.id)}"><span>${['🥇', '🥈', '🥉'][r.pos - 1]}</span>${teamTag(r.team)} ${esc(r.team.name)}<b>${r.courts} 👑</b></a>`).join('')}</div>`).join('')}</div>` : ''}

    <section class="hero bottom">
      <h2>${t('land_cta2')}</h2>
      <a class="btn primary big" href="#/login/register">${t('land_join')}</a>
      <p class="small muted">${t('land_login_q')} <a href="#/login">${t('login')}</a></p>
    </section>`;
  bind(root, gameHandlers);
}

export function renderHome(root) {
  if (store.me && !store.me._missing) dashboard(root);
  else landing(root);
}

