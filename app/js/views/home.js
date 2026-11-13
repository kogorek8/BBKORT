// START: zalogowany – widżety (tabela, mecze, kto gra, misje, dropy, aktualności);
//        gość – prezentacja pomysłu, konkurs z dropami, nagrody
import { t } from '../i18n.js';
import { SPORTS, SPORT_ICON, OPEN_STATUSES } from '../rules.js';
import { playerOvr, tier } from '../skills.js';
import { esc, bind, teamTag, fmtDate, toast } from '../ui.js';
import {
  store, act, myTeam, standings, isStaff, courtsOf, teamChallenges, teamById, myTeamRequests, myGames, upcomingGames, courtById, courtName,
  reviewValid, presentNow, profileById, unreadCount, playerRecord, T, now,
} from '../state.js';
import { actionsFor, challengeCard, challengeHandlers } from './matches.js';
import { gameCard, gameHandlers } from './games.js';
import { ogBadge } from './spots.js';
import { coins, missionsBlock, levelBar } from './shop.js';
import { seasonBanner } from './season.js';

// koszulka zawodnika (prosty "awatar" w kolorze drużyny)
export function jersey(p, team, size = 64) {
  const c = team?.color || '#ff7a1a';
  return `<svg class="jersey" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M18 6l8 4h12l8-4 12 10-8 10-4-3v33H18V23l-4 3-8-10z" fill="${esc(c)}" stroke="rgba(0,0,0,.45)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M26 10c2 5 10 5 12 0" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2"/>
    <text x="32" y="43" text-anchor="middle" font-size="20" font-weight="900" fill="#0d0f14" font-family="system-ui">${p.number ?? ''}</text></svg>`;
}

// ---------- wspólne klocki ----------
function postsBlock() {
  const posts = store.data.posts.filter((p) => p.active).sort((a, b) => Number(b.pinned) - Number(a.pinned) || T(b.created_at) - T(a.created_at)).slice(0, 5);
  if (!posts.length) return '';
  return `<div class="posts">${posts.map((p) => {
    const inner = `${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : ''}
      <div class="post-body"><span class="post-kind">${t('pk_' + p.kind)}</span><b>${esc(p.title)}</b>${p.body ? `<p>${esc(p.body)}</p>` : ''}</div>`;
    return p.link_url ? `<a class="post k-${p.kind}" href="${esc(p.link_url)}" ${/^https?:/.test(p.link_url) ? 'target="_blank" rel="noopener sponsored"' : ''}>${inner}</a>` : `<div class="post k-${p.kind}">${inner}</div>`;
  }).join('')}</div>`;
}

function dropBlock(guest) {
  const d = store.data.drops.filter((x) => x.status === 'active').sort((a, b) => T(b.created_at) - T(a.created_at))[0];
  const last = store.data.drops.filter((x) => x.status === 'claimed').sort((a, b) => T(b.claimed_at) - T(a.claimed_at))[0];
  if (!d) {
    return guest ? `<div class="drop idle"><div class="drop-ic">🎁</div><div class="drop-body"><b>${t('drop_title')}</b><p>${t('drop_explain')}</p>
      ${last ? `<div class="small">${t('drop_last', { nick: esc(profileById(last.claimed_by)?.nick || '?'), title: esc(last.title) })}</div>` : ''}</div></div>` : '';
  }
  return `<div class="drop"><div class="drop-ic">🎁</div><div class="drop-body"><div class="post-kind">${t('drop_active')}</div><b>${esc(d.title)}</b>
    ${d.prize ? `<div class="small">🏆 ${esc(d.prize)} + ${coins(d.coins + 20)}</div>` : ''}
    ${d.hint ? `<p>💡 ${esc(d.hint)}</p>` : ''}
    ${guest ? `<a class="btn primary small" href="#/login/register">${t('drop_join')}</a>`
    : `<div class="row"><input id="dropcode" placeholder="${t('drop_code_ph')}" autocapitalize="characters" style="flex:1"><button class="btn primary" data-act="drop" data-id="${esc(d.id)}">${t('drop_claim')}</button></div>`}
    <div class="small muted">${t('drop_explain')}</div></div></div>`;
}

