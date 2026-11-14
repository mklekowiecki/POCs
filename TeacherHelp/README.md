# Teacher Help

Prosta aplikacja do lekcji w pracowni: nauczyciel zakłada sesję z listą zadań
i udostępnia pliki, uczniowie w przeglądarce pobierają materiały i klikają kafelki
zadań, które już zrobili, a nauczyciel na żywo widzi, jaki procent uczniów skończył
każde zadanie.

## Uruchomienie

Wymagany .NET 10 SDK.

```bash
cd TeacherHelp/TeacherHelp
dotnet run
```

Serwer nasłuchuje na `http://0.0.0.0:80` (wszystkie interfejsy, port 80) – wszystkie aplikacje są
podstronami tego samego adresu, więc uczniowie wpisują sam adres komputera nauczyciela.

| Kto                         | Adres                                        |
|-----------------------------|----------------------------------------------|
| Nauczyciel (cały panel)     | `http://localhost/nauczyciel`                |
| Uczniowie – lekcja          | `http://<IP-komputera-nauczyciela>/`         |
| Uczniowie – ankieta         | `http://<IP-komputera-nauczyciela>/ankieta`  |
| Uczniowie – symulator       | `http://<IP-komputera-nauczyciela>/obwod`    |
| Uczniowie – budżet domowy   | `http://<IP-komputera-nauczyciela>/budzet`   |
| Gra „Wyścig do 60” (projektor) | `http://localhost/wyscig`                |

Panel nauczyciela sam pokazuje adresy dla uczniów (z adresami kart sieciowych komputera) przy każdej aplikacji.
Strony ucznia i nauczyciela są podpisane „Lekcja Informatyki” (nagłówki i tytuły kart w `wwwroot/index.html` i `wwwroot/teacher.html`).
Inny port: `"Urls": "http://0.0.0.0:5000"` w `appsettings.json` albo `dotnet run -- --urls http://0.0.0.0:5000`
(np. gdy port 80 zajmuje już IIS lub inny serwer – wtedy aplikacja nie wystartuje z błędem „address already in use”).
Uwaga: `dotnet run` bierze adres z profilu w `launchSettings.json` (`applicationUrl`), jeśli go masz –
żeby uruchomić na porcie 80, użyj `dotnet run --no-launch-profile`.

Hasło nauczyciela ustawia się w `TeacherHelp/appsettings.json` → `TeacherHelp:TeacherPassword`
(domyślnie `zmien-to-haslo` – **zmień je**). Można je też podać bez edycji pliku:
`dotnet run -- --TeacherHelp:TeacherPassword=moje-haslo`.

### Uruchamianie bez `dotnet run`

Exe można odpalić prosto z wyniku buildu lub publish – strony (`wwwroot`) i `appsettings.json`
są kopiowane obok exe i szukane w jego katalogu, niezależnie od tego, skąd program uruchomiono:

```bash
dotnet build -c Release      # → TeacherHelp/bin/Release/net10.0/TeacherHelp.exe
dotnet publish -c Release -o C:\TeacherHelp   # cały katalog do skopiowania na komputer nauczyciela
```

Hasło zmienia się wtedy w `appsettings.json` leżącym obok exe.

### Zapora sieciowa

Na komputerze nauczyciela trzeba zezwolić na połączenia przychodzące na port 80 – inaczej strona
działa pod `localhost`, ale uczniowie jej nie widzą. Najprościej przy pierwszym uruchomieniu kliknąć
„Zezwalaj” w oknie Zapory Windows, albo (PowerShell jako administrator):

```powershell
New-NetFirewallRule -DisplayName "Teacher Help" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Private,Domain
```

### Linux (serwer w szkole, Raspberry Pi albo VPS w internecie)

Skrypt `deploy/install-linux.sh` (Ubuntu/Debian; na innych dystrybucjach z `dnf`) instaluje aplikację jako usługę
systemd za nginx. Aplikacja jest publikowana jako *self-contained* – na serwerze nie trzeba instalować .NET.

```bash
sudo deploy/install-linux.sh                              # sieć lokalna, port 80; zapyta o hasło
sudo deploy/install-linux.sh --domain lekcja.szkola.pl    # internet: HTTPS z Let's Encrypt (certbot)
```

