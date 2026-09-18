"""Teksty i rozmieszczenie obiektów dla wizualizacji „Podróż przez internet”.

Czysty Python, bez Ursiny — dzięki temu treść można sprawdzić testami,
a nauczyciel może poprawić dowolne zdanie bez zaglądania w kod 3D.
"""

from __future__ import annotations

from dataclasses import dataclass

from netviz3d.core.quiz import Question
from netviz3d.core.storyline import Step


@dataclass(frozen=True)
class Stop:
    """Przystanek na trasie pakietu: obiekt 3D, który można kliknąć."""

    id: str
    label: str
    description: str
    position: tuple[float, float, float]
    marker_height: float = 3.0


STOPS: tuple[Stop, ...] = (
    Stop(
        id="komputer",
        label="Twój komputer",
        description=(
            "Stąd wszystko się zaczyna. Gdy klikasz film, komputer układa "
            "krótką wiadomość: „poproszę to!”. Dzieli ją na malutkie "
            "paczuszki, czyli pakiety, i każdej dokleja adres nadawcy oraz "
            "adres odbiorcy."
        ),
        position=(-34.0, 1.9, 0.0),
        marker_height=2.6,
    ),
    Stop(
        id="wifi",
        label="Wi-Fi albo kabel",
        description=(
            "Pakiet musi najpierw wyjść z komputera. Może polecieć falami "
            "radiowymi (Wi-Fi) albo pobiec kablem. Kabel jest szybszy i "
            "pewniejszy, Wi-Fi wygodniejsze, bo nie trzeba się wpinać."
        ),
        position=(-30.5, 2.5, 0.0),
        marker_height=2.4,
    ),
    Stop(
        id="router",
        label="Router domowy",
        description=(
            "Drogowskaz twojego domu. Router wie, które urządzenie o co "
            "prosiło, wysyła pakiety w świat, a odpowiedzi oddaje właściwemu "
            "urządzeniu — laptopowi, telefonowi albo telewizorowi."
        ),
        position=(-27.0, 1.9, 0.0),
        marker_height=2.6,
    ),
    Stop(
        id="przylacze",
        label="Przyłącze do sieci",
        description=(
            "Tutaj kończy się twój dom, a zaczyna sieć dostawcy internetu. "
            "Kabel wychodzi ze ściany i biegnie dalej — pod ziemią albo na "
            "słupach, razem z kablami sąsiadów."
        ),
        position=(-23.5, 1.7, 0.0),
        marker_height=2.4,
    ),
    Stop(
        id="isp",
        label="Dostawca internetu",
        description=(
            "Firma, która doprowadza internet do domów — trochę jak "
            "wodociągi doprowadzają wodę. Jej urządzenia zbierają pakiety z "
            "całej okolicy i wysyłają je dalej, w stronę reszty świata."
        ),
        position=(-14.0, 3.2, 0.0),
        marker_height=4.4,
    ),
    Stop(
        id="wezel",
        label="Węzeł sieci",
        description=(
            "Wielkie skrzyżowanie internetu. Spotykają się tu sieci różnych "
            "firm i przekazują sobie pakiety. Dzięki temu z jednej sieci "
            "można dotrzeć do każdej innej."
        ),
        position=(-5.0, 2.8, 0.0),
        marker_height=3.6,
    ),
    Stop(
        id="swiatlowod",
        label="Światłowód",
        description=(
            "Szklane włókno cieńsze od włosa. Pakiety lecą w nim jako błyski "
            "światła, więc pokonują setki kilometrów w ułamku sekundy. "
            "Dlatego internet wydaje się natychmiastowy."
        ),
        position=(3.0, 1.6, 0.0),
        marker_height=2.6,
    ),
    Stop(
        id="kabel_podmorski",
        label="Kabel podmorski",
        description=(
            "Na dnie oceanów leżą grube kable, chronione stalą i gumą. To "
            "nimi — a nie satelitami — płynie prawie cały ruch między "
            "kontynentami."
        ),
        position=(13.0, -0.8, 0.0),
        marker_height=4.0,
    ),
    Stop(
        id="datacenter",
        label="Centrum danych",
        description=(
            "Ogromna hala pełna szaf z komputerami. Pracuje dzień i noc, "
            "jest chłodzona wentylatorami i ma własne generatory prądu na "
            "wypadek awarii."
        ),
        position=(25.0, 3.0, 0.0),
        marker_height=4.6,
    ),
    Stop(
        id="serwer",
        label="Serwer",
        description=(
            "Konkretny komputer, który ma to, o co prosiłeś. Odczytuje "
            "prośbę i wysyła odpowiedź: film, zdjęcie albo stronę — znowu "
            "pociętą na pakiety."
        ),
        position=(32.0, 2.0, 0.0),
        marker_height=3.2,
    ),
)

