# BBKORT – King of the Court 🏀👑

Aplikacja webowa (PWA) dla koszykarzy streetballu: **mapa boisk na zdjęciach satelitarnych**, **drużyny** i walka o tytuł **King of the Court**. Drużyny przejmują boiska i bronią ich przed wyzwaniami, podobnie jak w grach terenowych. Zawodnicy mają **karty umiejętności jak w grach koszykarskich**, które zatwierdza admin.

Język: **polski** z przełącznikiem na **angielski** (przycisk EN/PL w prawym górnym rogu).

---

## Co jest w środku

| Funkcja | Opis |
|---|---|
| 🗺️ Mapa | Satelita (Esri, darmowa) albo satelita Google (z kluczem API), mapa uliczna, Twoja pozycja GPS na żywo |
| 🔍 Boiska automatycznie | Przy przesuwaniu mapy aplikacja sama szuka boisk do kosza w OpenStreetMap (i w Google, jeśli podasz klucz). Duplikaty w promieniu 40 m są pomijane |
| 👑 Przejmowanie | Wolne boisko przejmujesz, będąc na miejscu (do 150 m). Na mapie widać kolor i skrót drużyny-króla |
| ⚔️ Wyzwania | Kapitan wyzywa króla → zapisy → check-in GPS na boisku → wynik → potwierdzenie przez drugiego kapitana w 24 h |
| 🏳️ Walkowery | Król nie odpowiedział w 24 h, rywal się nie stawił albo kapitan nie potwierdził wyniku w 24 h – walkower dla strony, która się zgłosiła |
| 👻 Duchy | Kto zapisał się na mecz i nie zameldował się na boisku, jest pomijany i dostaje znaczek ducha na profilu (licznik) |
| 🛡️ Drużyny | Ranking (boiska, bilans), profil drużyny, skład, boiska, historia meczów, rating (**tymczasowy** = średni OVR) |
| 🃏 Karta zawodnika | 17 umiejętności w 5 grupach, OVR, pozycja, numer i wzrost. Zmiany zgłoszone przez zawodnika są oznaczone jako **„czeka na akceptację admina”**, a ▲▼ pokazują różnicę |
| 🛠️ Panel admina | Akceptacja lub odrzucenie skilli (z linkiem do filmiku i ostatnimi wynikami drużyny), rozstrzyganie sporów o wynik, zwalnianie i usuwanie boisk |
| 📱 PWA | Można dodać do ekranu głównego telefonu jak aplikację |

### Zasady (edytowalne w `app/js/rules.js` **i** `supabase/schema.sql`)
1. Wolne boisko przejmujesz, będąc na miejscu (max 150 m).
2. Kapitan wyzywa króla. Termin meczu musi wypadać od 1 h do 7 dni od teraz. Król ma 24 h (albo czas do startu meczu) na przyjęcie. Brak odpowiedzi oznacza walkower i ducha dla kapitana.
3. Check-in na boisku jest otwarty od 30 min przed startem do 30 min po starcie.
4. Jeśli 30 min po starcie jest tylko jedna drużyna, jej kapitan może żądać walkowera.
5. Wynik wpisuje jeden kapitan, a drugi ma 24 h na potwierdzenie. Brak potwierdzenia oznacza walkower dla strony, która potwierdziła, i ducha dla milczącego kapitana. Gdy drugi kapitan się nie zgadza, decyduje admin.
6. Po przejęciu lub obronie boisko jest chronione przez 24 h.

---

## 1. Podgląd (tryb demo) – 1 minuta

Bez żadnej konfiguracji aplikacja działa w **trybie demo**: przykładowe drużyny z Warszawy, dane zapisane tylko w Twojej przeglądarce.

```bash
cd app
python3 -m http.server 8000
# otwórz http://localhost:8000
```

W demo możesz:
- **zmieniać gracza** (pasek u góry → „zmień gracza”), np. zalogować się jako kapitan Bartek, a potem jako Michał, i rozegrać mecz,
- w **Admin → Narzędzia demo** przesuwać czas o +30 min, +1 h lub +24 h, żeby sprawdzić walkowery i duchy,
- włączyć „udawany GPS”, żeby przejmować boiska bez wychodzenia z domu.

---

## 2. Wersja na żywo – baza Supabase (darmowa)

1. Załóż konto na <https://supabase.com> i utwórz nowy projekt (region: Frankfurt).
2. Otwórz **SQL Editor**, wklej całą zawartość pliku `supabase/schema.sql` i kliknij **Run**.
3. W **Authentication → URL Configuration** ustaw **Site URL** na adres, pod którym będzie aplikacja (np. `https://twojastrona.pl/...`).
4. W **Project Settings → API** skopiuj `Project URL` i klucz `anon public` do pliku `app/js/config.js`:
   ```js
   SUPABASE_URL: 'https://xxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJ...',
   ```
   Klucz `anon` jest publiczny i może być w przeglądarce. **Nigdy** nie wklejaj tam klucza `service_role`.