- Bez .NET SDK na serwerze: opublikuj na dowolnym komputerze i skopiuj folder razem ze skryptem:
  `dotnet publish TeacherHelp/TeacherHelp.csproj -c Release -r linux-x64 --self-contained -o paczka`
  (Raspberry Pi: `-r linux-arm64`), potem `sudo ./install-linux.sh --publish-path paczka`.
- Inne opcje: `--port 8080`, `--password …`, `--no-nginx` (aplikacja sama słucha na porcie), `--uninstall [--remove-files]`.
- Pliki: aplikacja w `/opt/teacherhelp`, hasło w `/opt/teacherhelp/appsettings.Production.json`,
  usługa `teacherhelp` (`journalctl -u teacherhelp -f`), nginx w `/etc/nginx/sites-available/teacherhelp`.
  Ponowne uruchomienie skryptu aktualizuje aplikację i zachowuje hasło.
- Aplikacja słucha tylko na `127.0.0.1:5000`; nginx przekazuje WebSockets (SignalR), przyjmuje pliki do 200 MB
  i podaje nagłówki `X-Forwarded-*` – aplikacja ufa im tylko od proxy na tym samym komputerze.
- Przy `--domain` panel pokazuje uczniom adres `https://<domena>` (ustawienie `TeacherHelp:PublicUrl`)
  zamiast adresów kart sieciowych serwera.
- Logowanie nauczyciela: najwyżej 10 prób na minutę z jednego adresu (potem 429 „Za dużo prób logowania”).
- **Nginx z innymi aplikacjami**: skrypt dodaje tylko własny plik `teacherhelp` i nie zmienia innych stron
  (nginx jest przeładowywany, nie restartowany). Bez `--domain` nie może dzielić portu z innymi stronami, więc
  wtedy przerywa instalację – podaj `--domain` (np. subdomena) albo osobny `--port 8080`. Gdy port 5000 jest zajęty: `--app-port 5080`.
- **W internecie jeden serwer = jeden nauczyciel**: lekcja, ankieta i gra są wspólne dla całej instancji.

Testy: `dotnet test` w katalogu `TeacherHelp/`.

## Specyfikacja (ustalona metodą sokratejską)

**Sesja**
- Nauczyciel loguje się hasłem i rozpoczyna sesję, podając liczbę zadań – powstają zadania 1…N.
- W trakcie sesji można dopisywać kolejne zadania (z opcjonalnym tytułem) i nadawać/zmieniać tytuły
  (kliknięcie w nagłówek kolumny).
- Zadanie = numer + opcjonalny tytuł.
- Stan sesji jest trzymany tylko w pamięci serwera. „Zakończ sesję” lub restart serwera kasuje wszystko.
  Przed zakończeniem można pobrać wyniki jako CSV (separator `;`, UTF-8 – otwiera się w polskim Excelu;
  kolumny `Imię;Nazwisko;<zadania…>`, ostatni wiersz „Procent”).
- **Wznowienie sesji z CSV**: na ekranie „Nowa sesja” nauczyciel wczytuje plik z „Eksport CSV” – wracają zadania
  (z tytułami), uczniowie i ich postęp. Wszyscy uczniowie są wtedy *niepołączeni*, dopóki nie wrócą (patrz Uczeń).
  Akceptowany jest też plik po zapisaniu w Excelu (separator `;`, `,` lub tabulator, UTF-8 lub Windows-1250)
  oraz starszy format z jedną kolumną „Uczeń”. Pliki dla uczniów nie są w CSV – trzeba je udostępnić ponownie.

**Pliki**
- Nauczyciel udostępnia pliki z panelu („Pliki dla uczniów”), przypisując je do konkretnego zadania
  albo jako materiały ogólne dla całej lekcji. Można wysłać kilka plików naraz (limit 200 MB na wysyłkę)
  i usuwać udostępnione pliki.
- Uczeń widzi materiały ogólne nad kafelkami, a pliki zadania – pod jego kafelkiem.
  Pliki są pobierane zawsze jako załącznik.
- Pliki leżą w katalogu tymczasowym (`%TEMP%/TeacherHelp/files`) tylko na czas sesji – są kasowane
  po jej zakończeniu i przy starcie serwera.

