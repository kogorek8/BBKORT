// Automatyczne wyszukiwanie boisk do koszykówki:
//  - OpenStreetMap (Overpass API) – darmowe, zawsze włączone
//  - Google Places – tylko gdy ustawiono GOOGLE_MAPS_API_KEY
import { CONFIG } from './config.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

export async function fetchOSM(b) {
  const q = `[out:json][timeout:25];(nwr["leisure"="pitch"]["sport"~"basketball"](${b.s},${b.w},${b.n},${b.e}););out center tags 300;`;
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!r.ok) throw new Error('overpass ' + r.status);
  const j = await r.json();
  return (j.elements || []).map((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) return null;
    const tg = el.tags || {};
    const address = [tg['addr:street'], tg['addr:housenumber']].filter(Boolean).join(' ') || tg['addr:city'] || '';
    return { external_id: `osm:${el.type}/${el.id}`, name: tg.name || '', lat, lng, address, source: 'osm' };
  }).filter(Boolean);
}

let googleReady = null;
export function loadGoogle() {
  const key = CONFIG.GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('no key'));
  if (googleReady) return googleReady;
  googleReady = new Promise((resolve, reject) => {
    window.__bbGoogleReady = () => resolve(window.google);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__bbGoogleReady`;
    s.async = true;
    s.onerror = () => reject(new Error('google load failed'));
    document.head.appendChild(s);
  });
  return googleReady;
}

export async function fetchGoogle(b) {
  await loadGoogle();
  const { Place } = await google.maps.importLibrary('places');
  const { places } = await Place.searchByText({
    textQuery: CONFIG.GOOGLE_QUERY,
    fields: ['id', 'displayName', 'location', 'formattedAddress'],
    locationRestriction: { north: b.n, south: b.s, east: b.e, west: b.w },
    maxResultCount: 20,
  });
  return (places || []).map((p) => ({
    external_id: 'g:' + p.id, name: p.displayName || '', lat: p.location.lat(), lng: p.location.lng(),
    address: p.formattedAddress || '', source: 'google',
  }));
}

// Google Map Tiles API – oficjalne kafelki satelitarne Google (wymaga klucza)
export async function googleSatelliteUrl() {
  const key = CONFIG.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'satellite', layerTypes: ['layerRoadmap'], language: 'pl-PL', region: 'PL' }),
  });
  if (!r.ok) return null;
  const { session } = await r.json();
  return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${session}&key=${encodeURIComponent(key)}`;
}

export async function fetchArea(b) {
  const out = [];
  const jobs = [fetchOSM(b).then((x) => out.push(...x))];
  if (CONFIG.GOOGLE_MAPS_API_KEY) jobs.push(fetchGoogle(b).then((x) => out.push(...x)));
  const res = await Promise.allSettled(jobs);
  if (res.every((r) => r.status === 'rejected')) throw res[0].reason;
  return out;
}
