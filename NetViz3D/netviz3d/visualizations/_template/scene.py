"""Najkrótsza możliwa wizualizacja — wzór do kopiowania.

Powłoka daje ci surowe API 3D: `self.ctx.root` (rodzic wszystkich obiektów),
`self.ctx.camera` (kamera orbitująca), `self.ctx.hud` i
`self.ctx.register_pickable(...)`. Resztę — geometrię i logikę — piszesz sam
zwykłym kodem Ursiny.
"""

from __future__ import annotations

import math

from ursina import Entity

from netviz3d.core.base import Visualization
from netviz3d.ui.widgets import to_color

from .content import QUESTIONS, STEPS


class Scene(Visualization):
    def steps(self):
        return STEPS

    def questions(self):
        return QUESTIONS

    def build(self) -> None:
        self.time = 0.0
        root = self.ctx.root

        # Podłoga
        Entity(
            parent=root,
            model="cube",
            scale=(20, 0.4, 20),
            position=(0, -0.2, 0),
            color=to_color("#79C46B"),
        )

        # Dwa klikalne obiekty. Identyfikator ("czerwony") łączy obiekt
        # z krokiem opowieści (Step.focus) i z pytaniem quizowym.
        self.red = Entity(
            parent=root,
            model="cube",
            scale=(2, 2, 2),
            position=(-3, 1, 0),
            color=to_color("#E2554A"),
        )
        self.ctx.register_pickable(
            self.red, "czerwony", "Czerwony sześcian", "Tu wpisz swój opis."
        )

        self.green = Entity(
            parent=root,
            model="cube",
            scale=(2, 2, 2),
            position=(3, 1, 0),
            color=to_color("#2FB86B"),
        )
        self.ctx.register_pickable(
            self.green, "zielony", "Zielony sześcian", "I tutaj również."
        )

    def on_enter(self) -> None:
        self.ctx.camera.set_home(target=(0, 1, 0), yaw=20, pitch=25, distance=18)

    def on_step(self, step, index) -> None:
        position = self.ctx.position_of(step.focus)
        if position is not None:
            self.ctx.camera.glide_to(position, distance=10)

    def update(self, dt: float) -> None:
        self.time += dt
        self.green.rotation_y = (self.green.rotation_y + 40 * dt) % 360
        self.red.y = 1 + math.sin(self.time * 2) * 0.2