**Grupy A/B/C i lista klasy**
- W trakcie sesji nauczyciel wczytuje listę klasy („Lista klasy i grupy”): CSV z dwiema kolumnami
  `Dane ucznia;Kategoria` (nagłówek opcjonalny, separator `;`, `,` lub tabulator, kategoria A, B, C albo pusta).
  „Dane ucznia” nie są dzielone na imię i nazwisko – uczeń widzi je na liście dokładnie tak jak w pliku.
- Uczniowie już obecni na lekcji są dopasowani po słowach bez względu na kolejność i wielkość liter
  („Kowalski Jan” = „jan kowalski”) i dostają grupę; pozostali są dopisani jako niepołączeni.
  Od wczytania listy uczeń **tylko wybiera siebie z listy** – nie da się dopisać ręcznie (przed pomyłką chroni „Odłącz”).
- Przy wysyłaniu pliku można zaznaczyć grupy (kilka naraz); bez zaznaczenia plik widzą wszyscy.
  Uczeń widzi tylko pliki dla wszystkich i dla swojej grupy, a swojej grupy nie widzi wcale.
- Pobranie pliku wymaga tokenu ucznia i sprawdza grupę – link przesłany koledze z innej grupy nie zadziała
  (zalogowany nauczyciel pobiera wszystko). Grupę ucznia można zmienić w tabeli (kolumna „Grupa”).
- „Eksport CSV” dodaje wtedy kolumnę `Kategoria`; wznowienie z takiego pliku przywraca grupy i tryb listy.

**Uczeń**
- Przed rozpoczęciem sesji widzi ekran „Poczekaj, aż nauczyciel rozpocznie lekcję”; strona sama się przełącza.
- Wchodząc, wpisuje imię i nazwisko (osobne pola, każde do 40 znaków). Imię i nazwisko są unikalne w sesji
  (bez rozróżniania wielkości liter, nadmiarowe spacje są usuwane); zajęte → komunikat, żeby poprosić nauczyciela o odłączenie.
- **Powrót do sesji**: jeśli w sesji są uczniowie niepołączeni (zamknęli przeglądarkę, sesja wznowiona z CSV
  albo odłączeni przez nauczyciela),
  ekran logowania pokazuje ich listę „Wracasz na lekcję? Wybierz siebie” – kliknięcie (z potwierdzeniem) przypisuje
  ucznia do tej przeglądarki razem z postępem. Wpisanie tego samego imienia i nazwiska działa tak samo.
  Pod listą jest zawsze formularz „Pierwszy raz na tej lekcji?” – nowy uczeń dołącza do wznowionej sesji
  normalnie, z pustym postępem.
- Przeglądarka zapamiętuje ucznia (token w `localStorage`), więc odświeżenie strony (F5) nie gubi postępu.
- Serwer śledzi otwarte połączenia ucznia (SignalR). Uczeń bez żadnej otwartej karty jest *niepołączony*
  i pojawia się na liście do wybrania – np. po zamknięciu przeglądarki i wyczyszczeniu jej danych może wrócić,
  klikając swoje nazwisko. Wybranie z listy daje nowy token; stary (w zamkniętej przeglądarce) przestaje działać.
- Kafelki z numerami zadań: kliknięcie oznacza zadanie jako zrobione, ponowne – cofa.
  Kolejność dowolna.
- Oznaczenie zadania jako zrobione odpala animację i dymek „Brawo! Zadanie N zrobione”.
  Jest 6 animacji (fajerwerki, konfetti, balony, gwiazdy, deszcz emotek, rakieta); każde zadanie losuje
  swoją (najpierw spośród jeszcze nieużytych) i zachowuje ją do końca sesji. Zrobienie ostatniego zadania
  odpala finał. Cofnięcie nie odpala niczego; przy włączonym w systemie „ograniczeniu animacji”
  pokazywany jest tylko dymek. Kod: `wwwroot/celebrate.js`.

**Nauczyciel**
- Dla każdego zadania: procent i liczba uczniów, którzy je zrobili.
- Tabela uczeń × zadanie.
- Procent liczony od wszystkich uczniów zalogowanych w bieżącej sesji
  (uczeń dołączający w trakcie od razu wchodzi do mianownika).
