"""Teksty szablonowej wizualizacji — tutaj trzymaj wszystko, co czyta uczeń."""

from netviz3d.core.quiz import Question
from netviz3d.core.storyline import Step

STEPS = (
    Step(
        id="start",
        title="1. Pierwszy przystanek",
        text=(
            "Tu wpisz pierwsze zdania opowieści. Obracaj scenę myszką, "
            "przybliżaj kółkiem, a klawiszem R wróć do widoku początkowego."
        ),
        focus="czerwony",
    ),
    Step(
        id="drugi",
        title="2. Drugi przystanek",
        text="Każdy przystanek może skupić kamerę na innym obiekcie sceny.",
        focus="zielony",
    ),
)

QUESTIONS = (
    Question(
        id="q1",
        prompt="Kliknij zielony sześcian.",
        target="zielony",
        hint="Ten po prawej stronie.",
        explanation="Pytania quizowe wskazują obiekt po jego identyfikatorze.",
    ),
)
