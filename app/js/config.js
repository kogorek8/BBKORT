// =====================================================================
//  BBKORT – konfiguracja
//  Puste SUPABASE_* → aplikacja działa w TRYBIE DEMO (dane w przeglądarce).
//  Instrukcja uzupełnienia: README.md
// =====================================================================
export const CONFIG = {
  // Supabase → Project Settings → API
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // Google Maps Platform (opcjonalnie): satelita Google + wyszukiwanie boisk w Google.
  // Bez klucza: satelita Esri + boiska z OpenStreetMap (za darmo).
  GOOGLE_MAPS_API_KEY: '',
  GOOGLE_QUERY: 'boisko do koszykówki',

  // Start mapy, zanim telefon poda lokalizację (Warszawa)
  DEFAULT_CENTER: [52.2297, 21.0122],
  DEFAULT_ZOOM: 13,

  // Automatyczne pobieranie boisk przy przesuwaniu mapy (od tego zoomu)
  AUTO_IMPORT: true,
  AUTO_IMPORT_MIN_ZOOM: 13,
};