- Uczniowie niepołączeni (bez otwartej przeglądarki) są oznaczeni w tabeli („niepołączony”) i liczą się do procentów.
- Przycisk „Odłącz” przy uczniu – zwalnia go od komputera (np. komputer padł albo ktoś wybrał z listy nie siebie);
  postęp zostaje, a uczeń pojawia się na liście do wybrania.
- Przycisk „Usuń” przy uczniu (np. literówka w nazwisku) – uczeń wraca do ekranu logowania,
  a imię i nazwisko się zwalniają; postęp jest tracony.

**Ankieta „Co kumam” (feedback na koniec lekcji)**
- Osobna aplikacja w panelu nauczyciela (kafelek „Co kumam?”); uczniowie wchodzą na
  `http://<IP-komputera-nauczyciela>/ankieta`. Ankieta jest niezależna od sesji zadań – działa bez niej i obok niej.
- Nauczyciel tworzy ankietę: od 1 do kilku pytań (wpisuje ich treść, np. „pętla for”, „tablice”)
  i przed startem wybiera tryb **anonimowy** albo **imienny**.
- Uczeń ocenia każde pytanie w skali 1–5 i może dopisać jeden opcjonalny komentarz na końcu
  („Co jest dla Ciebie niejasne?”). W trybie imiennym wpisuje imię ręcznie (bez weryfikacji – ryzyko akceptowalne).
- Z jednej przeglądarki głosuje się raz; wysłana odpowiedź jest ostateczna.
- Przed startem ankiety uczeń widzi ekran oczekiwania; strona sama się przełącza.
- Nauczyciel widzi wyniki na żywo, możliwie szczegółowo: dla każdego pytania rozkład odpowiedzi 1–5,
  średnia i liczba odpowiedzi; licznik „odpowiedzi / otwarte strony ankiety”; komentarze;
  w trybie imiennym – lista, kto jak odpowiedział.
- Nauczyciel zamyka ankietę przyciskiem. Uczeń widzi wtedy „Dziękujemy, ankieta zakończona”,
  a nauczyciel może pobrać CSV (wszystkie odpowiedzi + podsumowanie).
- Jedna ankieta naraz. Nowa ankieta zastępuje poprzednią – z ostrzeżeniem, jeśli wyników nie wyeksportowano.
- Wyniki trzymane tylko w pamięci serwera; trwałość = ręczny eksport do pliku, bez historii ankiet.

**Panel nauczyciela**
- Jedna strona (`/nauczyciel`, plik `teacher.html`): wspólne logowanie hasłem, potem wybór aplikacji kafelkami
  (Lekcja, Co kumam?, Obwód elektryczny, Budżet domowy, Wyścig do 60). Kafelki pokazują na żywo stan aplikacji (np. „Sesja trwa · uczniów: 12”,
  „Otwarta · odpowiedzi: 8”), bo po zalogowaniu panel jest połączony ze wszystkimi hubami naraz.
- Aplikacja jest wybierana adresem (`#lekcja`, `#ankieta`, `#obwod`, `#budzet`, `#wyscig`) – działa „Wstecz” i odświeżenie strony.
  Pasek aplikacji ma powrót do kafelków i adres, który trzeba podać uczniom.
- Lekcja i ankieta działają niezależnie, mogą trwać jednocześnie.

**Symulator obwodu (dane do ćwiczeń w arkuszu kalkulacyjnym)**
- Osobna strona dla uczniów `/obwod` (plik `obwod.html`), niezależna od sesji i bez serwera (działa w całości w przeglądarce).
  Uczeń „mierzy” napięcie i natężenie, a wyniki wpisuje do zwykłego arkusza (Excel/Calc) obok.
- Bateria (1,5–12 V, suwak), wymienny element: 4 oporniki (bez podanych wartości, tylko paski
  kolorów – opór można policzyć z U/I) albo żarówka (opór rośnie z napięciem, więc wykres U(I) nie jest prostą).
- Woltomierz i amperomierz są osobnymi przyrządami z zaciskami `+` i `COM`; uczeń sam łączy zaciski przewodami
  (przeciągnięcie albo klik–klik, kliknięcie przewodu go usuwa). Zamienione przewody dają odczyt ujemny.
- Odczyty lekko „pływają” (szum ok. 0,3% i drganie ostatniej cyfry), jak w prawdziwym mierniku.
- Amperomierz wytrzymuje 1 A: wpięty równolegle (zwarcie) pali się – błysk, dym i okno z wyjaśnieniem,
  że amperomierz łączy się szeregowo; „Wymień amperomierz” daje nowy, odłączony.
