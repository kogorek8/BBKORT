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

// ---------- IMPORT Z PLIKU / WKLEJONEGO TEKSTU ----------
// Obsługuje: KML (Google Moje Mapy), GeoJSON (Google Takeout "Zapisane"), CSV (nazwa;lat;lng)
// oraz zwykłe linie z linkami Google Maps albo współrzędnymi.
const okLL = (lat, lng) => isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

function llFromText(str) {
  let m = str.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)            // link Google: ...!3dLAT!4dLNG
    || str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)                     // link Google: @LAT,LNG
    || str.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i)
    || str.match(/(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/);        // "50.0412, 21.9991"
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

export function parseCourts(text, sport) {
  const out = [];
  const add = (name, lat, lng, address = '') => {
    if (!okLL(lat, lng)) return;
    out.push({ external_id: `file:${sport}:${lat.toFixed(5)},${lng.toFixed(5)}`, name: (name || '').trim().slice(0, 80), sport, lat, lng, address: (address || '').slice(0, 120), source: 'import' });
  };
  const t = text.trim();
  if (/^<\?xml|<kml/i.test(t)) {                                        // KML
    const doc = new DOMParser().parseFromString(t, 'text/xml');
    doc.querySelectorAll('Placemark').forEach((pm) => {
      const c = pm.querySelector('Point coordinates');
      if (!c) return;
      const [lng, lat] = c.textContent.trim().split(',').map(Number);
      add(pm.querySelector('name')?.textContent, lat, lng, pm.querySelector('address')?.textContent || '');
    });
  } else if (t[0] === '{' || t[0] === '[') {                             // GeoJSON
    const j = JSON.parse(t);
    for (const f of (j.features || (Array.isArray(j) ? j : []))) {
      const g = f.geometry, pr = f.properties || {};
      if (!g || g.type !== 'Point') continue;
      const loc = pr.location || pr.Location || {};
      add(pr.name || pr.Title || pr.title || loc.name || loc['Business Name'], Number(g.coordinates[1]), Number(g.coordinates[0]), loc.address || loc.Address || pr.address || '');
    }
  } else {                                                               // CSV / linie tekstu
    for (const line of t.split(/\r?\n/)) {
      const ll = llFromText(line);
      if (!ll) continue;
      const name = line.split(/[;\t]|,(?=\s*(?:https?:|-?\d))/)[0].replace(/https?:\S+/g, '').replace(/^"|"$/g, '').trim();
      const place = line.match(/\/maps\/place\/([^/@]+)/);            // nazwa z linku Google Maps
      let nm = /^-?\d/.test(name) ? '' : name;
      if (!nm && place) { try { nm = decodeURIComponent(place[1].replace(/\+/g, ' ')); } catch { nm = ''; } }
      add(nm, ll[0], ll[1]);
    }
  }
  return out;
}
