# Wirtualne wycieczki 3D — jak działa internet

Aplikacja 3D dla uczniów klas 4–6 szkoły podstawowej. Pokazuje całą drogę,
jaką pokonuje prośba z komputera ucznia do serwera po drugiej stronie świata:
Wi‑Fi, router, przyłącze, dostawca internetu, węzeł sieci, światłowód, kabel na
dnie oceanu, centrum danych i serwer.

Scenę można swobodnie obracać, przybliżać i przesuwać, każdy obiekt da się
kliknąć, a na końcu czeka quiz polegający na klikaniu właściwych elementów
w scenie.

Program jest jednocześnie **kontenerem na kolejne wizualizacje** — w menu
startowym pojawia się kafelek każdej wycieczki znalezionej w katalogu
`netviz3d/visualizations/`.

---

## 1. Czego potrzeba

* Python 3.9 lub nowszy (sprawdzone na 3.11)
* karta graficzna z OpenGL — wystarczy zwykły szkolny komputer
* około 150 MB miejsca na bibliotekę Ursina

## 2. Instalacja krok po kroku

### Windows

1. Zainstaluj Pythona ze strony <https://www.python.org/downloads/> —
   w instalatorze **zaznacz „Add Python to PATH”**.
2. Otwórz wiersz poleceń (klawisz Windows, wpisz `cmd`, Enter).
3. Przejdź do katalogu z projektem, np.:

   ```
   cd C:\POCs\NetViz3D
   ```

4. Zainstaluj biblioteki:

   ```
   pip install -r requirements.txt
   ```

5. Uruchom aplikację:

   ```
   python main.py
   ```

### Linux / macOS

```bash
cd NetViz3D
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

> Pierwsze uruchomienie może potrwać kilkanaście sekund — Ursina przygotowuje
> wtedy swoje pliki pomocnicze.

## 3. Sterowanie

| Co chcę zrobić | Mysz | Klawiatura | Przycisk na ekranie |
| --- | --- | --- | --- |
| Obrócić scenę | przeciągnij lewym przyciskiem | strzałki lub `W` `S` `A` `D` | `<` `>` `^` `v` |
| Przybliżyć / oddalić | kółko myszy | `Q` / `E` | `+` / `−` |
| Przesunąć widok | przeciągnij prawym przyciskiem | — | — |
| Wrócić do widoku początkowego | — | `R` | „Widok od nowa” |
| Następny / poprzedni przystanek | — | `spacja` / `Backspace` | „Dalej” / „Wstecz” |
| Samo odtwarzanie opowieści | — | `P` | „Odtwarzaj” |
| Dowiedzieć się, czym jest obiekt | kliknij obiekt | — | — |
| Pomoc | — | `H` | „Pomoc” |
| Powrót do menu / wyjście | — | `Esc` | „Menu” |

Wszystkie funkcje kamery mają przyciski na ekranie, więc aplikacja działa też
na szkolnym touchpadzie i na tablicy interaktywnej.

## 4. Co zawiera aplikacja

| Wizualizacja | Czas | Zawartość |
| --- | --- | --- |
| **Podróż przez internet** | 15–20 min | 10 przystanków (komputer → Wi‑Fi → router → przyłącze → dostawca → węzeł → światłowód → kabel podmorski → centrum danych → serwer) + droga powrotna, 7 pytań quizowych |
| **Sieć domowa z bliska** | 8–10 min | router i 6 urządzeń w mieszkaniu, Wi‑Fi kontra kabel, adresy w sieci domowej, 4 pytania quizowe |

Quiz: uczeń odpowiada, **klikając obiekt w scenie**. Trafienie za pierwszym
razem to pełna liczba punktów, za drugim — połowa. Po dwóch pomyłkach program
sam podświetla prawidłową odpowiedź i tłumaczy, o co chodziło. Na koniec uczeń
dostaje od 0 do 3 gwiazdek, bez ocen.

## 5. Jak dodać własną wizualizację

Aplikacja nie zna się na sieciach — powłoka daje tylko okno, kamerę, interfejs,
obsługę kliknięć i quiz. Dzięki temu kolejną wycieczką może być np. „jak działa
komputer”.

1. Skopiuj katalog `netviz3d/visualizations/_template` pod nową nazwą,
   np. `jak_dziala_komputer`.
2. W `meta.py` ustaw `id`, `title`, `subtitle`, `description`, kolor kafelka
   i `hidden=False`.
3. W `content.py` wpisz teksty: przystanki opowieści (`STEPS`) i pytania
   quizowe (`QUESTIONS`).
4. W `scene.py` zbuduj scenę zwykłym kodem Ursiny i zarejestruj klikalne
   obiekty.

Minimalna scena wygląda tak:

```python
class Scene(Visualization):
    def steps(self):
        return STEPS          # przystanki opowieści (mogą być puste)

    def questions(self):
        return QUESTIONS      # pytania quizu (mogą być puste)

    def build(self):
        procesor = Entity(parent=self.ctx.root, model="cube", position=(0, 1, 0))
        self.ctx.register_pickable(procesor, "procesor", "Procesor", "Opis…")

    def on_enter(self):
        self.ctx.camera.set_home(target=(0, 1, 0), distance=18)

    def on_step(self, step, index):
        self.ctx.camera.glide_to(self.ctx.position_of(step.focus), distance=10)

    def update(self, dt):
        ...                   # animacje, jeśli są potrzebne
