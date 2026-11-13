// Automatyczne wyszukiwanie boisk (koszykówka + piłka nożna):
//  - OpenStreetMap (Overpass API) – darmowe, zawsze włączone
//  - Google Places – tylko gdy ustawiono GOOGLE_MAPS_API_KEY
import { CONFIG } from './config.js';

// kilka serwerów – gdy jeden jest przeciążony, próbujemy następnego
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OSM_SPORT = { basketball: 'basketball', soccer: 'football' };

export async function fetchOSM(b) {
  const q = `[out:json][timeout:25];(nwr["leisure"="pitch"]["sport"~"basketball|soccer"](${b.s},${b.w},${b.n},${b.e}););out center tags 400;`;
  let j = null, lastErr = null;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      if (!r.ok) throw new Error('overpass ' + r.status);
      j = await r.json();
      break;
    } catch (e) { lastErr = e; }
  }
  if (!j) throw lastErr || new Error('overpass');
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

// Gotowe obszary miast (s, w, n, e) – do importu jednym kliknięciem w Panelu
export const CITY_PRESETS = {
  'Rzeszów': [49.96, 21.88, 50.11, 22.12],
  'Podkarpacie (całe województwo)': [49.0, 21.1, 50.85, 23.6],
  'Przemyśl': [49.74, 22.70, 49.82, 22.85],
  'Stalowa Wola': [50.53, 22.00, 50.62, 22.12],
  'Mielec': [50.25, 21.37, 50.33, 21.50],
  'Tarnobrzeg': [50.53, 21.62, 50.62, 21.75],
  'Krosno': [49.65, 21.70, 49.73, 21.82],
  'Dębica': [50.02, 21.36, 50.08, 21.46],
  'Jarosław': [49.98, 22.63, 50.05, 22.73],
  'Sanok': [49.53, 22.16, 49.60, 22.25],
  'Jasło': [49.72, 21.42, 49.78, 21.52],
  'Łańcut': [50.04, 22.19, 50.10, 22.27],
  'Warszawa': [52.09, 20.85, 52.37, 21.28],
  'Kraków': [49.97, 19.79, 50.13, 20.22],
  'Łódź': [51.68, 19.32, 51.86, 19.64],
  'Wrocław': [51.04, 16.80, 51.21, 17.18],
  'Poznań': [52.29, 16.73, 52.51, 17.07],
  'Trójmiasto': [54.27, 18.43, 54.58, 18.80],
  'Szczecin': [53.35, 14.44, 53.52, 14.74],
  'Bydgoszcz': [53.07, 17.87, 53.21, 18.21],
  'Lublin': [51.17, 22.45, 51.30, 22.68],
  'Katowice i okolice': [50.15, 18.85, 50.40, 19.25],
  'Białystok': [53.08, 23.05, 53.18, 23.25],
  'Rzeszów': [49.97, 21.90, 50.10, 22.08],
  'Olsztyn': [53.72, 20.40, 53.82, 20.56],
  'Kielce': [50.83, 20.55, 50.92, 20.72],
  'Opole': [50.62, 17.85, 50.72, 18.02],
  'Toruń': [52.97, 18.50, 53.07, 18.72],
  'Częstochowa': [50.76, 19.05, 50.86, 19.20],
  'Radom': [51.36, 21.08, 51.45, 21.24],
};

// dzieli duży obszar na kafelki ~10 km, żeby nie przeciążyć serwera
export function tiles([s, w, n, e], dLat = 0.09, dLng = 0.14) {
  // duży obszar (np. województwo) → większe kafelki, mniej zapytań
  if ((n - s) * (e - w) > 0.5) { dLat = 0.47; dLng = 0.65; }
  const out = [];
  for (let a = s; a < n; a += dLat) for (let b = w; b < e; b += dLng) {
    out.push({ s: a, w: b, n: Math.min(a + dLat, n), e: Math.min(b + dLng, e) });
  }
  return out;
}