- Prąd widać jako kropki płynące po przewodach (szybciej przy większym natężeniu), żarówka świeci jaśniej wraz z mocą.
- Stan (przewody, element, napięcie, spalony amperomierz) zapisuje się w `localStorage`, więc zamknięcie
  przeglądarki go nie gubi. Kod: `wwwroot/obwod.js` (analiza węzłowa obwodu), wygląd w `style.css`.

**Gra „Wyścig do 60” (powtórka na projektor)**
- Osobna strona `/wyscig` (pliki `wyscig.html`, `wyscig.js`, wygląd i animacje w `wyscig.css`, pytania w `wyscig-pytania.js`), bez sesji i bez serwera –
  cała klasa gra przy jednym komputerze, gracze lub drużyny (1–6) po kolei.
- Rzut kostką przesuwa pionek po planszy 1–60. Zwykłe pole: pytanie jednokrotnego wyboru – dobrze = punkt i zostajesz,
  źle = powrót na pole sprzed rzutu. Pola specjalne: `+2`, `−3`, `↻` (dodatkowy rzut), `⚡` wyzwanie (ryzyko:
  dobrze +3 pola, źle −3; albo zwykłe pytanie). Na mecie pytanie finałowe – dobra odpowiedź wygrywa.
- Ustawienia: gracze i nazwy, zakres (7 działów: po 16 pytań ze sprzętu, klawiatury i skrótów, programów i plików,
  internetu, bezpieczeństwa i netykiety, algorytmów i Scratcha oraz 50 pytań z podstaw arkusza LibreOffice Calc),
  limit czasu na odpowiedź i własne pytania nauczyciela.
