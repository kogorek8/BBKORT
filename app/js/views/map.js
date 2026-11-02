// Mapa boisk – tryb "King of the Court"
import { CONFIG } from '../config.js';
import { api } from '../api/index.js';
import { t } from '../i18n.js';
import { RULES, distM } from '../rules.js';
import { geo, currentPos } from '../geo.js';
import { fetchArea, googleSatelliteUrl } from '../courts-import.js';
import { esc, bind, modal, toast, fmtDate, fmtLeft, fmtDist, teamTag, localInputValue, confirmBox } from '../ui.js';
import {
  store, act, reload, now, T, teamById, myTeam, isCaptainOf, isAdmin, openChallengeForCourt,
  courtName, courtHistory, courtById, errText,
} from '../state.js';

let map, markers, meMarker, meCircle, layers = {}, curLayer = null;
let openCourtId = null, followedFirstFix = false, userMoved = false;
const PREF = 'bbkort_layer';

export function initMap() {
  map = L.map('map', { zoomControl: false }).setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const esri = (path) => `https://server.arcgisonline.com/ArcGIS/rest/services/${path}/MapServer/tile/{z}/{y}/{x}`;
  layers.sat = L.layerGroup([
    L.tileLayer(esri('World_Imagery'), { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
    L.tileLayer(esri('Reference/World_Transportation'), { maxZoom: 20, maxNativeZoom: 19, opacity: 0.7 }),
    L.tileLayer(esri('Reference/World_Boundaries_and_Places'), { maxZoom: 20, maxNativeZoom: 19 }),
  ]);
  layers.map = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap' });

  let pref = 'sat';
  try { pref = localStorage.getItem(PREF) || 'sat'; } catch { /* ignore */ }
  setLayer(pref === 'gsat' ? 'sat' : pref);
  if (CONFIG.GOOGLE_MAPS_API_KEY) {
    googleSatelliteUrl().then((url) => {
      if (!url) return;
      layers.gsat = L.tileLayer(url, { maxZoom: 21, attribution: 'Imagery & map data © Google' });
      if (pref === 'gsat' || pref === 'sat') setLayer('gsat');
    }).catch(() => {});
  }

  markers = L.layerGroup().addTo(map);
  map.on('dragstart zoomstart', () => (userMoved = true));
  map.on('moveend', scheduleImport);

  geo.listeners.add(updateMe);
  if (geo.pos) updateMe(geo.pos);

  const ctr = document.getElementById('map-controls');
  ctr.innerHTML = `
    <button class="fab" data-act="layer" title="${t('map_layer')}">🛰️</button>
    <button class="fab" data-act="locate" title="${t('map_locate')}">📍</button>
    <button class="fab" data-act="search" title="${t('map_search')}">🔍</button>
    <div class="map-status" id="map-status"></div>`;
  bind(ctr, {
    layer: () => {
      const order = ['sat', ...(layers.gsat ? ['gsat'] : []), 'map'];
      const nxt = order[(order.indexOf(curLayer) + 1) % order.length];
      setLayer(nxt);
      toast(t('layer_' + nxt));
    },
    locate: async () => {
      const p = await currentPos();
      if (p) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15));
      else toast(t('gps_unavailable'), 'err');
    },
    search: () => importVisible(true),
  });

  bind(document.getElementById('court-sheet'), sheetHandlers);
  setTimeout(() => scheduleImport(), 1500);
}

function setLayer(name) {
  if (!layers[name]) name = 'sat';
  if (curLayer && layers[curLayer]) map.removeLayer(layers[curLayer]);
  layers[name].addTo(map);
  curLayer = name;
  try { localStorage.setItem(PREF, name); } catch { /* ignore */ }
}

function updateMe(p) {
  if (!map) return;
  const ll = [p.lat, p.lng];
  if (!meMarker) {
    meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 1000 }).addTo(map);
    meCircle = L.circle(ll, { radius: p.acc || 30, color: '#4da3ff', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
  } else {
    meMarker.setLatLng(ll);
    meCircle.setLatLng(ll).setRadius(p.acc || 30);
  }
  if (!followedFirstFix && !userMoved) {
    followedFirstFix = true;
    map.setView(ll, 15);
  }
  if (openCourtId) renderSheet();
}

export function showMap() {
  if (map) setTimeout(() => map.invalidateSize(), 50);
}

