"""Opis wizualizacji „Sieć domowa z bliska”."""

from netviz3d.core.meta import VisualizationMeta

VISUALIZATION = VisualizationMeta(
    id="home_network",
    title="Sieć domowa z bliska",
    subtitle="Jeden router, wiele urządzeń",
    description=(
        "Przyjrzyj się sieci w jednym mieszkaniu: router, Wi-Fi, kabel do "
        "telewizora i adresy, dzięki którym każde urządzenie dostaje to, o "
        "co poprosiło."
    ),
    age_hint="klasy 4-6",
    duration_hint="8-10 minut",
    accent="#2FB86B",
    order=20,
)