STOPS_BY_ID: dict[str, Stop] = {stop.id: stop for stop in STOPS}

#: Punkty, przez które przelatuje pakiet. Między nimi rysujemy kable.
ROUTE: tuple[tuple[float, float, float], ...] = (
    (-34.0, 1.9, 0.0),
    (-30.5, 2.5, 0.0),
    (-27.0, 2.1, 0.0),
    (-23.5, 1.9, 0.0),
    (-19.0, 3.4, 0.0),
    (-14.0, 3.8, 0.0),
    (-9.5, 3.6, 0.0),
    (-5.0, 3.0, 0.0),
    (0.0, 1.8, 0.0),
    (3.0, 1.7, 0.0),
    (6.5, 0.3, 0.0),
    (9.0, -0.9, 0.0),
    (17.0, -0.9, 0.0),
    (20.0, 0.3, 0.0),
    (23.0, 2.2, 0.0),
    (25.0, 3.2, 0.0),
    (29.0, 2.6, 0.0),
    (32.0, 2.1, 0.0),
)

STEPS: tuple[Step, ...] = (
    Step(
        id="start",
        title="1. Twój komputer",
        text=(
            "Klikasz film. Komputer zamienia to kliknięcie w krótką prośbę i "
            "tnie ją na małe paczuszki — pakiety. Każdy pakiet ma adres: od "
            "kogo leci i do kogo ma dotrzeć. Obróć scenę myszką i rozejrzyj "
            "się po pokoju."
        ),
        focus="komputer",
        highlight=("komputer",),
    ),
    Step(
        id="wifi",
        title="2. Wi-Fi albo kabel",
        text=(
            "Pierwszy krok w podróż. Pakiet leci do routera falami radiowymi "
            "(Wi-Fi) albo biegnie kablem. Fale są wygodne, ale słabną przez "
            "ściany. Kabel jest szybszy i nic mu nie przeszkadza."
        ),
        focus="wifi",
        highlight=("wifi", "router"),
    ),
    Step(
        id="router",
        title="3. Router domowy",
        text=(
            "Router to drogowskaz całego domu. Sprawdza adres pakietu i "
            "wysyła go w stronę internetu. Gdy przyjdzie odpowiedź, odda ją "
            "dokładnie temu urządzeniu, które pytało."
        ),
        focus="router",
        highlight=("router",),
    ),
    Step(
        id="przylacze",
        title="4. Wyjście z domu",
        text=(
            "Tu kończy się twoja sieć domowa. Kabel wychodzi ze ściany i "
            "łączy się z siecią dostawcy internetu — razem z kablami "
            "wszystkich sąsiadów."
        ),
        focus="przylacze",
        highlight=("przylacze",),
    ),
    Step(
        id="isp",
        title="5. Dostawca internetu",
        text=(
            "Pakiet trafia do firmy, która dostarcza internet do twojej "
            "miejscowości. Jej urządzenia zbierają ruch z wielu domów i "
            "wysyłają go dalej, grubszym kablem."
        ),
        focus="isp",
        highlight=("isp",),
    ),
    Step(
        id="wezel",
        title="6. Węzeł sieci",
        text=(
            "Wielkie skrzyżowanie. Tutaj sieci różnych firm przekazują sobie "
            "pakiety. Każde urządzenie po drodze zadaje to samo pytanie: "
            "„w którą stronę teraz?”."
        ),
        focus="wezel",
        highlight=("wezel",),
    ),
    Step(
        id="swiatlowod",
        title="7. Światłowód",
        text=(
            "Pakiet wskakuje w szklane włókno cieńsze od włosa i zamienia "
            "się w błyski światła. Tak pokonuje setki kilometrów szybciej, "
            "niż zdążysz mrugnąć."
        ),
        focus="swiatlowod",
        highlight=("swiatlowod",),
    ),
    Step(
        id="ocean",
        title="8. Pod oceanem",
        text=(
            "Żeby dotrzeć na inny kontynent, pakiet płynie kablem leżącym na "
            "dnie oceanu. Takich kabli są setki — to one, a nie satelity, "
            "łączą kontynenty."
        ),
        focus="kabel_podmorski",
        highlight=("kabel_podmorski",),
    ),
    Step(
        id="datacenter",
        title="9. Centrum danych",
        text=(
            "Pakiet dociera do ogromnej hali pełnej komputerów. Działa dzień "
            "i noc, jest chłodzona i ma zapasowy prąd, żeby strona nigdy nie "
            "przestała działać."
        ),
        focus="datacenter",
        highlight=("datacenter",),
    ),
    Step(
        id="serwer",
        title="10. Serwer odpowiada",
        text=(
            "W jednej z szaf stoi serwer, który ma twój film. Czyta prośbę i "
            "od razu wysyła odpowiedź — też pociętą na pakiety."
        ),
        focus="serwer",
        highlight=("serwer",),
    ),
    Step(
        id="powrot",
        title="11. Droga powrotna",
        text=(
            "Odpowiedź wraca tą samą drogą: kabel, ocean, węzeł, router, "
            "twój komputer. Cała podróż tam i z powrotem trwa zwykle mniej "
            "niż jedno mrugnięcie oka. Teraz spróbuj quizu!"
        ),
        focus="komputer",
        highlight=("komputer", "serwer"),
    ),
)

