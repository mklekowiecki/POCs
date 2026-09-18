"""Spójność wizualizacji — sprawdzana bez otwierania okna.

Testy czytają moduły `content` (czysty Python) oraz analizują składnię
modułów `scene`, dzięki czemu wyłapują literówkę w identyfikatorze obiektu,
zanim zobaczy ją uczeń.
"""

from __future__ import annotations

import ast
import importlib
from pathlib import Path

import pytest

from netviz3d.core import registry

# Ile znaków mieści się w paskach interfejsu (wordwrap x liczba linii).
MAX_STEP_TITLE = 34
MAX_STEP_TEXT = 240
MAX_DESCRIPTION = 240
MAX_PROMPT = 120
MAX_HINT = 90
MAX_EXPLANATION = 120

ALL_METAS = registry.discover(include_hidden=True)


def scene_path(meta) -> Path:
    package = importlib.import_module(meta.package)
    return Path(package.__file__).parent / "scene.py"


def scene_tree(meta) -> ast.Module:
    return ast.parse(scene_path(meta).read_text(encoding="utf-8"))


def registered_ids(meta) -> tuple[set[str], bool]:
    """Identyfikatory przekazane do register_pickable jako stały napis.

    Drugi element mówi, czy któreś wywołanie podaje identyfikator zmienną
    (tak robi „Sieć domowa”, która rejestruje sprzęty w pętli).
    """
    ids: set[str] = set()
    dynamic = False
    for node in ast.walk(scene_tree(meta)):
        if not isinstance(node, ast.Call):
            continue
        function = node.func
        if isinstance(function, ast.Attribute) and function.attr == "register_pickable":
            argument = node.args[1] if len(node.args) > 1 else None
            if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
                ids.add(argument.value)
            else:
                dynamic = True
    return ids, dynamic


def content_of(meta):
    return importlib.import_module(f"{meta.package}.content")


def object_ids(meta) -> set[str]:
    """Identyfikatory obiektów, o których wie warstwa treści."""
    content = content_of(meta)
    for attribute in ("STOPS", "DEVICES"):
        items = getattr(content, attribute, None)
        if items:
            return {item.id for item in items}
    ids, _ = registered_ids(meta)
    return ids


@pytest.mark.parametrize("meta", ALL_METAS, ids=lambda meta: meta.id)
class TestEveryVisualization:
    def test_has_the_three_expected_modules(self, meta):
        package = Path(importlib.import_module(meta.package).__file__).parent
        for name in ("meta.py", "content.py", "scene.py"):
            assert (package / name).is_file(), f"brakuje {name} w {meta.package}"

    def test_scene_defines_the_declared_class(self, meta):
        classes = [
            node.name for node in scene_tree(meta).body if isinstance(node, ast.ClassDef)
        ]
        assert meta.scene_class in classes

    def test_scene_class_inherits_from_visualization(self, meta):
        for node in scene_tree(meta).body:
            if isinstance(node, ast.ClassDef) and node.name == meta.scene_class:
                bases = [base.id for base in node.bases if isinstance(base, ast.Name)]
                assert "Visualization" in bases
                return
        pytest.fail("nie znaleziono klasy sceny")

    def test_steps_point_at_objects_that_exist(self, meta):
        known = object_ids(meta)
        for step in content_of(meta).STEPS:
            assert step.focus in known, f"krok {step.id} wskazuje na '{step.focus}'"

    def test_quiz_questions_point_at_objects_that_exist(self, meta):
        known = object_ids(meta)
        for question in content_of(meta).QUESTIONS:
            assert question.target in known, (
                f"pytanie {question.id} wskazuje na '{question.target}'"
            )

    def test_registered_objects_are_the_ones_content_describes(self, meta):
        ids, dynamic = registered_ids(meta)
        if dynamic:
            pytest.skip("scena rejestruje obiekty w pętli")
        assert ids, "scena nie rejestruje żadnego klikalnego obiektu"
        known = object_ids(meta)
        assert ids <= known or known <= ids

    def test_identifiers_are_unique(self, meta):
        content = content_of(meta)
        for attribute in ("STOPS", "DEVICES"):
            items = getattr(content, attribute, None)
            if items:
                assert len({item.id for item in items}) == len(items)
        assert len({step.id for step in content.STEPS}) == len(content.STEPS)
        assert len({q.id for q in content.QUESTIONS}) == len(content.QUESTIONS)

    def test_texts_fit_the_interface(self, meta):
        content = content_of(meta)
        for step in content.STEPS:
            assert step.title and len(step.title) <= MAX_STEP_TITLE
            assert step.text and len(step.text) <= MAX_STEP_TEXT
        for question in content.QUESTIONS:
            assert question.prompt and len(question.prompt) <= MAX_PROMPT
            assert len(question.hint) <= MAX_HINT
            assert len(question.explanation) <= MAX_EXPLANATION
        for attribute in ("STOPS", "DEVICES"):
            for item in getattr(content, attribute, ()) or ():
                assert item.label and item.description
                assert len(item.description) <= MAX_DESCRIPTION

    def test_quiz_is_optional_but_answerable(self, meta):
        from netviz3d.core.quiz import QuizSession

        questions = content_of(meta).QUESTIONS
        quiz = QuizSession(questions)
        for question in questions:
            result = quiz.answer(question.target)
            assert result.correct
        assert quiz.finished
        assert quiz.score == quiz.max_score
        assert quiz.stars() == 3


class TestInternetJourney:
    """Ta wycieczka jest główna, więc sprawdzamy ją dokładniej."""

    def setup_method(self):
        self.content = importlib.import_module(
            "netviz3d.visualizations.internet_journey.content"
        )

    def test_route_starts_at_the_computer_and_ends_at_the_server(self):
        stops = self.content.STOPS_BY_ID
        route = self.content.ROUTE
        assert route[0][0] == pytest.approx(stops["komputer"].position[0])
        assert route[-1][0] == pytest.approx(stops["serwer"].position[0])

    def test_route_goes_from_left_to_right_without_jumping_back(self):
        xs = [point[0] for point in self.content.ROUTE]
        assert xs == sorted(xs), "trasa nie może zawracać — pakiet leciałby wstecz"

    def test_route_dips_below_the_water_only_in_the_ocean(self):
        underwater = [point for point in self.content.ROUTE if point[1] < 0]
        assert underwater, "brakuje odcinka podmorskiego"
        assert all(6.0 <= point[0] <= 20.0 for point in underwater)

    def test_all_ten_stops_appear_in_the_story(self):
        used = {step.focus for step in self.content.STEPS}
        assert used == set(self.content.STOPS_BY_ID)

    def test_story_covers_home_provider_backbone_and_datacenter(self):
        ids = [step.id for step in self.content.STEPS]
        for expected in ("start", "router", "isp", "wezel", "ocean", "datacenter", "serwer"):
            assert expected in ids

    def test_quiz_has_between_six_and_eight_questions(self):
        assert 6 <= len(self.content.QUESTIONS) <= 8
