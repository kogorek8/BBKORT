// Lokalizacja GPS telefonu (działa tylko na HTTPS i gdy strona jest otwarta)
export const geo = { pos: null, error: null, listeners: new Set() };

export function startGeo() {
  if (!navigator.geolocation) { geo.error = 'unsupported'; return; }
  navigator.geolocation.watchPosition(
    (p) => {
      geo.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: Date.now() };
      geo.error = null;
      geo.listeners.forEach((f) => f(geo.pos));
    },
    (e) => { geo.error = e.message || 'denied'; },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );
}

export function currentPos() {
  return new Promise((resolve) => {
    if (geo.pos && Date.now() - geo.pos.ts < 60000) return resolve(geo.pos);
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: Date.now() }),
      () => resolve(geo.pos),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}
