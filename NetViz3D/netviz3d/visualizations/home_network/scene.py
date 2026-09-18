"""Scena 3D wizualizacji „Sieć domowa z bliska”.

Druga wizualizacja w kontenerze — pokazuje, że powłoka (kamera, HUD, menu,
klikanie, quiz) nie wie nic o sieciach i że kolejną wycieczkę pisze się
w tym samym rytmie: własna geometria, własna logika, ten sam kontrakt.
"""

from __future__ import annotations

import math

from ursina import Entity

from netviz3d import theme
from netviz3d.core.base import Visualization
from netviz3d.ui.widgets import to_color

from .content import DEVICES, DEVICES_BY_ID, QUESTIONS, STEPS

DOT_COUNT = 7  # ile kropek tworzy jedną „linię” Wi-Fi


def box(parent, position, scale, hex_color, rotation=(0, 0, 0), alpha=1.0) -> Entity:
    return Entity(
        parent=parent,
        model="cube",
        position=position,
        scale=scale,
        rotation=rotation,
        color=to_color(hex_color, alpha),
    )


def ball(parent, position, scale, hex_color, alpha=1.0) -> Entity:
    if not isinstance(scale, (tuple, list)):
        scale = (scale, scale, scale)
    return Entity(
        parent=parent,
        model="sphere",
        position=position,
        scale=scale,
        color=to_color(hex_color, alpha),
    )