5. Zarejestruj się w aplikacji, a potem w SQL Editor nadaj sobie uprawnienia admina:
   ```sql
   update public.profiles set is_admin = true where nick = 'TWÓJ_NICK';
   ```
6. (Opcjonalnie) Automatyczne rozliczanie terminów co 10 min, nawet gdy nikt nie ma otwartej aplikacji: **Database → Extensions → pg_cron**, a potem uruchom polecenie z końca pliku `schema.sql`. Bez tego terminy i tak są rozliczane przy każdym otwarciu aplikacji.

Wszystkie zasady gry są pilnowane **po stronie serwera**: przejęcia, walkowery i akceptację skilli wykonują funkcje w bazie. Nikt nie przejmie boiska, edytując dane w przeglądarce.

---

## 3. Wgranie na WordPressa

**Wymagane HTTPS** (kłódka przy adresie), bez tego telefon nie poda lokalizacji GPS.

1. Uzupełnij `app/js/config.js` (krok 2).
2. Zbuduj wtyczkę:
   ```bash
   ./scripts/build-wordpress.sh      # → dist/bbkort-wordpress.zip
   ```
3. W WordPressie: **Wtyczki → Dodaj nową → Wyślij wtyczkę na serwer** → wybierz `bbkort-wordpress.zip` → **Włącz**.
4. Utwórz stronę (np. „Graj”) i wstaw blok **Shortcode** z treścią:
   ```
   [bbkort]
   ```
   Opcje: `[bbkort height="700px"]`, `[bbkort view="teams"]`.

Pod aplikacją jest też link **„Otwórz na pełnym ekranie”**. Na telefonie najlepiej otworzyć ją w ten sposób i dodać do ekranu głównego.

> Alternatywa: wgraj zawartość folderu `app/` przez FTP na subdomenę, np. `graj.twojastrona.pl`.

---

## 4. Google Maps – satelita Google i boiska z Google (opcjonalnie)

Tak, da się to zrobić oficjalnie, przez **Google Maps Platform**. Nie trzeba niczego negocjować z Google, wystarczy klucz API:

1. Wejdź na <https://console.cloud.google.com>, utwórz projekt i **podepnij konto rozliczeniowe** (karta jest wymagana, ale Google daje miesięczny darmowy limit; aktualne limity znajdziesz w cenniku Google Maps Platform).
2. Włącz API: **Maps JavaScript API**, **Places API (New)** i **Map Tiles API**.
3. Utwórz klucz API i **ogranicz go do swojej domeny** (HTTP referrers: `https://twojastrona.pl/*`).
4. Wpisz go w `app/js/config.js` → `GOOGLE_MAPS_API_KEY`.
5. Ustaw w Google Cloud **budżet i alerty**, żeby nie było niespodzianek na rachunku.

Po dodaniu klucza na mapie pojawia się warstwa **„Satelita Google”** (przycisk 🛰️), a boiska są wyszukiwane również w Google.

Bez klucza aplikacja działa w pełni za darmo: zdjęcia satelitarne Esri i boiska z OpenStreetMap.

⚠️ Regulamin Google ogranicza trwałe przechowywanie danych z Google Places, pozwala zapisywać na stałe tylko identyfikator miejsca. Dlatego głównym źródłem boisk jest OpenStreetMap, a Google jest dodatkiem. Przy większej skali warto to sprawdzić z regulaminem.

---

## Struktura projektu

```
app/                     ← cała aplikacja (statyczne pliki, bez budowania)
  index.html
  css/style.css
  js/config.js           ← KONFIGURACJA (Supabase, Google)
  js/rules.js            ← stałe zasad gry
  js/skills.js           ← lista skilli, OVR, rating drużyny (tymczasowy wzór)
  js/i18n.js             ← tłumaczenia PL / EN
  js/api/demo.js         ← tryb demo (localStorage)
  js/api/supabase.js     ← tryb produkcyjny
  js/courts-import.js    ← automatyczne wyszukiwanie boisk (OSM / Google)
  js/views/*.js          ← ekrany: mapa, drużyny, zawodnik, mecze, admin, logowanie
supabase/schema.sql      ← baza danych + zasady gry po stronie serwera
wordpress/bbkort/        ← wtyczka WordPress (shortcode [bbkort])
scripts/build-wordpress.sh
docs/                    ← materiały projektu (plan, „pomysł taty”, zdjęcia)
```

## Do ustalenia w kolejnym etapie
- **Rating drużyny**: docelowy wzór. Wystarczy podmienić funkcję `teamRating()` w `app/js/skills.js`.
- Powiadomienia push (np. „Twoje boisko zostało wyzwane!”).
- Własne zdjęcia i logo drużyn.
- Dodawanie boisk ręcznie przez graczy (z akceptacją admina).
