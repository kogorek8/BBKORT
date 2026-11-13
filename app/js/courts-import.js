// Automatyczne wyszukiwanie boisk (koszykówka + piłka nożna):
//  - OpenStreetMap (Overpass API) – darmowe, zawsze włączone
//  - Google Places – tylko gdy ustawiono GOOGLE_MAPS_API_KEY
import { CONFIG } from './config.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OSM_SPORT = { basketball: 'basketball', soccer: 'football' };

export async function fetchOSM(b) {
  const q = `[out:json][timeout:25];(nwr["leisure"="pitch"]["sport"~"basketball|soccer"](${b.s},${b.w},${b.n},${b.e}););out center tags 400;`;
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!r.ok) throw new Error('overpass ' + r.status);
  const j = await r.json();
  const out = [];
  for (const el of j.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const tg = el.tags || {};
    const address = [tg['addr:street'], tg['addr:housenumber']].filter(Boolean).join(' ') || tg['addr:city'] || '';
    // boisko wielofunkcyjne (np. "basketball;soccer") → osobne boisko dla każdego sportu
    const sports = [...new Set((tg.sport || '').split(';').map((s) => OSM_SPORT[s.trim()]).filter(Boolean))];
    sports.forEach((sport, i) => out.push({
      external_id: `osm:${el.type}/${el.id}:${sport}`, name: tg.name || '', sport,
      // lekkie przesunięcie, żeby pinezki dwóch sportów nie nachodziły na siebie
      lat: lat + i * 0.00012, lng, address, source: 'osm',
    }));
  }
  return out;
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
  const out = [];
  for (const [sport, textQuery] of Object.entries(CONFIG.GOOGLE_QUERIES)) {
    const { places } = await Place.searchByText({
      textQuery,
      fields: ['id', 'displayName', 'location', 'formattedAddress'],
      locationRestriction: { north: b.n, south: b.s, east: b.e, west: b.w },
      maxResultCount: 20,
    });
    for (const p of places || []) out.push({
      external_id: `g:${p.id}:${sport}`, name: p.displayName || '', sport,
      lat: p.location.lat(), lng: p.location.lng(), address: p.formattedAddress || '', source: 'google',
    });
  }
  return out;
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