function tableWidget(sport, myTeamId) {
  const rows = standings(sport).slice(0, 5);
  return `<a class="widget" href="#/table"><div class="w-head"><b>📊 ${t('nav_table')} ${SPORT_ICON[sport]}</b><span class="chev">›</span></div>
    ${rows.map((r) => `<div class="w-row ${r.team.id === myTeamId ? 'me' : ''}"><span class="w-pos">${r.pos}</span>${teamTag(r.team)}<span class="w-name">${esc(r.team.name)}</span><b>${r.courts} 👑</b><span class="muted small">${r.w}-${r.l}</span></div>`).join('')
      || `<p class="muted small">${t('no_teams')}</p>`}</a>`;
}

function upcomingWidget(team) {
  const ch = store.data.challenges.filter((c) => ['pending', 'accepted'].includes(c.status) && c.kind !== 'claim' && T(c.scheduled_at) > now() - 2 * 3600e3)
    .sort((a, b) => T(a.scheduled_at) - T(b.scheduled_at));
  const mine = team ? ch.filter((c) => c.challenger_team_id === team.id || c.defender_team_id === team.id) : [];
  const list = (mine.length ? mine : ch).slice(0, 3);
  const games = upcomingGames().slice(0, 2);
  return `<div class="widget"><a class="w-head" href="#/matches"><b>📅 ${t('w_upcoming')}</b><span class="chev">›</span></a>
    ${list.map((c) => `<a class="w-row" href="#/matches"><span>⚔️</span>${teamTag(teamById(c.challenger_team_id))}<span class="muted small">vs</span>${teamTag(teamById(c.defender_team_id))}
      <span class="w-name">${esc(courtName(courtById(c.court_id)))}</span><span class="small">${fmtDate(c.scheduled_at)}</span></a>`).join('')}
    ${games.map((g) => `<a class="w-row" href="#/games"><span>🤝</span><span class="w-name">${SPORT_ICON[g.sport] || ''} ${esc(courtName(courtById(g.court_id)))}</span><span class="small">${fmtDate(g.starts_at)}</span></a>`).join('')}
    ${!list.length && !games.length ? `<p class="muted small">${t('w_upcoming_none')}</p>` : ''}</div>`;
}

function presenceWidget() {
  const pr = presentNow();
  const by = {};
  pr.forEach((x) => { (by[x.court_id] = by[x.court_id] || []).push(x); });
  const rows = Object.entries(by).filter(([cid]) => courtById(cid)).slice(0, 4);
  return `<div class="widget"><a class="w-head" href="#/map"><b>🟢 ${t('w_playing_now')}</b><span class="pill ok">${pr.length}</span></a>
    ${rows.map(([cid, xs]) => `<a class="w-row" href="#/map/${esc(cid)}"><span>${SPORT_ICON[courtById(cid).sport]}</span><span class="w-name">${esc(courtName(courtById(cid)))}</span>
      <span class="small">${xs.slice(0, 3).map((x) => esc(profileById(x.player_id)?.nick || '?')).join(', ')}${xs.length > 3 ? ` +${xs.length - 3}` : ''}</span></a>`).join('')
      || `<p class="muted small">${t('w_playing_none')}</p>`}</div>`;
}

