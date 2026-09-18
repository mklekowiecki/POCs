"""Optional quiz service of the shell.

The pupil answers by clicking an object in the 3D scene, so a question only
has to name the id of the object that is the right answer. A visualization
that does not want a quiz simply ships no questions.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Question:
    """One click-the-object question.

    Attributes:
        id: Stable identifier.
        prompt: The question, in Polish, for a 10-12 year old.
        target: Id of the pickable object that is the correct answer.
        hint: Shown after the first wrong click.
        explanation: Shown once the question is over, right or wrong.
        points: Awarded for a first-try hit; half of it (rounded down) for a
            hit after a hint.
    """

    id: str
    prompt: str
    target: str
    hint: str = ""
    explanation: str = ""
    points: int = 10


@dataclass(frozen=True)
class AnswerResult:
    """What the shell should show after a click."""

    correct: bool
    points: int
    message: str
    revealed: bool = False
    finished: bool = False


class QuizSession:
    """Runs through a list of questions and keeps the score."""

    def __init__(self, questions, max_attempts: int = 2):
        self.questions: tuple[Question, ...] = tuple(questions)
        if max_attempts < 1:
            raise ValueError("max_attempts musi być większe od zera.")
        self.max_attempts = max_attempts
        self.index = 0
        self.attempts = 0
        self.score = 0
        self.finished = len(self.questions) == 0

    # -- state -----------------------------------------------------------

    @property
    def current(self) -> Question | None:
        if self.finished or self.index >= len(self.questions):
            return None
        return self.questions[self.index]

    @property
    def max_score(self) -> int:
        return sum(question.points for question in self.questions)

    def progress_text(self) -> str:
        position = min(self.index + 1, len(self.questions))
        return f"Pytanie {position} z {len(self.questions)}"

    def score_text(self) -> str:
        return f"Punkty: {self.score} / {self.max_score}"

    # -- playing ---------------------------------------------------------

    def answer(self, object_id: str) -> AnswerResult:
        """Score a click on the object with ``object_id``."""
        question = self.current
        if question is None:
            return AnswerResult(False, 0, "Quiz już się skończył.", finished=True)

        self.attempts += 1

        if object_id == question.target:
            awarded = question.points if self.attempts == 1 else question.points // 2
            self.score += awarded
            message = "Dobrze!" if self.attempts == 1 else "Dobrze, za drugim razem!"
            if question.explanation:
                message = f"{message} {question.explanation}"
            self._advance()
            return AnswerResult(True, awarded, message, finished=self.finished)

        if self.attempts >= self.max_attempts:
            message = "Niestety, to nie to."
            if question.explanation:
                message = f"{message} {question.explanation}"
            self._advance()
            return AnswerResult(False, 0, message, revealed=True, finished=self.finished)

        message = "Spróbuj jeszcze raz."
        if question.hint:
            message = f"{message} Podpowiedź: {question.hint}"
        return AnswerResult(False, 0, message)

    def skip(self) -> AnswerResult:
        """Give up on the current question and move on, scoring nothing."""
        question = self.current
        if question is None:
            return AnswerResult(False, 0, "Quiz już się skończył.", finished=True)
        message = "Pomijamy to pytanie."
        if question.explanation:
            message = f"{message} {question.explanation}"
        self._advance()
        return AnswerResult(False, 0, message, revealed=True, finished=self.finished)

    def restart(self) -> None:
        self.index = 0
        self.attempts = 0
        self.score = 0
        self.finished = len(self.questions) == 0

    def _advance(self) -> None:
        self.index += 1
        self.attempts = 0
        if self.index >= len(self.questions):
            self.finished = True

    # -- result ----------------------------------------------------------

    def stars(self) -> int:
        """0-3 stars, so the pupil sees a result without a school grade."""
        if self.max_score == 0:
            return 0
        ratio = self.score / self.max_score
        if ratio >= 0.9:
            return 3
        if ratio >= 0.6:
            return 2
        if ratio >= 0.3:
            return 1
        return 0

    def summary(self) -> str:
        """Friendly closing line with the stars drawn as characters."""
        stars = self.stars()
        drawing = "*" * stars + "-" * (3 - stars)
        praise = {
            3: "Świetnie! Znasz drogę pakietu na pamięć.",
            2: "Bardzo dobrze! Jeszcze kilka szczegółów i będzie komplet.",
            1: "Niezły początek. Obejrzyj opowieść jeszcze raz i spróbuj ponownie.",
            0: "Spokojnie — przejdź opowieść od początku, a potem wróć do quizu.",
        }[stars]
        return f"[{drawing}]  {self.score} / {self.max_score} punktów. {praise}"
