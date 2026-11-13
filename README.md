# BBKORT – boiska sprawdzone w grze, ekipa do gry, walka o teren 🏀⚽

> **Instrukcja publikacji i sklepów:** [docs/INSTRUKCJA-PUBLIKACJA.md](docs/INSTRUKCJA-PUBLIKACJA.md)
>
> **Aktualizacja bazy po każdej nowej wersji** (Supabase → SQL Editor → Database → Run):
> ```sql
> do $$ begin execute (select content from extensions.http_get('https://raw.githubusercontent.com/kogorek8/BBKORT/claude/bbkort-web-app-30zfsx/supabase/aktualizacja-bez-komentarzy.sql')); end $$;
> ```
>
> Nowe w tej wersji: ekran Start z widżetami (tabela, mecze, kto teraz gra), **OG Coins** ze sklepem nagród, **dropy**, misje dnia, poziomy, **odznaki** i **sezony**, meldowanie „gram teraz” z powiadomieniem dla drużyny-króla, statystyki zawodników po meczu (zatwierdza admin), wyzwania i przejęcia zgłaszane przez kapitana lub 3 zawodników i akceptowane przez admina, 6 pasków skilli ustawianych przez admina, aktualności / konkursy / miejsce dla sponsora.

Aplikacja webowa (PWA) dla koszykarzy i piłkarzy, inspirowana grami terenowymi. Na **mapie satelitarnej** widać boiska i kto nimi rządzi. Drużyny **przejmują boiska i teren**, a inne drużyny mogą je **publicznie wyzwać**. Wynik każdego meczu zatwierdza **sędzia BBKORT**. Zawodnicy mają **karty umiejętności w stylu gier sportowych**.

Język: **polski** z przełącznikiem na **angielski** (przycisk EN/PL w prawym górnym rogu).

---

## Co jest w środku

| Funkcja | Opis |
|---|---|
| 🗺️ Mapa satelitarna | Darmowa ortofotomapa **Geoportalu** (cała Polska, bardzo dokładna), poza Polską Esri. Opcjonalnie Google, Mapbox lub MapTiler. Twoja pozycja GPS na żywo |
| 🏀⚽ Dwa sporty | Koszykówka i piłka nożna: boiska, drużyny, karty i tabele są osobne dla każdego sportu. Filtr sportu na każdej zakładce |
| 🔍 Boiska automatycznie | Przy przesuwaniu mapy aplikacja sama szuka boisk w OpenStreetMap (i w Google, jeśli podasz klucz). Boiska wielofunkcyjne są dodawane osobno dla każdego sportu |
| 👑 Właściciel boiska | Pinezka w kolorze drużyny-króla. Karta boiska pokazuje, **kto i jak zdobył boisko** (wynik, walkower, sędzia), od kiedy i ile razy go obronił |
| 🚩 Teren drużyn | Mapa jest podzielona na strefy ~1 km. Strefa należy do drużyny, która ma w niej najwięcej boisk. Widać kolor, skrót drużyny i strefy sporne |
| 📊 Tabela | Osobna dla każdego sportu: boiska → strefy → wygrane → obrony, plus rating. Na mapie widać lidera, a pod tabelą kanał „Ostatnie zdobycze” |
| ⚔️ Publiczna tablica wyzwań | Wszyscy widzą, kto kogo wyzwał. Król ma **48 h** na przyjęcie, brak odpowiedzi oznacza walkower |
| 🧑‍⚖️ Sędziowie | Każdy mecz ma sędziego BBKORT (na miejscu albo z nagrania). **Tylko sędzia lub admin zatwierdza wynik.** Kapitanowie obu drużyn mogą zgłosić wynik z linkiem do nagrania, a aplikacja pokazuje, czy ich zgłoszenia są zgodne |
| 👻 Duchy | Kto zapisał się na mecz, a nie zameldował się GPS-em na boisku, jest pomijany i dostaje znaczek ducha |
| 🃏 Karty zawodników | Koszykówka: 17 umiejętności w 5 grupach. Piłka: 24 umiejętności w 7 grupach (osobny OVR dla bramkarza). Zawodnik wpisuje skille sam, a do akceptacji karta jest oznaczona **„czeka na akceptację”** |
| 🛠️ Panel | Admin i moderatorzy: wyniki do zatwierdzenia, mecze bez sędziego, akceptacja skilli. Tylko admin nadaje uprawnienia moderatora |

### Zasady (edytowalne w `app/js/rules.js` **i** `supabase/schema.sql`)
1. Wolne boisko przejmujesz, będąc na miejscu (max 150 m). Drużyna gra tylko na boiskach swojego sportu.
2. Kapitan publicznie wyzywa króla boiska. Termin meczu musi wypadać od 1 h do 7 dni od teraz. Król ma **48 h** (albo czas do startu) na przyjęcie. Brak odpowiedzi oznacza walkower i ducha dla kapitana.
3. Każdy mecz musi mieć **sędziego BBKORT**, który jest na miejscu albo ogląda nagranie. Wynik obowiązuje dopiero po zatwierdzeniu przez sędziego lub admina.
4. Kapitanowie obu drużyn mogą zgłosić wynik albo walkower (rywal się nie stawił), najlepiej z nagraniem.
5. Check-in GPS na boisku trwa od 30 min przed do 30 min po starcie.
6. Po przejęciu lub obronie boisko jest chronione przez 24 h.
7. Mecz bez żadnego zgłoszonego wyniku wygasa 48 h po starcie.

---

## 1. Podgląd (tryb demo) – 1 minuta

```bash
cd app
python3 -m http.server 8000
# otwórz http://localhost:8000
```

