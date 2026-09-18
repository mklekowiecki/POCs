"""Teksty i rozmieszczenie obiektów dla wizualizacji „Sieć domowa z bliska”."""

from __future__ import annotations

from dataclasses import dataclass

from netviz3d.core.quiz import Question
from netviz3d.core.storyline import Step


@dataclass(frozen=True)
class Device:
    """Sprzęt stojący w mieszkaniu."""

    id: str
    label: str
    description: str
    position: tuple[float, float, float]
    color: str
    wireless: bool = True
    marker_height: float = 2.4


DEVICES: tuple[Device, ...] = (
    Device(
        id="router",
        label="Router",
        description=(
            "Serce sieci domowej. Rozsyła Wi-Fi, prowadzi kable i pilnuje, "
            "żeby odpowiedź z internetu trafiła do tego urządzenia, które "
            "wysłało prośbę."
        ),
        position=(0.0, 2.2, 0.0),
        color="#4FA3F7",
        marker_height=2.2,
    ),
    Device(
        id="laptop",
        label="Laptop",
        description=(
            "Łączy się przez Wi-Fi. Kiedy odsuwasz go od routera albo "
            "zamykasz drzwi, sygnał słabnie i film potrafi się zaciąć."
        ),
        position=(-6.0, 1.3, 4.0),
        color="#8A8F98",
    ),
    Device(
        id="telefon",
        label="Telefon",
        description=(
            "Też korzysta z Wi-Fi. W domu warto je włączyć — wtedy telefon "
            "nie zużywa pakietu danych od operatora."
        ),
        position=(5.0, 1.0, 5.0),
        color="#33415A",
    ),
    Device(
        id="telewizor",
        label="Telewizor",
        description=(
            "Podłączony kablem. Kabel nie przechodzi przez ściany, ale za to "
            "daje najrówniejszy obraz — nic mu nie przeszkadza."
        ),
        position=(6.5, 2.2, -3.5),
        color="#132033",
        wireless=False,
        marker_height=2.6,
    ),
    Device(
        id="drukarka",
        label="Drukarka",
        description=(
            "Drukarka też jest w sieci! Dlatego można wysłać do niej "
            "dokument z laptopa albo z telefonu, nie podłączając żadnego "
            "kabla."
        ),
        position=(-6.5, 1.1, -4.0),
        color="#C9D3DF",
    ),
    Device(
        id="konsola",
        label="Konsola do gier",
        description=(
            "Podczas gry wysyła i odbiera mnóstwo malutkich pakietów. "
            "Dlatego przy grach najbardziej przeszkadza opóźnienie, a nie "
            "sama prędkość."
        ),
        position=(0.5, 1.0, 7.0),
        color="#F5A524",
    ),
    Device(
        id="lacze",
        label="Łącze od dostawcy",
        description=(
            "Ten jeden kabel łączy całe mieszkanie ze światem. Wszystkie "
            "urządzenia dzielą się nim po równo — dlatego gdy kilka osób "
            "ogląda filmy naraz, bywa wolniej."
        ),
        position=(0.0, 2.2, -9.0),
        color="#F5A524",
        wireless=False,
        marker_height=2.6,
    ),
)

DEVICES_BY_ID: dict[str, Device] = {device.id: device for device in DEVICES}

STEPS: tuple[Step, ...] = (
    Step(
        id="router",
        title="1. Router w środku domu",
        text=(
            "W każdym domu z internetem stoi router. To on rozdaje sieć "
            "wszystkim sprzętom. Obróć scenę i zobacz, co jest wokół niego."
        ),
        focus="router",
    ),
    Step(
        id="wifi",
        title="2. Wi-Fi dla wszystkich",
        text=(
            "Laptop, telefon, drukarka i konsola łączą się z routerem falami "
            "radiowymi. Im dalej od routera i im więcej ścian po drodze, tym "
            "słabszy sygnał."
        ),
        focus="laptop",
    ),
    Step(
        id="kabel",
        title="3. Telewizor woli kabel",
        text=(
            "Telewizor jest podłączony kablem. Kabel nie przechodzi przez "
            "ściany, ale nic mu nie przeszkadza — obraz jest równy nawet "
            "wtedy, gdy wszyscy naraz oglądają filmy."
        ),
        focus="telewizor",
    ),
    Step(
        id="adresy",
        title="4. Każdy ma swój adres",
        text=(
            "Router nadaje każdemu urządzeniu własny adres w domu — trochę "
            "jak numery mieszkań w bloku. Dzięki temu wie, komu oddać "
            "odpowiedź z internetu."
        ),
        focus="drukarka",
    ),
    Step(
        id="lacze",
        title="5. Jedno łącze dla wszystkich",
        text=(
            "Do mieszkania wchodzi jeden kabel od dostawcy. Wszystkie "
            "urządzenia dzielą się nim. Gdy kilka osób ogląda filmy naraz, "
            "każde dostaje mniejszą część."
        ),
        focus="lacze",
    ),
    Step(
        id="dalej",
        title="6. A co dalej?",
        text=(
            "Za tym kablem zaczyna się świat: dostawca internetu, węzły, "
            "światłowody i serwerownie. Zobacz to w wycieczce „Podróż przez "
            "internet”."
        ),
        focus="router",
    ),
)

QUESTIONS: tuple[Question, ...] = (
    Question(
        id="q_router",
        prompt="Kliknij urządzenie, które łączy ze sobą wszystkie sprzęty w domu.",
        target="router",
        hint="Stoi pośrodku, ma antenki.",
        explanation="To router — serce sieci domowej.",
    ),
    Question(
        id="q_kabel",
        prompt="Kliknij urządzenie, które jest podłączone kablem, a nie przez Wi-Fi.",
        target="telewizor",
        hint="Zobacz, do którego sprzętu biegnie gruba linia.",
        explanation="Telewizor ma kabel — dzięki temu obraz się nie tnie.",
    ),
    Question(
        id="q_lacze",
        prompt="Kliknij kabel, którym internet wchodzi do całego mieszkania.",
        target="lacze",
        hint="Wychodzi z routera i znika za ścianą.",
        explanation="To łącze od dostawcy — jedno dla całego domu.",
    ),
    Question(
        id="q_drukarka",
        prompt="Kliknij sprzęt, który drukuje, a mimo to też jest w sieci.",
        target="drukarka",
        hint="Biały, niski, stoi z tyłu pokoju.",
        explanation="Drukarka jest w sieci, dlatego można do niej wysłać plik bez kabla.",
    ),
)
