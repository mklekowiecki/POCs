"""The guided tour: an ordered list of stops the pupil walks through."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Step:
    """One stop of the guided tour.

    Attributes:
        id: Stable identifier of the stop.
        title: Headline shown in the story bar.
        text: Two or three short sentences for a 10-12 year old.
        focus: Id of the object the camera should glide to (optional).
        highlight: Ids of objects that light up during this step.
    """

    id: str
    title: str
    text: str
    focus: str = ""
    highlight: tuple[str, ...] = ()


class Storyline:
    """Cursor over a list of :class:`Step` objects."""

    def __init__(self, steps: list[Step] | tuple[Step, ...]):
        if not steps:
            raise ValueError("Opowieść musi mieć co najmniej jeden krok.")
        self.steps: tuple[Step, ...] = tuple(steps)
        self.index: int = 0

    # -- state -----------------------------------------------------------

    @property
    def current(self) -> Step:
        return self.steps[self.index]

    @property
    def is_first(self) -> bool:
        return self.index == 0

    @property
    def is_last(self) -> bool:
        return self.index == len(self.steps) - 1

    def __len__(self) -> int:
        return len(self.steps)

    def progress_text(self) -> str:
        """e.g. ``Przystanek 3 z 11`` for the top bar."""
        return f"Przystanek {self.index + 1} z {len(self.steps)}"

    # -- movement --------------------------------------------------------

    def next(self) -> Step:
        """Advance one stop; stays on the last one instead of wrapping."""
        if not self.is_last:
            self.index += 1
        return self.current

    def previous(self) -> Step:
        if not self.is_first:
            self.index -= 1
        return self.current

    def goto(self, index: int) -> Step:
        """Jump to a stop; out-of-range values are clamped, negatives count
        from the end like normal Python indexing."""
        if index < 0:
            index += len(self.steps)
        self.index = max(0, min(len(self.steps) - 1, index))
        return self.current

    def goto_id(self, step_id: str) -> Step:
        for position, step in enumerate(self.steps):
            if step.id == step_id:
                self.index = position
                return self.current
        raise KeyError(f"Nie ma kroku o identyfikatorze '{step_id}'.")

    def restart(self) -> Step:
        self.index = 0
        return self.current
