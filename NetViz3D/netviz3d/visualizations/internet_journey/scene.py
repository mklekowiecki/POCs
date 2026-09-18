"""Scena 3D wizualizacji „Podróż przez internet”.

Cała geometria powstaje z prostych brył (sześcian, kula) rysowanych wprost
przez Ursinę — bez zewnętrznych modeli, więc aplikacja działa offline i
uruchamia się natychmiast.
"""

from __future__ import annotations

import math

from ursina import Entity

from netviz3d import theme
from netviz3d.core.base import Visualization
from netviz3d.ui.widgets import to_color

from .content import QUESTIONS, ROUTE, STEPS, STOPS_BY_ID

PACKET_SPEED = 2.4  # punktów trasy na sekundę


# --------------------------------------------------------------------------
# Drobne pomocniki geometryczne (lokalne dla tej wizualizacji)
# --------------------------------------------------------------------------


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


def cable(parent, start, end, hex_color, thickness=0.18) -> Entity:
    """Prosty odcinek kabla między dwoma punktami."""
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    dz = end[2] - start[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    if length < 1e-6:
        length = 1e-6
    yaw = math.degrees(math.atan2(dx, dz))
    pitch = -math.degrees(math.asin(max(-1.0, min(1.0, dy / length))))
    middle = (
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2,
        (start[2] + end[2]) / 2,
    )
    return box(parent, middle, (thickness, thickness, length), hex_color, (pitch, yaw, 0))


def lerp3(a, b, t: float):
    return (
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    )


class Scene(Visualization):
    """Cała wycieczka: dom, sieć dostawcy, ocean i centrum danych."""

    # -- treść, o którą pyta powłoka ---------------------------------------

    def steps(self):
        return STEPS

    def questions(self):
        return QUESTIONS

    def help_lines(self):
        return (
            "W tej wycieczce klikalne są: komputer, fale Wi-Fi, router, "
            "przyłącze, budynek dostawcy, węzeł sieci, światłowód, kabel "
            "podmorski, centrum danych i serwer.",
        )

    # -- budowa sceny -------------------------------------------------------

    def build(self) -> None:
        self.time = 0.0
        self.route_position = 0.0
        self.route_direction = 1.0
        self.wifi_waves: list[Entity] = []
        self.blinkers: list[Entity] = []
        self.clouds: list[Entity] = []

        root = self.ctx.root
        self._build_world(root)
        self._build_home(root)
        self._build_provider(root)
        self._build_exchange(root)
        self._build_fiber(root)
        self._build_ocean(root)
        self._build_datacenter(root)
        self._build_route(root)
        self._build_packet(root)
        self._build_marker(root)

    # -- świat --------------------------------------------------------------

    def _build_world(self, root) -> None:
        box(root, (-18, -0.5, 0), (48, 1, 26), theme.GROUND)
        box(root, (33, -0.5, 0), (26, 1, 26), theme.GROUND)
        # Brzegi, żeby ląd nie kończył się ostrą krawędzią.
        box(root, (5.6, -0.4, 0), (1.6, 1.2, 26), theme.GROUND_DARK)
        box(root, (20.4, -0.4, 0), (1.6, 1.2, 26), theme.GROUND_DARK)
        # Drzewa po obu stronach trasy.
        for x, z in ((-20, 7), (-11, -8), (-2, 8), (28, -8), (36, 7), (-30, -8)):
            box(root, (x, 0.8, z), (0.5, 1.6, 0.5), "#8B5E3C")
            ball(root, (x, 2.3, z), 2.6, theme.GROUND_DARK)
        # Chmury — powoli przesuwają się w tle.
        for x, y, z in ((-22, 12, -11), (-4, 14, -13), (16, 13, -12), (30, 12, -11)):
            cloud = Entity(parent=root, position=(x, y, z))
            ball(cloud, (0, 0, 0), (5, 2.4, 3), theme.PAPER, 0.9)
            ball(cloud, (2.2, 0.4, 0.3), (3.6, 2.0, 2.6), theme.PAPER, 0.9)
            ball(cloud, (-2.0, -0.2, -0.2), (3.2, 1.8, 2.4), theme.PAPER, 0.9)
            self.clouds.append(cloud)

    # -- dom ----------------------------------------------------------------

    def _build_home(self, root) -> None:
        home = Entity(parent=root, name="home")
        box(home, (-30, 0.15, 0), (14, 0.4, 11), "#E3CFAE")            # podłoga
        box(home, (-30, 2.6, 5.4), (14, 5, 0.4), "#F6ECD7")            # ściana tylna
        box(home, (-36.8, 2.6, 0), (0.4, 5, 11), "#EFE2C6")            # ściana boczna
        box(home, (-30, 5.2, 0), (14, 0.3, 11), "#D9C39F", alpha=0.35)  # sufit

        # Biurko i laptop
        box(home, (-34, 1.1, 0), (3.4, 0.2, 2.0), "#A9743F")
        for dx in (-1.5, 1.5):
            for dz in (-0.8, 0.8):
                box(home, (-34 + dx, 0.55, dz), (0.16, 1.1, 0.16), "#8B5E3C")
        laptop = box(home, (-34, 1.28, 0.2), (1.9, 0.12, 1.3), theme.DEVICE_DARK)
        box(home, (-34, 1.9, -0.45), (1.9, 1.2, 0.1), theme.DEVICE_DARK, (-15, 0, 0))
        box(home, (-34, 1.9, -0.41), (1.7, 1.0, 0.04), theme.GLASS, (-15, 0, 0))
        box(home, (-31.6, 0.7, 2.2), (1.2, 1.4, 1.2), "#C25B5B")  # krzesło
        self.ctx.register_pickable(
            laptop,
            "komputer",
            STOPS_BY_ID["komputer"].label,
            STOPS_BY_ID["komputer"].description,
        )

        # Fale Wi-Fi między laptopem a routerem. Klikalna jest kula o stałym
        # rozmiarze, żeby cel nie uciekał uczniowi spod kursora; pierścienie
        # obok tylko pulsują.
        hit_sphere = ball(home, (-30.5, 2.5, 0), 2.4, theme.DEVICE, 0.16)
        for index in range(3):
            wave = ball(
                home,
                (-30.5, 2.5, 0),
                1.8 + index * 1.5,
                theme.DEVICE,
                0.20 - index * 0.05,
            )
            self.wifi_waves.append(wave)
        self.ctx.register_pickable(
            hit_sphere,
            "wifi",
            STOPS_BY_ID["wifi"].label,
            STOPS_BY_ID["wifi"].description,
        )

        # Router
        router = box(home, (-27, 1.9, 0), (1.8, 0.45, 1.2), theme.DEVICE)
        for dx in (-0.6, 0.6):
            box(home, (-27 + dx, 2.6, -0.3), (0.09, 1.2, 0.09), theme.INK_SOFT)
        for index in range(3):
            led = box(home, (-27.5 + index * 0.4, 1.9, 0.62), (0.16, 0.16, 0.05), theme.GOOD)
            self.blinkers.append(led)
        self.ctx.register_pickable(
            router,
            "router",
            STOPS_BY_ID["router"].label,
            STOPS_BY_ID["router"].description,
        )

        # Przyłącze na ścianie i kabel schodzący w dół
        socket = box(home, (-23.5, 1.7, 0), (0.7, 0.9, 0.5), theme.BUILDING)
        box(home, (-23.5, 1.7, 0.27), (0.35, 0.35, 0.06), theme.ACCENT)
        self.ctx.register_pickable(
            socket,
            "przylacze",
            STOPS_BY_ID["przylacze"].label,
            STOPS_BY_ID["przylacze"].description,
        )

    # -- dostawca internetu --------------------------------------------------

    def _build_provider(self, root) -> None:
        building = box(root, (-14, 3.0, 0), (5.6, 6.0, 4.4), theme.BUILDING)
        box(root, (-14, 6.2, 0), (6.2, 0.5, 5.0), theme.ROOF)
        box(root, (-14, 1.1, 2.3), (1.2, 2.2, 0.2), theme.INK_SOFT)      # drzwi
        for dx in (-1.6, 0.0, 1.6):
            box(root, (-14 + dx, 4.2, 2.25), (1.0, 1.0, 0.12), theme.GLASS)
        box(root, (-11.4, 8.0, 0), (0.25, 4.0, 0.25), theme.INK_SOFT)    # maszt
        ball(root, (-11.4, 10.2, 0), 1.4, theme.PAPER_DIM)               # antena
        # Słupy, na których wisi kabel z domu
        for x in (-19.0, -9.5):
            box(root, (x, 1.8, 0), (0.22, 3.6, 0.22), "#8B5E3C")
        self.ctx.register_pickable(
            building, "isp", STOPS_BY_ID["isp"].label, STOPS_BY_ID["isp"].description
        )

    # -- węzeł sieci ----------------------------------------------------------

    def _build_exchange(self, root) -> None:
        platform = box(root, (-5, 0.25, 0), (8.0, 0.5, 6.0), theme.ROAD)
        for dx, dz in ((-2.2, -1.4), (-0.7, -1.4), (0.8, -1.4), (2.3, -1.4), (-1.4, 1.4), (1.4, 1.4)):
            box(root, (-5 + dx, 1.7, dz), (1.1, 2.4, 1.1), theme.SERVER)
            for row in range(3):
                led = box(
                    root,
                    (-5 + dx, 1.2 + row * 0.6, dz + 0.58),
                    (0.6, 0.12, 0.05),
                    theme.PACKET if row % 2 else theme.GOOD,
                )
                self.blinkers.append(led)
        box(root, (-5, 3.2, 0), (8.2, 0.25, 6.2), theme.BUILDING_DARK, alpha=0.5)
        self.ctx.register_pickable(
            platform, "wezel", STOPS_BY_ID["wezel"].label, STOPS_BY_ID["wezel"].description
        )

    # -- światłowód -----------------------------------------------------------

    def _build_fiber(self, root) -> None:
        # Powiększony fragment kabla: szara osłona i świecący rdzeń w środku.
        box(root, (3, 1.7, 0), (7.0, 0.9, 0.9), theme.ROAD, (0, 0, 0))
        core = box(root, (3, 1.7, 0), (7.4, 0.3, 0.3), theme.PACKET)
        box(root, (3, 1.7, 0), (7.2, 0.6, 0.6), theme.GLASS, alpha=0.35)
        for dx in (-3.2, 3.2):
            box(root, (3 + dx, 1.7, 0), (0.4, 1.1, 1.1), theme.INK_SOFT)
        self.ctx.register_pickable(
            core,
            "swiatlowod",
            STOPS_BY_ID["swiatlowod"].label,
            STOPS_BY_ID["swiatlowod"].description,
        )

    # -- ocean ----------------------------------------------------------------

    def _build_ocean(self, root) -> None:
        box(root, (13, -0.6, 0), (14.4, 1.0, 26), theme.WATER, alpha=0.75)
        box(root, (13, -1.6, 0), (14.4, 1.0, 26), "#1B4F79")  # dno
        undersea = box(root, (13, -0.9, 0), (9.0, 0.5, 0.5), theme.INK_SOFT)
        ball(root, (9.5, -0.9, 0), 1.0, theme.BUILDING_DARK)
        ball(root, (16.5, -0.9, 0), 1.0, theme.BUILDING_DARK)
        # Statek na powierzchni — dzieci od razu widzą, że to prawdziwy ocean.
        ship = Entity(parent=root, position=(11.5, 0.35, -4.5))
        box(ship, (0, 0, 0), (3.4, 0.7, 1.2), "#D94F4F")
        box(ship, (0.4, 0.7, 0), (1.2, 0.8, 0.9), theme.PAPER)
        self.ctx.register_pickable(
            undersea,
            "kabel_podmorski",
            STOPS_BY_ID["kabel_podmorski"].label,
            STOPS_BY_ID["kabel_podmorski"].description,
        )

    # -- centrum danych --------------------------------------------------------

    def _build_datacenter(self, root) -> None:
        hall = box(root, (25, 2.8, 0), (11.0, 5.6, 9.0), theme.BUILDING)
        box(root, (25, 5.8, 0), (11.6, 0.5, 9.6), theme.BUILDING_DARK)
        for dx in (-3.2, 0.0, 3.2):  # klimatyzacja na dachu
            box(root, (25 + dx, 6.4, 0), (1.6, 0.9, 1.6), theme.ROAD)
        box(root, (25, 1.2, 4.6), (1.6, 2.4, 0.2), theme.INK_SOFT)
        for dx in (-3.6, -1.2, 1.2, 3.6):
            box(root, (25 + dx, 4.2, 4.55), (1.4, 1.0, 0.12), theme.GLASS)
        self.ctx.register_pickable(
            hall,
            "datacenter",
            STOPS_BY_ID["datacenter"].label,
            STOPS_BY_ID["datacenter"].description,
        )

        rack = box(root, (32, 2.0, 0), (1.8, 4.0, 1.8), theme.SERVER)
        for row in range(6):
            led = box(root, (32, 0.6 + row * 0.6, 0.92), (1.2, 0.14, 0.05), theme.GOOD)
            self.blinkers.append(led)
        box(root, (32, 4.2, 0), (2.0, 0.2, 2.0), theme.INK_SOFT)
        self.ctx.register_pickable(
            rack, "serwer", STOPS_BY_ID["serwer"].label, STOPS_BY_ID["serwer"].description
        )

    # -- trasa i pakiet ---------------------------------------------------------

    def _build_route(self, root) -> None:
        for index in range(len(ROUTE) - 1):
            start, end = ROUTE[index], ROUTE[index + 1]
            under_water = start[1] < 0 or end[1] < 0
            cable(
                root,
                start,
                end,
                theme.INK_SOFT if under_water else theme.LINK,
                thickness=0.22 if under_water else 0.16,
            )

    def _build_packet(self, root) -> None:
        self.packet = ball(root, ROUTE[0], 0.85, theme.PACKET)
        self.packet_glow = ball(root, ROUTE[0], 1.6, theme.PACKET, 0.28)

    def _build_marker(self, root) -> None:
        """Obracający się znacznik nad obiektem, o którym właśnie mówimy."""
        self.marker = Entity(parent=root, position=(0, 6, 0))
        self.marker_base_y = 6.0
        box(self.marker, (0, 0, 0), (0.9, 0.9, 0.9), theme.ACCENT, (45, 45, 0))
        box(self.marker, (0, -0.9, 0), (0.25, 1.1, 0.25), theme.ACCENT_DARK)
        self.marker.enabled = False

    # -- cykl życia ---------------------------------------------------------------

    def on_enter(self) -> None:
        self.ctx.camera.set_limits(min_distance=8, max_distance=170, max_pitch=78)
        self.ctx.camera.set_home(target=(-3, 3, 0), yaw=18, pitch=26, distance=78)

    def on_step(self, step, index) -> None:
        stop = STOPS_BY_ID.get(step.focus)
        if stop is None:
            self.marker.enabled = False
            return
        self.marker.enabled = True
        self.marker_base_y = stop.position[1] + stop.marker_height
        self.marker.position = (stop.position[0], self.marker_base_y, stop.position[2])
        # Ostatni krok pokazuje całą trasę z lotu ptaka.
        if step.id == "powrot":
            self.ctx.camera.glide_to((-3, 3, 0), distance=86)
        else:
            self.ctx.camera.glide_to(stop.position, distance=26.0)

    def on_quiz_start(self) -> None:
        self.marker.enabled = False
        self.ctx.camera.glide_to((-3, 3, 0), distance=86)

    def on_quiz_end(self) -> None:
        self.marker.enabled = True

    def update(self, dt: float) -> None:
        self.time += dt

        # Pakiet wędruje tam i z powrotem po trasie.
        self.route_position += self.route_direction * PACKET_SPEED * dt
        last = len(ROUTE) - 1
        if self.route_position >= last:
            self.route_position = last
            self.route_direction = -1.0
        elif self.route_position <= 0:
            self.route_position = 0.0
            self.route_direction = 1.0
        index = int(self.route_position)
        fraction = self.route_position - index
        position = lerp3(ROUTE[index], ROUTE[min(index + 1, last)], fraction)
        self.packet.position = position
        self.packet_glow.position = position
        pulse = 1.0 + 0.18 * math.sin(self.time * 7.0)
        self.packet_glow.scale = (1.6 * pulse, 1.6 * pulse, 1.6 * pulse)

        # Fale Wi-Fi pulsują.
        for number, wave in enumerate(self.wifi_waves):
            phase = (self.time * 1.1 + number * 0.33) % 1.0
            size = 1.2 + phase * 4.0
            wave.scale = (size, size, size)
            wave.color = to_color(theme.DEVICE, max(0.0, 0.26 * (1.0 - phase)))

        # Diody mrugają w różnym rytmie.
        for number, led in enumerate(self.blinkers):
            on = math.sin(self.time * 3.0 + number * 1.7) > -0.2
            led.color = to_color(theme.GOOD if on else theme.INK_SOFT)

        # Znacznik unosi się i obraca.
        if self.marker.enabled:
            self.marker.rotation_y = (self.marker.rotation_y + 60 * dt) % 360
            self.marker.y = self.marker_base_y + math.sin(self.time * 2.2) * 0.12

        # Chmury dryfują.
        for number, cloud in enumerate(self.clouds):
            cloud.x += dt * (0.35 + number * 0.05)
            if cloud.x > 46:
                cloud.x = -46