W demo możesz:
- **zmieniać gracza** (pasek u góry → „zmień gracza”): kapitanowie, piłkarze, **Sędzia Marek** (moderator) i **Admin**,
- w **Panel → Demo** przesuwać czas o +30 min, +1 h lub +48 h, żeby sprawdzić walkowery i duchy,
- włączyć „udawany GPS”, żeby przejmować boiska bez wychodzenia z domu.

---

## 2. Wersja na żywo – baza Supabase (darmowa)

1. Załóż konto na <https://supabase.com> i utwórz projekt (region: Frankfurt).
2. Otwórz **SQL Editor**, wklej całą zawartość pliku `supabase/schema.sql` i kliknij **Run**.
3. W **Authentication → URL Configuration** ustaw **Site URL** na adres aplikacji.
4. W **Project Settings → API** skopiuj `Project URL` i klucz `anon public` do pliku `app/js/config.js`. **Nigdy** nie wklejaj tam klucza `service_role`.
5. Zarejestruj się w aplikacji, a potem w SQL Editor nadaj sobie uprawnienia admina:
   ```sql
   update public.profiles set is_admin = true where nick = 'TWÓJ_NICK';
   ```
6. Moderatorów (sędziów) nadajesz w aplikacji: **Panel → Moderatorzy**.
7. (Opcjonalnie) automatyczne rozliczanie terminów: **Database → Extensions → pg_cron**, a potem uruchom polecenie z końca pliku `schema.sql`.

Wszystkie zasady gry są pilnowane **po stronie serwera**. Gracz nie może sam zmienić wyniku, przejąć boiska ani nadać sobie uprawnień.

---

## 3. Wgranie na WordPressa

**Wymagane HTTPS**, bez tego telefon nie poda lokalizacji GPS.

1. Uzupełnij `app/js/config.js` (krok 2).
2. Zbuduj wtyczkę: `./scripts/build-wordpress.sh` → `dist/bbkort-wordpress.zip`.
3. W WordPressie: **Wtyczki → Dodaj nową → Wyślij wtyczkę na serwer** → wybierz plik zip → **Włącz**.
4. Na wybranej stronie wstaw blok **Shortcode**: `[bbkort]`. Opcje: `[bbkort height="700px"]`, `[bbkort view="table"]`.

---

## 4. Mapa satelitarna – opcje

| Opcja | Koszt | Jakość | Co zrobić |
|---|---|---|---|
| **Geoportal (GUGiK) – ortofotomapa** ✅ domyślna | **Darmowa** (dane publiczne) | Bardzo wysoka w całej Polsce (zdjęcia lotnicze) | Nic, już działa |
| **Esri World Imagery** ✅ włączona | Darmowa z podpisem źródła. Przy dużym ruchu komercyjnym warto założyć darmowe konto ArcGIS Location Platform (ma darmowy limit) | Dobra, cały świat | Nic, już działa (poza Polską i jako warstwa zapasowa) |
| **MapTiler Satellite** | Darmowy plan z limitem, potem płatny | Dobra | Załóż konto na maptiler.com i wpisz klucz w `config.js` → `MAPTILER_KEY` |
| **Mapbox Satellite** | Darmowy limit wyświetleń miesięcznie, potem płatny | Dobra, ładne etykiety | Załóż konto na mapbox.com i wpisz token w `config.js` → `MAPBOX_TOKEN` |
| **Google (Map Tiles API)** | Darmowy limit miesięczny, ale **wymaga karty**; powyżej limitu płatne | Bardzo dobra | Zobacz niżej |

Przycisk 🛰️ na mapie przełącza wszystkie dostępne warstwy.

### Google (opcjonalnie)
1. Wejdź na <https://console.cloud.google.com>, utwórz projekt i podepnij konto rozliczeniowe.
2. Włącz **Maps JavaScript API**, **Places API (New)** i **Map Tiles API**.
3. Utwórz klucz API, **ogranicz go do swojej domeny** i ustaw budżet z alertami.
4. Wpisz go w `config.js` → `GOOGLE_MAPS_API_KEY`. Pojawi się warstwa „Satelita Google” i wyszukiwanie boisk w Google.

⚠️ Regulamin Google ogranicza trwałe przechowywanie danych z Google Places. Dlatego głównym źródłem boisk jest OpenStreetMap, a Google jest dodatkiem.

---

## Struktura projektu

```
app/                     ← cała aplikacja (statyczne pliki, bez budowania)
  js/config.js           ← KONFIGURACJA (Supabase, Google, Mapbox, MapTiler)
  js/rules.js            ← stałe zasad gry, sporty, rozmiar stref
  js/skills.js           ← skille koszykówki i piłki, OVR, rating (tymczasowy wzór)
  js/i18n.js             ← tłumaczenia PL / EN
  js/state.js            ← strefy terenu, tabela, kanał aktywności
  js/api/demo.js         ← tryb demo (localStorage)
  js/api/supabase.js     ← tryb produkcyjny
  js/courts-import.js    ← automatyczne wyszukiwanie boisk
  js/views/*.js          ← mapa, tabela, drużyny, zawodnik, wyzwania, panel, logowanie
supabase/schema.sql      ← baza danych + zasady gry po stronie serwera
wordpress/bbkort/        ← wtyczka WordPress (shortcode [bbkort])
docs/                    ← materiały projektu
```

## Do ustalenia w kolejnym etapie
- **Rating drużyny**: docelowy wzór. Wystarczy podmienić `teamRating()` w `app/js/skills.js`.
- Powiadomienia push („Twoje boisko zostało wyzwane!”).
- Regulamin i polityka prywatności (RODO).
- Kolejne mechaniki: poziomy i XP, odznaki, zadania, sezony, turnieje.
