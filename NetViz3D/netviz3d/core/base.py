"""Contract between the shell and a visualization plugin.

The shell owns the window, the orbit camera, the HUD, the start menu, the
click dispatching and the (optional) quiz. Everything else - every entity,
every animation, every bit of domain logic - belongs to the visualization,
which builds it with the raw Ursina API. Nothing here knows about packets,
routers or computers, so the next visualization ("jak działa komputer") fits
the same contract without touching the core.

Lifecycle::

    scene = Scene(context)     # cheap, no entities yet
    scene.build()              # create Ursina entities under context.root
    scene.on_enter()           # first step shown, camera placed
    ... scene.update(dt) every frame, scene.on_pick(...) on clicks ...
    scene.on_exit()            # destroy what build() created
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Sequence

from netviz3d.core.meta import VisualizationMeta
from netviz3d.core.quiz import Question
from netviz3d.core.storyline import Step

if TYPE_CHECKING:  # pragma: no cover - import only for type checkers
    from netviz3d.context import SceneContext


class Visualization:
    """Base class every visualization plugin inherits from."""

    #: Filled in by the subclass; the shell passes the discovered metadata.
    meta: VisualizationMeta

    def __init__(self, context: "SceneContext", meta: VisualizationMeta):
        self.ctx = context
        self.meta = meta

    # -- content the shell asks for --------------------------------------

    def steps(self) -> Sequence[Step]:
        """Stops of the guided tour. Return an empty sequence for none."""
        return ()

    def questions(self) -> Sequence[Question]:
        """Quiz questions. Return an empty sequence to hide the quiz button."""
        return ()

    def help_lines(self) -> Sequence[str]:
        """Extra lines for the help overlay, below the standard controls."""
        return ()

    # -- lifecycle hooks --------------------------------------------------

    def build(self) -> None:
        """Create the Ursina entities. Parent them to ``self.ctx.root``."""
        raise NotImplementedError

    def on_enter(self) -> None:
        """Called once after :meth:`build`, before the first frame."""

    def on_exit(self) -> None:
        """Called before the scene is thrown away.

        The shell destroys ``self.ctx.root`` afterwards, so only clean up
        things that live outside it (sequences, invokes, extra entities).
        """

    def update(self, dt: float) -> None:
        """Called every frame with the time since the previous one."""

    # -- interaction -------------------------------------------------------

    def on_step(self, step: Step, index: int) -> None:
        """Called whenever the guided tour moves to another stop."""

    def on_pick(self, object_id: str) -> None:
        """Called when the pupil clicks a registered object."""

    def on_quiz_start(self) -> None:
        """Called when the quiz mode is switched on."""

    def on_quiz_end(self) -> None:
        """Called when the quiz is finished or abandoned."""
