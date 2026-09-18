"""Start screen: one tile per visualization found by the registry."""

from __future__ import annotations

from typing import Callable

from ursina import Entity, camera, destroy

from netviz3d import theme
from netviz3d.core.meta import VisualizationMeta
from netviz3d.ui.widgets import UIButton, label, panel, shade, to_color

TILE_SIZE = (0.52, 0.36)
COLUMNS = 3
ROW_Y = (0.115, -0.285)


class MenuTile:
    """A clickable card describing one visualization."""

    def __init__(self, meta: VisualizationMeta, position, on_click: Callable[[VisualizationMeta], None]):
        self.meta = meta
        self.on_click = on_click
        x, y = position
        width, height = TILE_SIZE

        self.background = Entity(
            parent=camera.ui,
            model="quad",
            color=to_color(theme.PAPER, 0.97),
            scale=TILE_SIZE,
            position=(x, y, 0),
            collider="box",
        )
        self.background.on_click = self._clicked
        self.background.on_mouse_enter = self._enter
        self.background.on_mouse_exit = self._exit

        header_height = 0.078
        self.header = Entity(
            parent=camera.ui,
            model="quad",
            color=to_color(meta.accent),
            scale=(width, header_height),
            position=(x, y + height / 2 - header_height / 2, -0.01),
        )
        self.title = label(
            meta.title,
            (x, y + height / 2 - header_height / 2),
            1.15,
            theme.PAPER,
            z=-0.02,
        )
        left = x - width / 2 + 0.028
        self.subtitle = label(
            meta.subtitle, (left, y + 0.072), 0.85, theme.INK, origin=(-0.5, 0), z=-0.02
        )
        self.description = label(
            meta.description,
            (left, y + 0.042),
            0.78,
            theme.INK_SOFT,
            origin=(-0.5, 0.5),
            wordwrap=40,
            z=-0.02,
        )
        footer = " • ".join(part for part in (meta.age_hint, meta.duration_hint) if part)
        self.footer = label(
            footer, (left, y - height / 2 + 0.032), 0.72, theme.INK_SOFT, origin=(-0.5, 0), z=-0.02
        )
        self.call_to_action = label(
            "Kliknij, aby zacząć >",
            (x + width / 2 - 0.028, y - height / 2 + 0.032),
            0.78,
            meta.accent,
            origin=(0.5, 0),
            z=-0.02,
        )
        self._widgets = [
            self.background,
            self.header,
            self.title,
            self.subtitle,
            self.description,
            self.footer,
            self.call_to_action,
        ]

    def _clicked(self) -> None:
        self.on_click(self.meta)

    def _enter(self) -> None:
        self.background.color = to_color(shade(theme.PAPER_DIM, 1.0))
        self.header.color = to_color(shade(self.meta.accent, 1.15))

    def _exit(self) -> None:
        self.background.color = to_color(theme.PAPER, 0.97)
        self.header.color = to_color(self.meta.accent)

    def set_visible(self, visible: bool) -> None:
        for widget in self._widgets:
            widget.enabled = visible
        self.background.collision = visible

    def destroy(self) -> None:
        for widget in self._widgets:
            destroy(widget)
        self._widgets.clear()


class MenuScreen:
    """The whole start screen."""

    def __init__(
        self,
        metas: list[VisualizationMeta],
        on_pick: Callable[[VisualizationMeta], None],
        on_quit: Callable[[], None],
    ):
        self.metas = metas
        self.backdrop = panel((0, 0), (2.0, 1.1), theme.BACKGROUND, 1.0, z=0.1)
        self.title = label("Wirtualne wycieczki 3D", (0, 0.42), 2.0, theme.INK)
        self.subtitle = label(
            "Wybierz wycieczkę, obracaj świat myszką i sprawdź się w quizie.",
            (0, 0.355),
            0.95,
            theme.INK_SOFT,
        )
        self.hint = label(
            "Sterowanie: przeciągnij lewym przyciskiem myszy, kółko przybliża, "
            "R przywraca widok, H to pomoc.",
            (0, -0.455),
            0.8,
            theme.INK_SOFT,
        )
        self.quit_button = UIButton(
            "Zakończ",
            on_quit,
            position=(0.75, 0.44),
            scale=(0.2, 0.06),
            hex_color=theme.BAD,
        )

        self.tiles: list[MenuTile] = []
        for index, meta in enumerate(metas):
            self.tiles.append(MenuTile(meta, self._tile_position(index, len(metas)), on_pick))

        if not metas:
            self.hint.text = (
                "Nie znaleziono żadnej wizualizacji w katalogu "
                "netviz3d/visualizations."
            )

    @staticmethod
    def _tile_position(index: int, total: int):
        """Centre the tiles: full rows of three, last row centred."""
        row = index // COLUMNS
        column = index % COLUMNS
        in_this_row = min(COLUMNS, total - row * COLUMNS)
        spacing = TILE_SIZE[0] + 0.045
        first_x = -spacing * (in_this_row - 1) / 2
        y = ROW_Y[row] if row < len(ROW_Y) else ROW_Y[-1]
        return (first_x + column * spacing, y)

    def set_visible(self, visible: bool) -> None:
        for widget in (self.backdrop, self.title, self.subtitle, self.hint):
            widget.enabled = visible
        self.quit_button.visible = visible
        for tile in self.tiles:
            tile.set_visible(visible)

    def destroy(self) -> None:
        for tile in self.tiles:
            tile.destroy()
        self.tiles.clear()
        self.quit_button.destroy()
        for widget in (self.backdrop, self.title, self.subtitle, self.hint):
            destroy(widget)
