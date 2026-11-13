// =====================================================================
//  BBKORT – konfiguracja
//  Puste SUPABASE_* → aplikacja działa w TRYBIE DEMO (dane w przeglądarce).
//  Instrukcja uzupełnienia: README.md
// =====================================================================
export const CONFIG = {
  // Supabase → Project Settings → API
  SUPABASE_URL: 'https://rclgostlltwzscmmgtdf.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_yQoymNXEHOkRvNdnecHk6g_i8PEWAh2', // klucz publiczny (publishable) – może być w przeglądarce

  // Google Maps Platform (opcjonalnie): satelita Google + wyszukiwanie boisk w Google.
  // Bez klucza: satelita Esri + boiska z OpenStreetMap (za darmo).
  GOOGLE_MAPS_API_KEY: '',
  GOOGLE_QUERIES: { basketball: 'boisko do koszykówki', football: 'boisko piłkarskie orlik' },

  // Mapa satelitarna (kolejność przycisku 🛰️). Domyślnie: darmowa ortofotomapa
  // Geoportalu (Polska, bardzo dokładna) + Esri poza Polską.
  //  - Mapbox: wpisz token (darmowy limit na mapbox.com) → pojawi się warstwa "Mapbox Satellite"
  //  - MapTiler: wpisz klucz (darmowy plan na maptiler.com) → warstwa "MapTiler Satellite"
  MAPBOX_TOKEN: '',
  MAPTILER_KEY: '',

  // Start mapy, zanim telefon poda lokalizację (Rzeszów)
  DEFAULT_CENTER: [50.0375, 22.0047],
  DEFAULT_ZOOM: 13,

  // Automatyczne pobieranie boisk przy przesuwaniu mapy (od tego zoomu)
  AUTO_IMPORT: true,
  AUTO_IMPORT_MIN_ZOOM: 13,
};