// ---------- ZALOGOWANY ----------
function dashboard(root) {
  const p = store.me;
  const tm = myTeam();
  const sport = tm ? tm.sport : p.sport;
  const o = playerOvr(p, sport);
  const rec = playerRecord(p.id);
  const urgent = store.data.challenges.filter((c) => OPEN_STATUSES.includes(c.status) && actionsFor(c).some((a) => a.urgent));
  const invites = myTeamRequests().filter((r) => r.kind === 'invite');
  const mine = myGames();
  const row = tm ? standings(tm.sport).find((r) => r.team.id === tm.id) : null;
  const steps = [
    { done: !!p.position, label: t('step_profile'), href: '#/player/me', c: 10 },
    { done: !!tm, label: t('step_team'), href: '#/teams', c: 20 },
    { done: (p.checkins || 0) > 0, label: t('step_checkin'), href: '#/map', c: 5 },
    { done: !!(tm && (courtsOf(tm.id).length || teamChallenges(tm.id).length)), label: t('step_court'), href: '#/map', c: 15 },
  ];
  const stepsDone = steps.filter((s) => s.done).length;
  const staffTodo = isStaff() ? store.data.challenges.filter((c) => ['review', 'reported'].includes(c.status)).length
    + store.data.profiles.filter((x) => x.skills_status === 'pending').length + store.data.match_stats.filter((m) => m.status === 'pending').length
    + store.data.pending_courts.length + store.data.purchases.filter((x) => x.status === 'pending').length : 0;

  root.innerHTML = `
    <a class="mecard f-${esc(p.frame || 'none')}" href="#/player/me" style="--c:${esc(tm?.color || '#ff7a1a')}">
      ${jersey(p, tm, 62)}
      <div class="mecard-body">
        <div class="small muted">${t('hello')}</div>
        <div class="mecard-name">${esc(p.nick)}</div>
        <div class="small">${tm ? `${teamTag(tm)} ${esc(tm.name)}${row ? ` · #${row.pos}` : ''}` : `<span class="muted">${t('free_agent')}</span>`}</div>
        <div class="small muted">${SPORT_ICON[sport]} ${rec.played} ${t('matches_played').toLowerCase()} · ${rec.w} ${t('wins').toLowerCase()} · 📍 ${p.checkins || 0}</div>
      </div>
      <div class="ovr ${tier(o)}">${o ?? '—'}</div>
    </a>
    <div class="walletbar"><a href="#/shop" class="wb-coins">🪙 <b>${p.coins || 0}</b> OG Coins ›</a>${levelBar(p)}</div>

    ${dropBlock(false)}

    ${staffTodo ? `<a class="notice staff" href="#/admin">🧑‍⚖️ ${t('staff_todo2', { n: staffTodo })} ›</a>` : ''}
    ${invites.map((r) => { const x = teamById(r.team_id); return x ? `<div class="notice row-between"><span>📩 ${teamTag(x)} <b>${esc(x.name)}</b> ${t('invites_you')}</span>
      <span><button class="btn small primary" data-act="inv-yes" data-id="${esc(x.id)}">${t('accept_invite')}</button> <button class="btn small ghost" data-act="inv-no" data-id="${esc(x.id)}">✕</button></span></div>` : ''; }).join('')}
    ${urgent.length ? `<h3>🔔 ${t('needs_action')} (${urgent.length})</h3><div class="matches">${urgent.slice(0, 2).map((c) => challengeCard(c)).join('')}</div>
      ${urgent.length > 2 ? `<a class="btn ghost block" href="#/matches">${t('see_all')}</a>` : ''}` : ''}

    <div class="widgets">
      ${tableWidget(sport, tm?.id)}
      ${upcomingWidget(tm)}
      ${presenceWidget()}
    </div>

    ${mine.length ? `<h3>🤝 ${t('g_mine')}</h3><div class="matches">${mine.slice(0, 2).map((g) => gameCard(g)).join('')}</div>` : ''}

    ${missionsBlock()}
    ${seasonBanner()}
    ${postsBlock()}

    ${!tm ? `<div class="teambox empty"><p>${t('no_team_yet')}</p><div class="row"><a class="btn primary" href="#/teams">${t('find_or_create_team')}</a></div></div>` : ''}
    ${stepsDone < steps.length ? `<h3>🚀 ${t('first_steps')} (${stepsDone}/${steps.length})</h3>
      <div class="steps">${steps.map((s, i) => `<a class="step ${s.done ? 'done' : ''}" href="${s.href}">
        <span class="step-n">${s.done ? '✓' : i + 1}</span><span>${s.label}</span>${coins('+' + s.c)}</a>`).join('')}</div>` : ''}

    <div class="tiles">
      <a class="tile" href="#/shop"><span>🎁</span>${t('tile_rewards')}</a>
      <a class="tile" href="#/season"><span>🏅</span>${t('tile_season')}</a>
      <a class="tile" href="#/spots"><span>★</span>OG SPOT</a>
      <a class="tile" href="#/teams"><span>🛡️</span>${t('nav_teams')}</a>
      <a class="tile" href="#/inbox"><span>🔔</span>${t('inbox_title')}${unreadCount() ? ` (${unreadCount()})` : ''}</a>
      <a class="tile" href="#/how"><span>❓</span>${t('how_title')}</a>
    </div>
    <p class="small muted center">BBKORT · ${esc(document.body.dataset.version || '')}</p>`;
  bind(root, {
    ...challengeHandlers, ...gameHandlers, drop: claimDrop(root),
    'inv-yes': (d) => act('respond_team_request', { p_team: d.id, p_player: p.id, p_accept: true }, 'ok_joined'),
    'inv-no': (d) => act('respond_team_request', { p_team: d.id, p_player: p.id, p_accept: false }, 'ok_saved'),
  });
}

