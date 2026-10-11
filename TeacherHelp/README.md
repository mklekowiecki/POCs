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

Serwer nasłuchuje na `http://0.0.0.0:5000` (wszystkie interfejsy, port 5000).

| Kto        | Adres                                   |
|------------|-----------------------------------------|
| Uczniowie  | `http://<IP-komputera-nauczyciela>:5000/` |

Strony ucznia i nauczyciela są podpisane „Lekcja Informatyki” (nagłówki i tytuły kart w `wwwroot/index.html` i `wwwroot/teacher.html`).
| Nauczyciel | `http://localhost:5000/teacher.html`    |

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

Strony są wysyłane z nagłówkiem `Cache-Control: no-cache`, więc po aktualizacji aplikacji przeglądarki
od razu pobierają nowe pliki. Wyjątek: komputery, które otwierały stronę jeszcze w wersji bez tego
nagłówka, mogą mieć ją w cache – wystarczy jednorazowo odświeżyć stronę przez **Ctrl+F5**.

### Zapora sieciowa

Na komputerze nauczyciela trzeba zezwolić na połączenia przychodzące na port 5000 – inaczej strona
działa pod `localhost`, ale uczniowie jej nie widzą. Najprościej przy pierwszym uruchomieniu kliknąć
„Zezwalaj” w oknie Zapory Windows, albo (PowerShell jako administrator):

```powershell
New-NetFirewallRule -DisplayName "Teacher Help" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Private,Domain
```

Testy: `dotnet test` w katalogu `TeacherHelp/`.

## Specyfikacja (ustalona metodą sokratejską)

**Sesja**
- Nauczyciel loguje się hasłem i rozpoczyna sesję, podając liczbę zadań – powstają zadania 1…N.
- W trakcie sesji można dopisywać kolejne zadania (z opcjonalnym tytułem) i nadawać/zmieniać tytuły
  (kliknięcie w nagłówek kolumny).
- Zadanie = numer + opcjonalny tytuł.
- Stan sesji jest trzymany tylko w pamięci serwera. „Zakończ sesję” lub restart serwera kasuje wszystko.
  Przed zakończeniem można pobrać wyniki jako CSV (separator `;`, UTF-8 – otwiera się w polskim Excelu).

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
- Wchodząc, wpisuje imię/login. Login jest unikalny w sesji (bez rozróżniania wielkości liter);
  zajęty login → komunikat „wybierz inny”.
- Przeglądarka zapamiętuje ucznia (token w `localStorage`), więc odświeżenie strony (F5) nie gubi postępu.
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
- Przycisk „Usuń” przy uczniu (np. literówka w loginie) – uczeń wraca do ekranu logowania,
  a login się zwalnia.

**Świadome uproszczenia (POC)**
- Brak powiązania z Veyonem – tożsamością ucznia jest login, komputer jest nieistotny.
- HTTP bez TLS: hasło nauczyciela idzie po sieci lokalnej otwartym tekstem.
- Brak trwałego zapisu i historii sesji.
- Pobieranie plików nie wymaga logowania ucznia – wystarczy znać link (losowy identyfikator), dopóki trwa sesja.

## Architektura

- ASP.NET Core (minimal API) + SignalR, jedna aplikacja serwuje też strony statyczne z `wwwroot/`.
- `Session/SessionService.cs` – cała logika sesji (thread-safe, bez zależności od ASP.NET, pokryta testami).
- `Session/FileStorage.cs` – zawartość udostępnionych plików na dysku (metadane trzyma `SessionService`).
- `Hubs/StudentHub.cs` – uczeń: `GetView`, `Join`, `Toggle`.
- `Hubs/TeacherHub.cs` – nauczyciel (wymaga logowania): `GetDashboard`; zmiany idą przez `/api/teacher/*`.
- `Hubs/SessionNotifier.cs` – po każdej zmianie wysyła nauczycielom pełny dashboard,
  a uczniom sygnał `changed`, po którym pobierają swój widok.
- Frontend: czysty HTML/JS bez frameworka; klient SignalR jest dołączony lokalnie
  (`wwwroot/lib/signalr.min.js`), więc aplikacja działa w sieci szkolnej bez dostępu do internetu.

### API nauczyciela (cookie po zalogowaniu)

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| POST   | `/api/teacher/login` `{password}` | logowanie |
| POST   | `/api/teacher/logout` | wylogowanie |
| POST   | `/api/teacher/session/start` `{taskCount}` | nowa sesja |
| POST   | `/api/teacher/session/end` | koniec sesji |
| POST   | `/api/teacher/tasks` `{title?}` | dodaj zadanie |
| PUT    | `/api/teacher/tasks/{n}` `{title?}` | zmień tytuł |
| DELETE | `/api/teacher/students/{id}` | usuń ucznia |
| GET    | `/api/teacher/export.csv` | eksport wyników |
| POST   | `/api/teacher/files` (multipart: `files`, `task?`) | udostępnij pliki (bez `task` = materiały ogólne) |
| DELETE | `/api/teacher/files/{id}` | usuń plik |

Uczniowie pobierają pliki przez `GET /api/files/{id}` (tylko w trakcie sesji).
