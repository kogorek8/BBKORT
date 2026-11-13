import { initApi, api } from './api/index.js';
import { t, getLang, setLang } from './i18n.js';
import { store, onRender, reload, softReload, myTeam, errText, isStaff, unreadCount } from './state.js';
import { startGeo } from './geo.js';
import { esc, teamTag } from './ui.js';
import { initMap, refreshMap, showMap, focusCourt } from './views/map.js';
import { renderTeams, renderTeam } from './views/teams.js';
import { renderPlayer } from './views/player.js';
import { renderMatches, pendingActionsCount } from './views/matches.js';
import { renderAdmin } from './views/admin.js';
import { renderAuth } from './views/auth.js';
import { renderTable } from './views/table.js';
import { renderHome, renderHow } from './views/home.js';
import { renderGames } from './views/games.js';
import { renderSpots } from './views/spots.js';
import { renderShop } from './views/shop.js';
import { renderInbox } from './views/inbox.js';
import { renderSeason } from './views/season.js';

const $ = (id) => document.getElementById(id);
let lastFocus = null;

function route() {
  const [name, param] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  return { name: name || 'home', param };
}

function renderChrome() {
  document.documentElement.lang = getLang();
  $('lang-btn').textContent = getLang() === 'pl' ? 'EN' : 'PL';
  const me = store.me;
  const tm = myTeam();
  $('user-chip').innerHTML = me
    ? `<a href="#/shop" class="top-coins">🪙 ${me.coins || 0}</a><a href="#/inbox" class="top-bell">🔔${unreadCount() ? `<i class="dot">${unreadCount()}</i>` : ''}</a><a href="#/player/me">${tm ? teamTag(tm) + ' ' : ''}${esc(me.nick)}</a>`
    : `<a href="#/login" class="btn small primary">${t('login')}</a>`;

  const demo = $('demo-bar');
  if (api.mode === 'demo') {
    demo.hidden = false;
    demo.innerHTML = `🧪 ${t('demo_bar')} <b>${esc(me?.nick || '—')}</b> · <a href="#/login">${t('switch_user')}</a>`;
  }

  const r = route().name;
  const badge = pendingActionsCount();
  const items = [
    ['home', '🏠', t('nav_home'), 0, 'home'],
    ['map', '🗺️', t('nav_map')],
    ['games', '🤝', t('nav_games')],
    ['matches', '⚔️', t('nav_matches'), badge],
    ['table', '📊', t('nav_table')],
    ...(isStaff() ? [['admin', '🛠️', t('nav_admin'), store.data.profiles.filter((p) => p.skills_status === 'pending').length + store.data.challenges.filter((c) => ['reported', 'review'].includes(c.status)).length + store.data.pending_courts.length + store.data.match_stats.filter((m) => m.status === 'pending').length + store.data.purchases.filter((x) => x.status === 'pending').length]] : []),
  ];
  $('nav').innerHTML = items.map(([key, ic, label, n, href]) => {
    const on = r === key || (key === 'table' && (r === 'team' || r === 'teams')) || (key === 'home' && ['how', 'player', 'spots', 'shop', 'inbox', 'season'].includes(r));
    return `<a href="#/${href || key}" class="${on ? 'on' : ''}"><span class="ic">${ic}${n ? `<i class="dot">${n}</i>` : ''}</span><span>${label}</span></a>`;
  }).join('');
}

function render() {
  if (!store.data) return;
  window.__bbBooted = true;
  renderChrome();
  const r = route();
  const page = $('page');
  if (r.name === 'map') {
    $('map-view').hidden = false;
    page.hidden = true;
    showMap();
    refreshMap();
    if (r.param && r.param !== lastFocus) { lastFocus = r.param; setTimeout(() => focusCourt(r.param), 80); }
    return;
  }
  lastFocus = null;
  $('map-view').hidden = true;
  page.hidden = false;
  switch (r.name) {
    case 'home': return renderHome(page);
    case 'how': return renderHow(page);
    case 'games': return renderGames(page);
    case 'spots': return renderSpots(page);
    case 'shop': return renderShop(page);
    case 'inbox': return renderInbox(page);
    case 'season': return renderSeason(page);
    case 'table': return renderTable(page);
    case 'teams': return renderTeams(page);
    case 'team': return renderTeam(page, r.param);
    case 'player': return renderPlayer(page, r.param || 'me');
    case 'matches': return renderMatches(page);
    case 'admin': return renderAdmin(page);
    case 'login': return renderAuth(page, r.param);
    default: location.hash = '#/home';
  }
}

async function boot() {
  $('lang-btn').onclick = () => { setLang(getLang() === 'pl' ? 'en' : 'pl'); render(); };
  try {
    await initApi();
    onRender(render);
    await reload();
  } catch (e) {
    window.__bbBooted = true;
    $('page').hidden = false;
    $('page').innerHTML = `<div class="auth"><h2>⚠️ ${t('err_generic')}</h2><p class="muted">${esc(errText(e))}</p><button class="btn primary" onclick="bbReload()">Odśwież</button></div>`;
    console.error(e);
    return;
  }
  initMap();
  refreshMap();
  startGeo();
  api.onChange(softReload);
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  // odświeżanie liczników co minutę (gdy nikt nie pisze w formularzu)
  setInterval(() => {
    const busy = document.querySelector('.modal-back') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (!busy) softReload();
  }, 60000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

export const VERSION = typeof __BB_VERSION__ !== 'undefined' ? __BB_VERSION__ : 'dev';

boot();
