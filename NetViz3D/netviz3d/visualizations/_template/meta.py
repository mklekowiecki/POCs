"""Szablon nowej wizualizacji.

Skopiuj cały katalog `_template` pod nową nazwą (np. `jak_dziala_komputer`),
zmień pola poniżej i ustaw `hidden=False`, żeby kafelek pojawił się w menu.
"""

from netviz3d.core.meta import VisualizationMeta

VISUALIZATION = VisualizationMeta(
    id="template",
    title="Szablon wizualizacji",
    subtitle="Punkt wyjścia do własnej wycieczki",
    description=(
        "Najmniejsza działająca wizualizacja: trzy bryły, dwa przystanki "
        "opowieści i jedno pytanie quizowe."
    ),
    age_hint="dowolny",
    duration_hint="2 minuty",
    accent="#8A8F98",
    order=900,
    hidden=True,  # ustaw False, aby szablon pojawił się w menu
)
