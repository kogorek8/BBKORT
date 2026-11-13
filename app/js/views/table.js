// TABELA: kto jest najwyżej, kto ma teren, kto co zdobył
import { t } from '../i18n.js';
import { SPORTS, SPORT_ICON } from '../rules.js';
import { esc, bind, teamTag, fmtDate } from '../ui.js';
import { store, standings, feed, teamById, courtById, courtName, ui, setSport, zones } from '../state.js';

const medal = (pos) => (pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos);

function tableFor(sport) {
  const rows = standings(sport);
  if (!rows.length) return `<p class="muted small">${t('no_teams')}</p>`;
  return `<div class="ltable-wrap"><table class="ltable">
    <thead><tr><th>#</th><th class="l">${t('team')}</th><th title="${t('courts_held')}">👑</th><th title="${t('zones')}">🚩</th>
      <th title="${t('wins')}">W</th><th title="${t('losses')}">L</th><th title="${t('defenses')}">🛡️</th><th title="${t('rating_temp')}">RTG</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="${r.pos === 1 ? 'lead' : ''}" style="--c:${esc(r.team.color)}">
      <td class="pos">${medal(r.pos)}</td>
      <td class="l"><a href="#/team/${esc(r.team.id)}">${teamTag(r.team)} <span class="tname">${esc(r.team.name)}</span></a></td>
      <td><b>${r.courts}</b></td><td>${r.zones}</td><td>${r.w}</td><td>${r.l}</td><td>${r.defenses}</td><td>${r.rating ?? '—'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function feedItem(h) {
  const tm = h.team_id ? teamById(h.team_id) : null;
  const c = courtById(h.court_id);
  const ch = h.challenge_id ? store.data.challenges.find((x) => x.id === h.challenge_id) : null;
  const ic = { claim: '🏳️', capture: '⚔️', defend: '🛡️' }[h.event] || '•';
  let extra = '';
  if (ch && h.event === 'capture') extra = ` ${t('from_team')} ${teamTag(teamById(ch.defender_team_id))}`;
  if (ch && h.event === 'defend') extra = ` ${t('against')} ${teamTag(teamById(ch.challenger_team_id))}`;
  if (ch && ch.score_challenger != null) extra += ` <b>${ch.score_challenger}:${ch.score_defender}</b>`;
  else if (ch && ch.status === 'walkover') extra += ` (${t('st_walkover').toLowerCase()})`;
  return `<li><span class="fic">${ic}</span><div>${teamTag(tm)} <b>${esc(tm?.name || '?')}</b> ${t('feed_' + h.event)}
    <a href="#/map/${esc(h.court_id)}">${SPORT_ICON[c?.sport] || ''} ${esc(courtName(c))}</a>${extra}
    <div class="small muted">${fmtDate(h.at)}</div></div></li>`;
}

export function renderTable(root) {
  const sports = ui.sport === 'all' ? SPORTS : [ui.sport];
  const zs = zones();
  const owned = zs.filter((z) => z.owner).length;
  root.innerHTML = `
    <div class="page-head"><h1>📊 ${t('table_title')}</h1><a class="btn" href="#/teams">🛡️ ${t('nav_teams')}</a></div>
    <div class="seg wide">${['all', ...SPORTS].map((s) => `<button data-act="sport" data-s="${s}" class="${ui.sport === s ? 'on' : ''}">${s === 'all' ? t('all') : SPORT_ICON[s] + ' ' + t('sport_' + s)}</button>`).join('')}</div>
    <p class="small muted">${t('table_explain')}</p>
    ${sports.map((s) => `<h3>${SPORT_ICON[s]} ${t('sport_' + s)}</h3>${tableFor(s)}`).join('')}
    <p class="small muted">🚩 ${t('zones_summary', { n: owned, c: zs.length - owned })} · <a href="#/map">${t('see_on_map')}</a></p>
    <h3>📣 ${t('feed_title')}</h3>
    <ul class="feed">${feed(20).map(feedItem).join('') || `<li class="muted">${t('no_matches')}</li>`}</ul>`;
  bind(root, { sport: (d) => { setSport(d.s); renderTable(root); } });
}