const claimDrop = (root) => async (d) => {
  const code = root.querySelector('#dropcode').value;
  if (!code.trim()) return;
  const ok = await act('claim_drop', { p_id: d.id, p_code: code });
  if (ok === true) toast(t('ok_drop'), 'ok'); else if (ok === false) toast(t('drop_wrong'), 'err');
};

// ---------- JAK TO DZIAŁA (wspólne) ----------
export function howItWorks() {
  const steps = [
    ['🗺️', t('how1_t'), t('how1_d')],
    ['🤝', t('how2_t'), t('how2_d')],
    ['🛡️', t('how3_t'), t('how3_d')],
    ['⚔️', t('how4_t'), t('how4_d')],
    ['✅', t('how5_t'), t('how5_d')],
    ['🪙', t('how6_t'), t('how6_d')],
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
    ${[1, 2, 3, 4, 5, 6].map((i) => `<details class="faq"><summary>${t('faq' + i + '_q')}</summary><p>${t('faq' + i + '_a')}</p></details>`).join('')}
    <div class="row"><a class="btn primary" href="#/map">${t('go_to_map')}</a></div>`;
}

// ---------- GOŚĆ ----------
const heroArt = () => `<svg class="hero-art" viewBox="0 0 360 150" aria-hidden="true">
  <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a1a" stop-opacity=".0"/><stop offset="1" stop-color="#ff7a1a" stop-opacity=".22"/></linearGradient></defs>
  <path d="M20 140 L100 40 H260 L340 140Z" fill="url(#hg)" stroke="#ff7a1a" stroke-width="2" stroke-opacity=".7"/>
  <path d="M132 40 L112 140 M228 40 L248 140 M112 140 H248" fill="none" stroke="#ff7a1a" stroke-width="2" stroke-opacity=".6"/>
  <ellipse cx="180" cy="96" rx="44" ry="12" fill="none" stroke="#ff7a1a" stroke-width="2" stroke-opacity=".6"/>
  <g transform="translate(180 36)"><path d="M0 0c-13 0-22 9-22 21 0 15 22 34 22 34s22-19 22-34C22 9 13 0 0 0z" fill="#ffd23f" stroke="#0d0f14" stroke-width="2"/><text y="27" text-anchor="middle" font-size="18">👑</text></g>
  <g transform="translate(84 78) scale(.7)"><path d="M0 0c-13 0-22 9-22 21 0 15 22 34 22 34s22-19 22-34C22 9 13 0 0 0z" fill="#2ec4b6" stroke="#0d0f14" stroke-width="2"/><text y="27" text-anchor="middle" font-size="18">🏀</text></g>
  <g transform="translate(282 74) scale(.7)"><path d="M0 0c-13 0-22 9-22 21 0 15 22 34 22 34s22-19 22-34C22 9 13 0 0 0z" fill="#9b5de5" stroke="#0d0f14" stroke-width="2"/><text y="27" text-anchor="middle" font-size="18">⚽</text></g>
  <text x="52" y="38" font-size="20">🎁</text><text x="296" y="34" font-size="18">🪙</text></svg>`;

function landing(root) {
  const d = store.data;
  const ogs = d.court_reviews.filter((r) => r.og_spot && reviewValid(r) && courtById(r.court_id)).sort((x, y) => y.total - x.total);
  const games = upcomingGames();
  const rewards = d.shop_items.filter((i) => i.active && i.kind === 'reward').slice(0, 3);
  const leaders = SPORTS.map((s) => ({ s, top: standings(s).slice(0, 3).filter((r) => r.courts || r.w) }));

  root.innerHTML = `
    <section class="hero">
      ${heroArt()}
      <h1 class="hero-title">OG <span>SPOT</span></h1>
      <div class="hero-tag">${t('land_tag')}</div>
      <div class="hero-tag2">${t('land_tag2')}</div>
      <p>${t('land_sub')}</p>
      <div class="hero-cta">
        <a class="btn primary big" href="#/login/register">${t('land_join')}</a>
        <a class="btn big" href="#/map">🗺️ ${t('land_map')}</a>
      </div>
      <div class="hero-nums">
        <div><b>${d.courts.length}</b><span>${t('land_courts')}</span></div>
        <div><b>${d.profiles.length}</b><span>${t('land_players')}</span></div>
        <div><b>${d.teams.length}</b><span>${t('land_teams')}</span></div>
        <div><b>${presentNow().length}</b><span>${t('land_now')}</span></div>
      </div>
    </section>

    ${dropBlock(true)}

    <h2 class="center">${t('how_title')}</h2>
    ${howItWorks()}

    <h2 class="center">🪙 ${t('land_rewards_title')}</h2>
    <p class="center muted">${t('land_rewards_sub')}</p>
    <div class="features">
      <div class="feature"><span>🎁</span><b>${t('lr1_t')}</b><p>${t('lr1_d')}</p></div>
      <div class="feature"><span>🏅</span><b>${t('lr2_t')}</b><p>${t('lr2_d')}</p></div>
      <div class="feature"><span>🏆</span><b>${t('lr3_t')}</b><p>${t('lr3_d')}</p></div>
      <div class="feature"><span>🃏</span><b>${t('lr4_t')}</b><p>${t('lr4_d')}</p></div>
    </div>
    ${rewards.length ? `<div class="items">${rewards.map((i) => `<div class="item k-reward"><div class="item-ic">🎁</div><div class="item-body"><b>${esc(i.title)}</b>${i.sponsor ? `<span class="sponsor">${t('sponsored_by')} ${esc(i.sponsor)}</span>` : ''}</div>${coins(i.cost)}</div>`).join('')}</div>` : ''}
    ${seasonBanner()}

    ${postsBlock()}

    ${games.length ? `<h2 class="center">🤝 ${t('land_games_title')}</h2><div class="matches">${games.slice(0, 3).map((g) => gameCard(g)).join('')}</div>
      <a class="btn ghost block" href="#/games">${t('g_see_all')} ›</a>` : ''}

    ${ogs.length ? `<h2 class="center">★ ${t('spots_title')}</h2>
      <div class="spot-list">${ogs.slice(0, 3).map((r) => { const c = courtById(r.court_id); return `<a class="spot" href="#/map/${esc(c.id)}"><div class="spot-ph">${SPORT_ICON[c.sport]}</div>
        <div class="spot-body"><b>${esc(courtName(c))}</b><div>${ogBadge(r)}</div></div><div class="rv-score small good"><b>${r.total}</b><span>/100</span></div></a>`; }).join('')}</div>
      <a class="btn ghost block" href="#/spots">${t('spots_all')} ›</a>` : ''}

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
