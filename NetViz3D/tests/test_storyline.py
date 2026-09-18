"""Sterowanie opowieścią: kolejne przystanki wycieczki."""

import pytest

from netviz3d.core.storyline import Step, Storyline


def make(count: int = 3) -> Storyline:
    return Storyline([Step(id=f"s{i}", title=f"T{i}", text="...") for i in range(count)])


def test_empty_storyline_is_rejected():
    with pytest.raises(ValueError):
        Storyline([])


def test_starts_on_the_first_step():
    story = make()
    assert story.index == 0
    assert story.is_first and not story.is_last
    assert story.current.id == "s0"


def test_next_stops_on_the_last_step_instead_of_wrapping():
    story = make(2)
    story.next()
    assert story.is_last
    story.next()
    assert story.index == 1


def test_previous_stops_on_the_first_step():
    story = make()
    story.previous()
    assert story.index == 0


def test_goto_clamps_and_supports_negative_indexes():
    story = make(4)
    assert story.goto(99).id == "s3"
    assert story.goto(-1).id == "s3"
    assert story.goto(-99).id == "s0"


def test_goto_id():
    story = make(4)
    assert story.goto_id("s2").id == "s2"
    with pytest.raises(KeyError):
        story.goto_id("nie ma")


def test_progress_text_counts_from_one():
    story = make(5)
    story.next()
    assert story.progress_text() == "Przystanek 2 z 5"


def test_restart():
    story = make()
    story.next()
    story.restart()
    assert story.index == 0
