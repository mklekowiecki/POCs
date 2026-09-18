"""Opis wizualizacji „Podróż przez internet”."""

from netviz3d.core.meta import VisualizationMeta

VISUALIZATION = VisualizationMeta(
    id="internet_journey",
    title="Podróż przez internet",
    subtitle="Od twojego komputera do serwera po drugiej stronie świata",
    description=(
        "Zobacz całą drogę, jaką pokonuje twoja prośba o film: router, "
        "dostawca internetu, węzeł sieci, światłowód, kabel na dnie oceanu "
        "i wielka serwerownia."
    ),
    age_hint="klasy 4-6",
    duration_hint="15-20 minut",
    accent="#4FA3F7",
    order=10,
)