export function refreshMap() {
  if (!map || !store.data) return;
  markers.clearLayers();
  for (const c of store.data.courts) {
    const k = c.king_team_id ? teamById(c.king_team_id) : null;
    const busy = !!openChallengeForCourt(c.id);
    const html = `<div class="pin ${k ? 'owned' : 'free'} ${busy ? 'busy' : ''}" style="--c:${k ? esc(k.color) : '#9aa3b2'}">
        <span class="pin-ball">🏀</span>${k ? `<span class="pin-crown">👑</span><span class="pin-tag">${esc(k.tag)}</span>` : ''}${busy ? '<span class="pin-fight">⚔️</span>' : ''}
      </div>`;
    const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', html, iconSize: [44, 52], iconAnchor: [22, 48] }) });
    m.on('click', () => openCourt(c.id));
    markers.addLayer(m);
  }
  if (openCourtId) {
    if (courtById(openCourtId)) renderSheet(); else closeSheet();
  }
}

export function focusCourt(id) {
  const c = courtById(id);
  if (!c || !map) return;
  userMoved = true;
  map.setView([c.lat, c.lng], 17);
  openCourt(id);
}

function openCourt(id) {
  openCourtId = id;
  renderSheet();
}

function closeSheet() {
  openCourtId = null;
  const el = document.getElementById('court-sheet');
  el.hidden = true;
  el.innerHTML = '';
}

function distTo(c) {
  return geo.pos ? distM(geo.pos.lat, geo.pos.lng, c.lat, c.lng) : null;
}

const histLabel = (h) => {
  const tm = h.team_id ? teamById(h.team_id) : null;
  return `<li><span class="muted">${fmtDate(h.at)}</span> ${tm ? teamTag(tm) : ''} ${t('hist_' + h.event)}</li>`;
};

function renderSheet() {
  const el = document.getElementById('court-sheet');
  const c = courtById(openCourtId);
  if (!c) return closeSheet();
  const king = c.king_team_id ? teamById(c.king_team_id) : null;
  const mine = myTeam();
  const d = distTo(c);
  const near = d != null && d <= RULES.CHECKIN_RADIUS_M;
  const fake = api.mode === 'demo' && api.demo.fakeGps();
  const protLeft = c.protected_until ? T(c.protected_until) - now() : 0;
  const open = openChallengeForCourt(c.id);
  const hist = courtHistory(c.id).slice(0, 5);

  let kingHtml;
  if (king) {
    kingHtml = `<div class="king" style="--c:${esc(king.color)}">
      <div class="king-crown">👑</div>
      <div><div class="muted small">${t('king_of_court')}</div>
        <a href="#/team/${esc(king.id)}" class="king-name">${esc(king.name)} ${teamTag(king)}</a>
        <div class="small muted">${t('since')} ${fmtDate(c.king_since)} · ${t('defenses')}: <b>${c.defenses}</b></div></div></div>
      ${protLeft > 0 ? `<div class="pill shield">🛡️ ${t('protected_for')} ${fmtLeft(protLeft)}</div>` : ''}`;
  } else {
    kingHtml = `<div class="king free"><div class="king-crown">🏳️</div><div><b>${t('court_free')}</b><div class="small muted">${t('court_free_hint')}</div></div></div>`;
  }

  let actions = '';
  if (!store.me) {
    actions = `<a class="btn primary block" href="#/login">${t('login_to_play')}</a>`;
  } else if (!mine) {
    actions = `<a class="btn block" href="#/teams">${t('need_team')}</a>`;
  } else if (!king) {
    actions = `<button class="btn primary block" data-act="claim" ${near || fake ? '' : 'disabled'}>👑 ${t('claim_court')}</button>
      ${near || fake ? '' : `<div class="small muted center">${t('be_closer', { m: RULES.CHECKIN_RADIUS_M })}</div>`}`;
  } else if (king.id === mine.id) {
    actions = `<div class="pill ok block">🏰 ${t('your_court')}</div>`;
  } else if (open) {
    actions = `<a class="btn block" href="#/matches">⚔️ ${t('challenge_in_progress')}</a>`;
  } else if (!isCaptainOf(mine.id)) {
    actions = `<div class="small muted center">${t('only_captain_challenges')}</div>`;
  } else {
    actions = `<button class="btn primary block" data-act="challenge" ${protLeft > 0 ? 'disabled' : ''}>⚔️ ${t('challenge_king')}</button>`;
  }
  if (open && !(king && mine && king.id !== mine.id)) {
    const ct = teamById(open.challenger_team_id);
    actions += `<a class="btn ghost block" href="#/matches">⚔️ ${t('challenged_by')} ${teamTag(ct)} · ${fmtDate(open.scheduled_at)}</a>`;
  }

  el.innerHTML = `
    <div class="sheet-handle" data-act="close"></div>
    <button class="sheet-x" data-act="close">×</button>
    <h2>${esc(courtName(c))}</h2>
    <div class="small muted">${esc(c.address || '')}${d != null ? ` · ${fmtDist(d)} ${t('from_you')}` : ''} · <span class="src">${esc(c.source)}</span></div>
    ${kingHtml}
    <div class="sheet-actions">${actions}</div>
    <div class="row">
      <a class="btn ghost small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">🧭 ${t('navigate')}</a>
      ${isAdmin() ? `<button class="btn ghost small" data-act="reset">♻️ ${t('admin_reset_court')}</button>
        <button class="btn ghost small danger" data-act="del">🗑️</button>` : ''}
    </div>
    ${hist.length ? `<h4>${t('history')}</h4><ul class="hist">${hist.map(histLabel).join('')}</ul>` : ''}`;
  el.hidden = false;
}