QUESTIONS: tuple[Question, ...] = (
    Question(
        id="q_router",
        prompt="Kliknij urządzenie, które rozdziela internet na wszystkie sprzęty w domu.",
        target="router",
        hint="Stoi w domu, ma antenki i mrugające światełka.",
        explanation="To router — drogowskaz twojego domu.",
    ),
    Question(
        id="q_komputer",
        prompt="Kliknij miejsce, w którym zaczyna się cała podróż pakietu.",
        target="komputer",
        hint="Szukaj w pokoju, na biurku.",
        explanation="Podróż zaczyna się w twoim komputerze, gdy o coś prosisz.",
    ),
    Question(
        id="q_wifi",
        prompt="Kliknij to, co wysyła dane falami radiowymi, bez żadnego kabla.",
        target="wifi",
        hint="To niewidzialne fale między komputerem a routerem.",
        explanation="To Wi-Fi — dane lecą falami radiowymi.",
    ),
    Question(
        id="q_isp",
        prompt="Kliknij firmę, która doprowadza internet do domów w okolicy.",
        target="isp",
        hint="Budynek zaraz za twoim domem, z masztem i anteną.",
        explanation="To dostawca internetu, po angielsku ISP.",
    ),
    Question(
        id="q_wezel",
        prompt="Kliknij wielkie skrzyżowanie, na którym sieci różnych firm przekazują sobie pakiety.",
        target="wezel",
        hint="Kilka szaf na wspólnym placu, w środku trasy.",
        explanation="To węzeł sieci — skrzyżowanie internetu.",
    ),
    Question(
        id="q_ocean",
        prompt="Kliknij to, czym pakiety podróżują między kontynentami.",
        target="kabel_podmorski",
        hint="Leży na dnie oceanu.",
        explanation="To kabel podmorski — prawie cały ruch między kontynentami płynie właśnie nim.",
    ),
    Question(
        id="q_datacenter",
        prompt="Kliknij halę, w której stoją tysiące komputerów trzymających filmy i strony.",
        target="datacenter",
        hint="Duży budynek na drugim brzegu oceanu.",
        explanation="To centrum danych, czyli serwerownia.",
    ),
)
