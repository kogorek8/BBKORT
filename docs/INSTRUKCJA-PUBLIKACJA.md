# BBKORT – jak upublicznić aplikację i dodać ją do sklepów

Stan na listopad 2026. Opłaty i wymagania sklepów zmieniają się, więc przed startem sprawdź aktualne zasady na stronach Apple i Google.

---

## CZĘŚĆ A – Aplikacja publiczna w internecie

To jest pełnoprawny start. Aplikacja działa w przeglądarce na każdym telefonie i da się ją „zainstalować” na ekranie głównym bez sklepów.

### Krok 1. Zaktualizuj bazę (2 min)
Supabase → **SQL Editor** → **+ New** → przy przycisku Run musi być **Database** → wklej poniższą linię → **Run**:

```sql
do $$ begin execute (select content from extensions.http_get('https://raw.githubusercontent.com/kogorek8/BBKORT/claude/bbkort-web-app-30zfsx/supabase/aktualizacja-bez-komentarzy.sql')); end $$;
```

Wynik: **Success**. Tę samą linię uruchamiasz po każdej większej aktualizacji aplikacji. Jest bezpieczna do wielokrotnego użycia.

### Krok 2. Wgraj boiska (5 min)
Aplikacja → zaloguj się jako admin → **Panel → Boiska** → wybierz **Rzeszów** (albo „Podkarpacie – całe województwo”) → **Importuj miasto**. Nie zamykaj strony do końca importu.

Boiska, których nie ma w OpenStreetMap, dodajesz na mapie przyciskiem **＋**: ustaw środek mapy na boisku. Gracze też mogą je zgłaszać, a Ty zatwierdzasz zgłoszenia w Panelu.

### Krok 3. Dodaj pierwsze karty OG SPOT
Mapa → stuknij boisko → **Dodaj kartę OG SPOT** → wpisz punkty w 8 obszarach, opis, zalety, ograniczenia, sugestie, linki do zdjęć i film z YouTube → **Opublikuj**.

Zdjęcia wgraj najpierw do biblioteki mediów WordPressa (Media → Dodaj) i skopiuj ich adresy `https://…`.

### Krok 4. Postaw aplikację pod własnym adresem
Link testowy (githack) służy tylko do testów. Docelowo wybierz jedną z dróg:

**Droga 1 – WordPress (basketchallenge3x3.com), najprostsza**
1. Pobierz plik `wordpress/bbkort-wordpress.zip` z repozytorium.
2. WordPress → **Wtyczki → Dodaj nową → Wyślij wtyczkę** → wybierz zip → **Włącz**.
3. **Strony → Dodaj nową** (np. „Aplikacja”) → blok **Shortcode** → `[bbkort]` → **Opublikuj**.
4. Przy każdej aktualizacji wgrywasz nowy zip (WordPress zapyta o zastąpienie).

**Droga 2 – osobna subdomena, np. `app.basketchallenge3x3.com`** (zalecana, jeśli planujesz sklepy)
1. W panelu hostingu utwórz subdomenę z certyfikatem SSL (HTTPS).
2. Wgraj zawartość folderu `app/` przez menedżer plików lub FTP.
3. Aplikacja działa wtedy na pełnym ekranie, pod własnym adresem. Sklepy tego wymagają.

### Krok 5. Ustawienia Supabase przed startem
| Gdzie | Co ustawić |
|---|---|
| Authentication → URL Configuration | **Site URL** = docelowy adres aplikacji; dodaj go też w **Redirect URLs** |
| Authentication → Sign In / Providers → Email | Włącz **Confirm email** (ochrona przed fałszywymi kontami) |
| Authentication → Emails → SMTP Settings | Podłącz własną pocztę (skrzynka z hostingu albo Brevo/Resend – mają darmowe plany). Wbudowana poczta Supabase wysyła tylko kilka maili na godzinę |
| Authentication → Emails → Templates | Przetłumacz maile na polski (potwierdzenie konta, reset hasła) |
| Database → Extensions → pg_cron | Opcjonalnie: automatyczne rozliczanie terminów wyzwań (polecenie jest na końcu `supabase/schema.sql`) |

### Krok 6. Dokumenty prawne (obowiązkowe przed publicznym startem)
- **Regulamin** – zasady gry, wyzwania, odpowiedzialność za udział w grach, moderacja treści.
- **Polityka prywatności (RODO)** – aplikacja przetwarza e-mail, nick, lokalizację (tylko przy meldowaniu się na boisku), opinie i wyniki. Trzeba wskazać administratora danych (osoba lub organizacja, np. operator programu).
- **Niepełnoletni** – w Polsce osoba poniżej 16 lat potrzebuje zgody rodzica na przetwarzanie danych w usługach internetowych. Ustal, czy aplikacja jest od 16 lat, czy zbierasz zgody.
- **Zdjęcia i filmy** z boisk – zgoda osób widocznych na materiałach.

Projekty tych dokumentów mogę przygotować, ale przed publikacją powinien je przejrzeć prawnik.

### Krok 7. Kontrola przed startem
- [ ] Rejestracja i logowanie działają na telefonie (iPhone + Android).
- [ ] Lokalizacja działa (strona ma HTTPS).
- [ ] Mapa pokazuje boiska w Rzeszowie, co najmniej kilka ma kartę OG SPOT.
- [ ] Jest przynajmniej jedna otwarta gra i 2–3 drużyny testowe.
- [ ] Regulamin i polityka prywatności są podlinkowane na stronie.
- [ ] Wiesz, jak zatwierdzać: wyniki, skille, zgłoszone boiska (Panel).