const sheetHandlers = {
  close: closeSheet,
  async claim() {
    const p = await currentPos();
    await act('claim_court', { p_court: openCourtId, p_lat: p?.lat ?? null, p_lng: p?.lng ?? null }, 'ok_claimed');
  },
  challenge() {
    const c = courtById(openCourtId);
    const def = now() + 24 * 3600e3;
    modal(`<h3>⚔️ ${t('challenge_king')}</h3>
      <p class="muted">${esc(courtName(c))}</p>
      <label>${t('match_time')}<input type="datetime-local" id="ch-time" value="${localInputValue(def)}"></label>
      <p class="small muted">${t('challenge_rules', { h: RULES.ACCEPT_HOURS })}</p>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button>
      <button class="btn primary" id="ch-ok">${t('send_challenge')}</button></div>`, (m, close) => {
      m.querySelector('#ch-ok').onclick = async () => {
        const v = m.querySelector('#ch-time').value;
        const iso = new Date(v).toISOString();
        if (await act('create_challenge', { p_court: openCourtId, p_time: iso }, 'ok_challenge_sent')) close();
      };
    });
  },
  async reset() {
    if (await confirmBox(t('admin_reset_court') + '?')) act('admin_reset_court', { p_court: openCourtId }, 'ok_saved');
  },
  async del() {
    if (await confirmBox(t('admin_delete_court') + '?')) {
      const id = openCourtId; closeSheet();
      act('admin_delete_court', { p_court: id }, 'ok_saved');
    }
  },
};

// ---------- automatyczne wyszukiwanie boisk ----------
let importTimer, importing = false;
const searched = [];

function scheduleImport() {
  clearTimeout(importTimer);
  if (!CONFIG.AUTO_IMPORT) return;
  importTimer = setTimeout(() => importVisible(false), 900);
}

async function importVisible(force) {
  if (!map || importing) return;
  const status = document.getElementById('map-status');
  if (!api.canImport()) { if (force) toast(t('login_to_import'), 'err'); return; }
  if (map.getZoom() < CONFIG.AUTO_IMPORT_MIN_ZOOM) { if (force) toast(t('zoom_in_to_search')); return; }
  const view = map.getBounds();
  if (!force && searched.some((b) => b.contains(view))) return;
  const big = view.pad(0.4);
  importing = true;
  status.textContent = t('searching_courts');
  status.classList.add('on');
  try {
    const found = await fetchArea({ s: big.getSouth(), w: big.getWest(), n: big.getNorth(), e: big.getEast() });
    searched.push(big);
    let added = 0;
    for (let i = 0; i < found.length; i += 250) added += (await api.rpc('import_courts', { p_courts: found.slice(i, i + 250) })) || 0;
    if (added) { await reload(); toast(t('courts_found', { n: added }), 'ok'); }
    else if (force) toast(t('no_new_courts'));
  } catch (e) {
    if (force) toast(errText(e), 'err');
  } finally {
    importing = false;
    status.classList.remove('on');
  }
}