```

Identyfikator przekazany do `register_pickable` (tutaj `"procesor"`) łączy
obiekt 3D z krokiem opowieści (`Step.focus`) i z pytaniem quizowym
(`Question.target`).

Co powłoka daje wizualizacji (`self.ctx`):

| Pole | Do czego służy |
| --- | --- |
| `ctx.root` | rodzic wszystkich obiektów sceny; powłoka sama go sprząta |
| `ctx.camera` | kamera: `set_home`, `set_limits`, `glide_to`, `reset` |
| `ctx.hud` | pasek tytułu, pasek opowieści, karta informacyjna |
| `ctx.register_pickable(entity, id, tytuł, opis)` | czyni obiekt klikalnym |
| `ctx.position_of(id)` | pozycja zarejestrowanego obiektu |
| `ctx.back_to_menu()` | powrót do menu startowego |

Nowa wizualizacja pojawi się w menu sama — nie trzeba niczego rejestrować
w kodzie powłoki. Można ją też sprawdzić bez otwierania okna:

```bash
python main.py --lista
```

## 6. Struktura projektu

```
NetViz3D/
├── main.py                    # uruchamianie aplikacji i opcja --lista
├── requirements.txt
├── netviz3d/
│   ├── app.py                 # powłoka: okno, menu, kamera, kliknięcia, quiz
│   ├── context.py             # to, co powłoka przekazuje wizualizacji
│   ├── theme.py               # kolory, rozmiary, szukanie czcionki
│   ├── core/                  # czysta logika (bez Ursiny, objęta testami)
│   │   ├── base.py            # klasa bazowa wizualizacji
│   │   ├── meta.py            # opis wizualizacji dla menu
│   │   ├── orbit.py           # matematyka kamery
│   │   ├── quiz.py            # punktacja quizu
│   │   ├── registry.py        # wykrywanie wtyczek
│   │   └── storyline.py       # kolejne przystanki opowieści
│   ├── ui/                    # warstwa Ursiny: kamera, HUD, menu, widżety
│   └── visualizations/        # wtyczki — po jednym katalogu na wycieczkę
│       ├── internet_journey/
│       ├── home_network/
│       └── _template/         # wzór do kopiowania (ukryty w menu)
└── tests/                     # testy logiki, uruchamiane bez okna
```

## 7. Testy

```bash
pip install -r requirements-dev.txt
python -m pytest
```

Testy nie potrzebują ekranu ani zainstalowanej Ursiny — sprawdzają
wykrywanie wtyczek, matematykę kamery, przechodzenie opowieści, punktację
quizu oraz spójność treści (czy każdy krok i każde pytanie wskazuje obiekt,
który naprawdę istnieje w scenie, i czy teksty mieszczą się w interfejsie).

## 8. Gdyby coś nie działało

**Brakuje polskich znaków w napisach.** Skopiuj dowolny plik `.ttf`
do `assets/fonts/font.ttf` albo ustaw zmienną `NETVIZ3D_FONT` — szczegóły
w `assets/fonts/README.md`.

**`ModuleNotFoundError: No module named 'ursina'`.** Biblioteka nie została
zainstalowana: `pip install -r requirements.txt`.

**Okno otwiera się i od razu zamyka.** Uruchom aplikację z wiersza poleceń
(`python main.py`) — komunikat o błędzie zostanie wtedy na ekranie.

**Animacja chodzi wolno.** Zmniejsz okno albo przybliż kamerę — scena składa
się z prostych brył, więc na szkolnym sprzęcie powinna działać płynnie.