### Koszty części A
| Pozycja | Koszt |
|---|---|
| Supabase (plan Free) | 0 zł; projekt usypia po ok. tygodniu bez ruchu. Plan Pro (ok. 25 USD/mies.) przy większej skali |
| Mapa (Geoportal, Esri, OpenStreetMap) | 0 zł |
| Hosting i domena | Masz już (WordPress) |
| Poczta SMTP | 0 zł na start (darmowe plany) |

---

## CZĘŚĆ B – Google Play i App Store

Nie zaczynaj od sklepów. Najpierw część A i kilkadziesiąt aktywnych osób. Sklepy dają wygodę i wiarygodność, ale kosztują czas i pieniądze, a recenzenci odrzucają puste aplikacje.

### B0. Bez sklepów: instalacja z przeglądarki (już działa)
- **iPhone:** Safari → Udostępnij → **Do ekranu początkowego**.
- **Android:** Chrome → menu ⋮ → **Zainstaluj aplikację**.

### B1. Google Play (łatwiejsze, zrób najpierw)
**Potrzebujesz:**
- konta dewelopera Google Play – **25 USD jednorazowo**, weryfikacja tożsamości,
- aplikacji pod **własną domeną z HTTPS** (Droga 2 z kroku 4),
- polityki prywatności pod publicznym adresem,
- ikony 512×512 PNG, grafiki 1024×500, min. 2 zrzutów ekranu.

**Kroki:**
1. Załóż konto: <https://play.google.com/console>.
2. Zamień aplikację webową w paczkę Android (tzw. TWA) narzędziem **PWABuilder** (<https://www.pwabuilder.com>): wklejasz adres aplikacji i pobierasz gotowy plik `.aab`.
3. Na domenie umieść plik `/.well-known/assetlinks.json` (PWABuilder go generuje). Łączy on domenę z aplikacją i usuwa pasek adresu.
4. W konsoli utwórz aplikację i wypełnij: opis, kategorie, **Bezpieczeństwo danych** (e-mail, lokalizacja, treści użytkowników), ocenę treści, grupę docelową.
5. **Testy zamknięte:** nowe konta osobiste muszą przeprowadzić test z co najmniej **12 testerami przez 14 dni**, zanim Google pozwoli na publikację. Zbierz 12 osób z kontami Google (znajomi, drużyny).
6. Po testach wyślij wniosek o dostęp produkcyjny, a potem do recenzji (zwykle kilka dni).

**Co przygotuję ja, gdy będziesz gotowy:** ikony PNG, pełny manifest, plik assetlinks, tryb offline wymagany przez Google, teksty do sklepu.

### B2. Apple App Store (trudniejsze)
**Potrzebujesz:**
- **Apple Developer Program – 99 USD rocznie**,
- **komputera Mac** z Xcode (albo usługi budowania w chmurze, np. Codemagic) – z iPada ani Windowsa nie wyślesz aplikacji,
- polityki prywatności, zrzutów ekranu z iPhone'a, opisu.

**Ważne ograniczenia Apple:**
- Apple **odrzuca aplikacje, które są tylko opakowaną stroną** (wytyczna 4.2). Trzeba dodać funkcje natywne, np. powiadomienia push („Twoje boisko zostało wyzwane”, „Ktoś dołączył do Twojej gry”) i natywną lokalizację.
- Aplikacja z kontami musi mieć **usuwanie konta w aplikacji** (wytyczna 5.1.1). Tego jeszcze nie ma, trzeba to dobudować.
- Treści użytkowników (opinie, opisy gier) wymagają **zgłaszania i blokowania** nadużyć oraz moderacji.

**Kroki:**
1. Zapisz się do programu: <https://developer.apple.com/programs/>.
2. Aplikację opakowuje się narzędziem **Capacitor** (projekt iOS z kodem BBKORT w środku). Przygotuję ten projekt w repozytorium.
3. Na Macu: otwórz projekt w Xcode → podpisz swoim kontem → **Archive** → wyślij do **App Store Connect**.
4. W App Store Connect: opis, zrzuty, **etykiety prywatności**, wiek, kontakt do recenzenta i **konto testowe** dla recenzenta.
5. Najpierw **TestFlight** (testy ze znajomymi), potem wysyłka do recenzji (zwykle 1–3 dni; odrzucenia się zdarzają, wtedy poprawiasz i wysyłasz ponownie).

**Co trzeba dobudować przed Apple:** usuwanie konta, zgłaszanie treści, powiadomienia push, projekt Capacitor.

### Koszty części B
| Pozycja | Koszt |
|---|---|
| Google Play | 25 USD jednorazowo |
| Apple Developer | 99 USD rocznie |
| Mac lub budowanie w chmurze | Mac własny/pożyczony albo usługa (są darmowe limity) |

### Proponowana kolejność
1. **Teraz:** część A – start w Rzeszowie pod własnym adresem.
2. **Po pierwszych 50–100 użytkownikach:** Google Play.
3. **Gdy są powiadomienia i usuwanie konta:** App Store.
