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
  (Lekcja, Co kumam?, Obwód elektryczny). Kafelki pokazują na żywo stan aplikacji (np. „Sesja trwa · uczniów: 12”,
  „Otwarta · odpowiedzi: 8”), bo po zalogowaniu panel jest połączony ze wszystkimi hubami naraz.
- Aplikacja jest wybierana adresem (`#lekcja`, `#ankieta`, `#obwod`) – działa „Wstecz” i odświeżenie strony.
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

**Świadome uproszczenia (POC)**
- Brak powiązania z Veyonem – tożsamością ucznia jest imię i nazwisko, komputer jest nieistotny.
- Wybór siebie z listy niepołączonych nie jest niczym zabezpieczony – uczeń może kliknąć cudze nazwisko
  (nauczyciel widzi to w tabeli i może użyć „Odłącz”).
- HTTP bez TLS: hasło nauczyciela idzie po sieci lokalnej otwartym tekstem.
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
- Jeden port; krótkie adresy `/ankieta`, `/obwod`, `/nauczyciel` są przepisywane na pliki z `wwwroot` (`Program.cs`),
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
| GET    | `/api/teacher/addresses` | adresy tego komputera w sieci (dla uczniów) |
| GET    | `/api/teacher/export.csv` | eksport wyników |
| POST   | `/api/teacher/files` (multipart: `files`, `task?`) | udostępnij pliki (bez `task` = materiały ogólne) |
| DELETE | `/api/teacher/files/{id}` | usuń plik |
| POST   | `/api/teacher/survey/start` `{questions[], named}` | nowa ankieta (zastępuje poprzednią) |
| POST   | `/api/teacher/survey/close` | zamknij ankietę |
| GET    | `/api/teacher/survey/export.csv` | eksport ankiety |

Uczniowie pobierają pliki przez `GET /api/files/{id}` (tylko w trakcie sesji).