class Scene(Visualization):
    """Mieszkanie z routerem pośrodku i sprzętami dookoła."""

    def steps(self):
        return STEPS

    def questions(self):
        return QUESTIONS

    def help_lines(self):
        return (
            "Klikalne są: router, laptop, telefon, telewizor, drukarka, "
            "konsola i łącze od dostawcy.",
        )

    # -- budowa --------------------------------------------------------------

    def build(self) -> None:
        self.time = 0.0
        self.dots: list[tuple[Entity, float]] = []
        self.blinkers: list[Entity] = []

        root = self.ctx.root
        self._build_room(root)
        self._build_devices(root)
        self._build_connections(root)
        self._build_marker(root)

    def _build_room(self, root) -> None:
        box(root, (0, -0.2, 0), (22, 0.4, 22), "#E3CFAE")           # podłoga
        box(root, (0, 2.6, -11), (22, 5.6, 0.4), "#F6ECD7")          # ściana
        box(root, (-11, 2.6, 0), (0.4, 5.6, 22), "#EFE2C6")          # ściana boczna
        box(root, (0, 0.35, -8.5), (6, 0.7, 2), "#A9743F")           # szafka
        for x, z in ((8.5, 8.5), (-8.5, 8.0)):                        # doniczki
            box(root, (x, 0.5, z), (1.0, 1.0, 1.0), "#C25B5B")
            ball(root, (x, 1.6, z), 2.0, theme.GROUND_DARK)

    def _build_devices(self, root) -> None:
        for device in DEVICES:
            builder = getattr(self, f"_build_{device.id}", None)
            entity = builder(root, device) if builder else self._build_generic(root, device)
            self.ctx.register_pickable(entity, device.id, device.label, device.description)

    def _build_generic(self, root, device) -> Entity:
        return box(root, device.position, (1.6, 1.0, 1.2), device.color)

    def _build_router(self, root, device) -> Entity:
        body = box(root, device.position, (2.2, 0.5, 1.5), device.color)
        x, y, z = device.position
        box(root, (x, y - 1.1, z), (0.5, 1.8, 0.5), theme.BUILDING_DARK)  # podstawka
        for dx in (-0.7, 0.7):
            box(root, (x + dx, y + 0.9, z - 0.4), (0.1, 1.4, 0.1), theme.INK_SOFT)
        for index in range(4):
            led = box(root, (x - 0.75 + index * 0.5, y, z + 0.78), (0.2, 0.2, 0.05), theme.GOOD)
            self.blinkers.append(led)
        return body

    def _build_laptop(self, root, device) -> Entity:
        x, y, z = device.position
        box(root, (x, y - 0.65, z), (2.6, 1.3, 1.8), "#A9743F")       # stolik
        base = box(root, (x, y, z), (1.8, 0.12, 1.2), device.color)
        box(root, (x, y + 0.6, z - 0.5), (1.8, 1.1, 0.1), device.color, (-15, 0, 0))
        box(root, (x, y + 0.6, z - 0.46), (1.6, 0.95, 0.04), theme.GLASS, (-15, 0, 0))
        return base

    def _build_telefon(self, root, device) -> Entity:
        x, y, z = device.position
        box(root, (x, y - 0.55, z), (1.4, 1.1, 1.4), "#A9743F")
        phone = box(root, (x, y + 0.1, z), (0.5, 1.0, 0.1), device.color, (-12, 20, 0))
        box(root, (x, y + 0.1, z - 0.07), (0.42, 0.88, 0.03), theme.GLASS, (-12, 20, 0))
        return phone

    def _build_telewizor(self, root, device) -> Entity:
        x, y, z = device.position
        box(root, (x, y - 1.3, z), (0.4, 2.0, 0.4), theme.INK_SOFT)   # noga
        screen = box(root, (x, y, z), (0.2, 2.0, 3.6), device.color)
        box(root, (x - 0.13, y, z), (0.05, 1.7, 3.3), theme.GLASS)
        return screen

    def _build_drukarka(self, root, device) -> Entity:
        x, y, z = device.position
        body = box(root, (x, y, z), (2.0, 1.2, 1.6), device.color)
        box(root, (x, y + 0.7, z + 0.2), (1.6, 0.15, 1.0), theme.PAPER)
        box(root, (x, y - 0.15, z + 0.85), (1.2, 0.1, 0.05), theme.INK_SOFT)
        return body

    def _build_konsola(self, root, device) -> Entity:
        x, y, z = device.position
        box(root, (x, y - 0.6, z), (2.4, 1.2, 1.6), "#A9743F")
        body = box(root, (x, y + 0.15, z), (1.8, 0.4, 1.2), device.color)
        box(root, (x, y + 0.38, z), (1.2, 0.08, 0.7), theme.INK_SOFT)
        return body

    def _build_lacze(self, root, device) -> Entity:
        x, y, z = device.position
        plate = box(root, (x, y, z + 1.6), (1.0, 1.2, 0.4), theme.BUILDING)
        box(root, (x, y, z + 1.78), (0.4, 0.4, 0.08), device.color)
        # Kabel wchodzący przez ścianę do routera.
        box(root, (x, y, z + 3.2), (0.25, 0.25, 3.0), device.color)
        box(root, (x, y, z + 5.5), (0.25, 0.25, 2.0), device.color)
        return plate

    def _build_connections(self, root) -> None:
        """Kropki Wi-Fi i jeden prawdziwy kabel do telewizora."""
        router = DEVICES_BY_ID["router"].position
        for device in DEVICES:
            if device.id in ("router", "lacze"):
                continue
            if device.wireless:
                for index in range(DOT_COUNT):
                    t = (index + 1) / (DOT_COUNT + 1)
                    position = (
                        router[0] + (device.position[0] - router[0]) * t,
                        router[1] + (device.position[1] - router[1]) * t + 0.6,
                        router[2] + (device.position[2] - router[2]) * t,
                    )
                    dot = ball(root, position, 0.26, theme.DEVICE, 0.85)
                    self.dots.append((dot, t))
            else:
                self._wire(root, router, device.position)

    def _wire(self, root, start, end) -> None:
        """Gruby kabel rysowany w dwóch odcinkach, jak poprowadzony po podłodze."""
        corner = (end[0], 0.15, start[2])
        for first, second in ((start, corner), (corner, end)):
            dx = second[0] - first[0]
            dy = second[1] - first[1]
            dz = second[2] - first[2]
            length = math.sqrt(dx * dx + dy * dy + dz * dz)
            if length < 1e-6:
                continue
            yaw = math.degrees(math.atan2(dx, dz))
            pitch = -math.degrees(math.asin(max(-1.0, min(1.0, dy / length))))
            middle = (
                (first[0] + second[0]) / 2,
                (first[1] + second[1]) / 2,
                (first[2] + second[2]) / 2,
            )
            box(root, middle, (0.2, 0.2, length), theme.ACCENT_DARK, (pitch, yaw, 0))

    def _build_marker(self, root) -> None:
        self.marker = Entity(parent=root, position=(0, 5, 0))
        self.marker_base_y = 5.0
        box(self.marker, (0, 0, 0), (0.8, 0.8, 0.8), theme.ACCENT, (45, 45, 0))
        box(self.marker, (0, -0.8, 0), (0.22, 1.0, 0.22), theme.ACCENT_DARK)
        self.marker.enabled = False

    # -- cykl życia ------------------------------------------------------------

    def on_enter(self) -> None:
        self.ctx.camera.set_limits(min_distance=6, max_distance=70, max_pitch=80)
        self.ctx.camera.set_home(target=(0, 1.5, 0), yaw=20, pitch=30, distance=28)

    def on_step(self, step, index) -> None:
        device = DEVICES_BY_ID.get(step.focus)
        if device is None:
            self.marker.enabled = False
            return
        self.marker.enabled = True
        self.marker_base_y = device.position[1] + device.marker_height
        self.marker.position = (device.position[0], self.marker_base_y, device.position[2])
        self.ctx.camera.glide_to(device.position, distance=16.0)

    def on_quiz_start(self) -> None:
        self.marker.enabled = False
        self.ctx.camera.glide_to((0, 1.5, 0), distance=30.0)

    def on_quiz_end(self) -> None:
        self.marker.enabled = True

    def update(self, dt: float) -> None:
        self.time += dt

        # Kropki Wi-Fi rozjaśniają się kolejno, jakby dane biegły od routera.
        for dot, t in self.dots:
            wave = (math.sin(self.time * 2.6 - t * 6.0) + 1.0) / 2.0
            dot.color = to_color(theme.DEVICE, 0.25 + 0.6 * wave)
            size = 0.2 + 0.16 * wave
            dot.scale = (size, size, size)

        for number, led in enumerate(self.blinkers):
            on = math.sin(self.time * 3.4 + number * 1.9) > -0.2
            led.color = to_color(theme.GOOD if on else theme.INK_SOFT)

        if self.marker.enabled:
            self.marker.rotation_y = (self.marker.rotation_y + 60 * dt) % 360
            self.marker.y = self.marker_base_y + math.sin(self.time * 2.2) * 0.1
