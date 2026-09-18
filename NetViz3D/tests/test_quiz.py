"""Punktacja quizu: klikanie obiektów w scenie."""

import pytest

from netviz3d.core.quiz import Question, QuizSession


def questions(count: int = 3):
    return [
        Question(
            id=f"q{i}",
            prompt=f"Kliknij {i}",
            target=f"obiekt{i}",
            hint="podpowiedź",
            explanation="wyjaśnienie",
            points=10,
        )
        for i in range(count)
    ]


def test_first_try_gives_full_points():
    quiz = QuizSession(questions(1))
    result = quiz.answer("obiekt0")
    assert result.correct
    assert result.points == 10
    assert quiz.score == 10
    assert result.finished


def test_second_try_gives_half_the_points():
    quiz = QuizSession(questions(1))
    first = quiz.answer("cokolwiek")
    assert not first.correct and not first.revealed
    assert "podpowiedź" in first.message.lower()
    second = quiz.answer("obiekt0")
    assert second.correct and second.points == 5
    assert quiz.score == 5


def test_running_out_of_attempts_reveals_the_answer_and_moves_on():
    quiz = QuizSession(questions(2))
    quiz.answer("źle")
    result = quiz.answer("znowu źle")
    assert not result.correct
    assert result.revealed
    assert "wyjaśnienie" in result.message
    assert quiz.current.id == "q1"
    assert quiz.score == 0


def test_attempts_reset_between_questions():
    quiz = QuizSession(questions(2))
    quiz.answer("źle")
    quiz.answer("obiekt0")
    assert quiz.attempts == 0
    result = quiz.answer("obiekt1")
    assert result.points == 10


def test_skip_moves_on_without_points():
    quiz = QuizSession(questions(2))
    result = quiz.skip()
    assert result.revealed and result.points == 0
    assert quiz.current.id == "q1"


def test_answering_after_the_end_is_harmless():
    quiz = QuizSession(questions(1))
    quiz.answer("obiekt0")
    result = quiz.answer("obiekt0")
    assert result.finished and result.points == 0
    assert quiz.score == 10


def test_restart_clears_the_score():
    quiz = QuizSession(questions(2))
    quiz.answer("obiekt0")
    quiz.restart()
    assert quiz.score == 0 and quiz.index == 0 and not quiz.finished


def test_progress_and_score_texts():
    quiz = QuizSession(questions(3))
    assert quiz.progress_text() == "Pytanie 1 z 3"
    assert quiz.score_text() == "Punkty: 0 / 30"
    quiz.answer("obiekt0")
    assert quiz.progress_text() == "Pytanie 2 z 3"


def test_stars_and_summary():
    quiz = QuizSession(questions(2))
    assert quiz.stars() == 0
    quiz.answer("obiekt0")
    quiz.answer("obiekt1")
    assert quiz.stars() == 3
    assert "20 / 20" in quiz.summary()


def test_empty_quiz_is_finished_immediately():
    quiz = QuizSession([])
    assert quiz.finished
    assert quiz.current is None
    assert quiz.stars() == 0


def test_max_attempts_must_be_positive():
    with pytest.raises(ValueError):
        QuizSession(questions(1), max_attempts=0)