- Format pytań (pole „Własne pytania” i pliki .txt): blok = treść, potem 2–4 odpowiedzi, poprawna z `*`; bloki oddzielone
  pustą linią. Linia `# Nazwa` zaczyna kategorię – nazwa wbudowanej (np. `# Internet`) dopisuje do niej, inna tworzy
  nową kategorię; pytania bez nagłówka trafiają do „Własne pytania”. Linia zaczynająca się od `\` jest dosłowna (np. odpowiedź `\*` to znak „*”, nie znacznik poprawnej).
- Eksport/import: „Eksportuj własne” i „Eksportuj wszystkie” (z wbudowanymi) zapisują plik .txt w tym formacie,
  „Importuj z pliku…” dopisuje pytania z pliku do własnych, pomijając powtórki – tak przenosi się pytania między komputerami.
- „💾 Zapisz do pliku” (w trakcie gry i w podsumowaniu) zapisuje stan gry do pliku .json razem z własnymi pytaniami
  z jej zakresu; „📂 Wczytaj grę z pliku…” w ustawieniach przywraca pionki, punkty, kolejkę i listę błędów
  (np. dokończenie gry na następnej lekcji albo na innym komputerze).
- Podsumowanie: ranking i lista „Do omówienia” (pytania z błędnymi odpowiedziami i poprawną odpowiedzią) do skopiowania.
- Klawisze: spacja – rzut, A–D – odpowiedź, Enter – dalej, T/N – wyzwanie. Dźwięk i pełny ekran. Gra i własne pytania zapisują się w `localStorage` („Kontynuuj zapisaną grę”).

**Gra „Budżet domowy” (scenariusz 6 harcerskiego tutoringu)**
- Osobna aplikacja w panelu (kafelek „Budżet domowy”); uczniowie wchodzą na `/budzet` (plik `budzet.html`).
  Aplikacja tylko losuje i pokazuje – wpływy, stałe wydatki i saldo uczeń liczy sam w arkuszu kalkulacyjnym.
- Nauczyciel rozpoczyna grę; uczeń wpisuje imię i losuje sytuację: dochód (2500/2800/3000/3400/3800 zł), rodzinę
  (1+1, 1+2, 2+1, 2+2, 2+3 – dorośli + dzieci) i majątek (dom na wsi i 2 samochody, mieszkanie w bloku i samochód,
  mieszkanie w bloku, dom pod miastem, dom pod miastem i samochód). Każda z trzech cech jest losowana jak z kartek:
  pierwszych pięciu graczy dostaje różne wartości, powtórki zaczynają się od szóstego.
- Stałe wydatki co miesiąc: rachunki 150 zł i jedzenie 200 zł na osobę, paliwo 200 zł na samochód.
- Nauczyciel odsłania kolejne miesiące 1–3 (wrzesień–listopad) każdemu graczowi osobno (przycisk w wierszu gracza),
  gdy ten skończy poprzedni – szybsi nie czekają na resztę klasy. Tabela pokazuje, który miesiąc ma każdy gracz. Wydarzenia są losowane osobno
  dla każdego gracza przy dołączeniu (`Session/BudgetService.cs`, tablica `Events`): część zawsze, gdy pasują
  (wyprawka, ubezpieczenie samochodów), reszta losowo spośród pasujących do rodziny i majątku (np. malowanie klatki
  tylko w bloku, dąb tylko na wsi, komoda tylko przy dwojgu dorosłych); ciągi dalsze pojawiają się zawsze po swoim
  wydarzeniu (ząb → darmowy dentysta, kurtki → zima).
- Panel nauczyciela pokazuje klucz do sprawdzania: stałe wydatki, ile zostaje miesięcznie, zakres wyniku po 3 miesiącach
  (najdroższe … najtańsze decyzje) i wylosowane wydarzenia gracza z kosztem – także w miesiącach jeszcze ukrytych.
- „Zakończ grę” odsłania wszystkim pozostałe miesiące i pytanie podsumowujące. Gracza można usunąć (losuje wtedy od nowa).
- Stan tylko w pamięci serwera; uczeń jest rozpoznawany po identyfikatorze w `localStorage`, więc F5 nie zmienia losowania.
- **Zapis i wznowienie gry** (jak przy lekcji): „Eksport CSV” zapisuje graczy – imię, odsłonięty miesiąc, dochód, rodzinę,
  majątek i identyfikatory wylosowanych wydarzeń każdego miesiąca (plus stałe wydatki i zakres wyniku do wglądu).
  „Wznów grę z pliku” (na ekranie nowej gry albo „Wznów z pliku…” po zakończeniu) odtwarza ich dokładnie.
  Gracze są wtedy bez przeglądarki: uczeń na ekranie dołączania widzi „Wracasz do gry? Wybierz siebie” i klika swoje imię
  (z potwierdzeniem). Na tej liście jest każdy gracz bez otwartej strony; „Odłącz” w panelu zwalnia gracza od komputera.

**Świadome uproszczenia (POC)**
- Brak powiązania z Veyonem – tożsamością ucznia jest imię i nazwisko, komputer jest nieistotny.
- Wybór siebie z listy niepołączonych nie jest niczym zabezpieczony – uczeń może kliknąć cudze nazwisko
  (nauczyciel widzi to w tabeli i może użyć „Odłącz”).
- HTTP bez TLS: hasło nauczyciela idzie po sieci lokalnej otwartym tekstem (HTTPS tylko przy instalacji
  na Linuksie z `--domain`).
- Brak trwałego zapisu i historii sesji (poza ręcznym eksportem i wznowieniem z CSV).
- Pobieranie plików nie wymaga logowania ucznia – wystarczy znać link (losowy identyfikator), dopóki trwa sesja.
- Ankieta: „jedna odpowiedź na przeglądarkę” opiera się na identyfikatorze w `localStorage` – wyczyszczenie danych
  przeglądarki albo okno prywatne pozwala odpowiedzieć ponownie. Imię w ankiecie imiennej nie jest weryfikowane.

## Architektura

- ASP.NET Core (minimal API) + SignalR, jedna aplikacja serwuje też strony statyczne z `wwwroot/`.
- `Session/SessionService.cs` – cała logika sesji (thread-safe, bez zależności od ASP.NET, pokryta testami).
- `Session/FileStorage.cs` – zawartość udostępnionych plików na dysku (metadane trzyma `SessionService`).
- `Hubs/StudentHub.cs` – uczeń: `GetView`, `Join(imię, nazwisko)`, `Claim(id)` (powrót do sesji), `Toggle`.
- `Hubs/TeacherHub.cs` – nauczyciel (wymaga logowania): `GetDashboard`; zmiany idą przez `/api/teacher/*`.
- `Hubs/SessionNotifier.cs` – po każdej zmianie wysyła nauczycielom pełny dashboard,
  a uczniom sygnał `changed`, po którym pobierają swój widok.
- Ankieta „Co kumam”: `Session/SurveyService.cs` (logika, pokryta testami) i `Hubs/SurveyHubs.cs` –
  `SurveyStudentHub` (`/hubs/survey`: `GetView(browserId)`, `Submit`), `SurveyTeacherHub` (`/hubs/survey-teacher`)
  i `SurveyNotifier` (otwarcie/zamknięcie strony ucznia odświeża tylko widok nauczyciela).
  Strona ucznia: `wwwroot/survey.html`.
- Gra „Budżet domowy”: `Session/BudgetService.cs` (losowanie i wydarzenia, pokryta testami) i `Hubs/BudgetHubs.cs`
  (`/hubs/budget`: `GetView(browserId)`, `Join`, `Claim` (powrót do gry); `/hubs/budget-teacher`). Strony: `budzet.html`, `teacher-budget.js`.
- Jeden port; krótkie adresy `/ankieta`, `/obwod`, `/budzet`, `/wyscig`, `/nauczyciel` są przepisywane na pliki z `wwwroot` (`Program.cs`),
  a `/ankieta/` przekierowuje na `/ankieta` (strony używają ścieżek względnych).
- Panel nauczyciela: `wwwroot/teacher.html` + moduły ES: `teacher.js` (logowanie, kafelki, przełączanie),
  `teacher-lesson.js`, `teacher-survey.js` (po jednym na aplikację), `teacher-common.js` (API, huby, status połączenia).
  `GET /api/teacher/addresses` podaje adresy komputera w sieci, które panel pokazuje jako adres dla uczniów.
- Frontend: czysty HTML/JS bez frameworka; klient SignalR jest dołączony lokalnie
  (`wwwroot/lib/signalr.min.js`), więc aplikacja działa w sieci szkolnej bez dostępu do internetu.

### API nauczyciela (cookie po zalogowaniu)

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| POST   | `/api/teacher/login` `{password}` | logowanie |
| POST   | `/api/teacher/logout` | wylogowanie |
| POST   | `/api/teacher/session/start` `{taskCount}` | nowa sesja |
| POST   | `/api/teacher/session/import` (multipart: `file`) | wznowienie sesji z CSV |
| POST   | `/api/teacher/session/end` | koniec sesji |
| POST   | `/api/teacher/tasks` `{title?}` | dodaj zadanie |
| PUT    | `/api/teacher/tasks/{n}` `{title?}` | zmień tytuł |
| POST   | `/api/teacher/students/{id}/disconnect` | odłącz ucznia (postęp zostaje) |
| DELETE | `/api/teacher/students/{id}` | usuń ucznia |
| GET    | `/api/teacher/addresses` | adresy tego komputera w sieci (dla uczniów); `TeacherHelp:PublicUrl`, jeśli ustawiony |
| GET    | `/api/teacher/export.csv` | eksport wyników |
| POST   | `/api/teacher/files` (multipart: `files`, `task?`) | udostępnij pliki (bez `task` = materiały ogólne) |
| DELETE | `/api/teacher/files/{id}` | usuń plik |
| POST   | `/api/teacher/survey/start` `{questions[], named}` | nowa ankieta (zastępuje poprzednią) |
| POST   | `/api/teacher/survey/close` | zamknij ankietę |
| GET    | `/api/teacher/survey/export.csv` | eksport ankiety |
| POST   | `/api/teacher/budget/start` | nowa gra „Budżet domowy” (zastępuje poprzednią) |
| POST   | `/api/teacher/budget/finish` | zakończ grę |
| POST   | `/api/teacher/budget/players/{id}/next` | odsłoń graczowi kolejny miesiąc |
| POST   | `/api/teacher/budget/players/{id}/disconnect` | odłącz gracza od przeglądarki (wraca na listę do wybrania) |
| GET    | `/api/teacher/budget/export.csv` | zapis gry |
| POST   | `/api/teacher/budget/import` (multipart: `file`) | wznowienie gry z CSV |
| DELETE | `/api/teacher/budget/players/{id}` | usuń gracza |

Uczniowie pobierają pliki przez `GET /api/files/{id}` (tylko w trakcie sesji).
