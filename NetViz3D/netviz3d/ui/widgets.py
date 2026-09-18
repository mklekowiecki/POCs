"""Small Ursina helpers shared by the shell: colours, panels and buttons.

Everything here is intentionally hand-rolled from ``Entity`` and ``Text`` so
the look stays the same across Ursina versions and no prefab surprises us.
"""

from __future__ import annotations

from typing import Callable

from ursina import Entity, Text, camera, color

from netviz3d import theme

try:  # Color lives in ursina.color; older versions export it differently.
    _Color = color.Color
except AttributeError:  # pragma: no cover - very old Ursina
    from ursina import Vec4 as _Color


def to_color(hex_value: str, alpha: float = 1.0):
    """Turn ``"#4FA3F7"`` into an Ursina colour."""
    value = hex_value.lstrip("#")
    red, green, blue = (int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return _Color(red, green, blue, alpha)


def shade(hex_value: str, factor: float) -> str:
    """Lighten (factor > 1) or darken (factor < 1) a hex colour."""
    value = hex_value.lstrip("#")
    channels = [int(value[i : i + 2], 16) for i in (0, 2, 4)]
    channels = [max(0, min(255, round(channel * factor))) for channel in channels]
    return "#" + "".join(f"{channel:02X}" for channel in channels)


def rounded_quad(aspect: float = 1.0, radius: float = 0.06):
    """A quad with soft corners, falling back to a plain one if unsupported."""
    try:
        from ursina import Quad

        return Quad(aspect=aspect, radius=radius)
    except Exception:  # pragma: no cover - depends on Ursina build
        return "quad"


def panel(
    position=(0.0, 0.0),
    scale=(0.5, 0.2),
    hex_color: str = theme.PAPER,
    alpha: float = theme.PANEL_ALPHA,
    z: float = 0.0,
    parent=None,
) -> Entity:
    """A flat UI card on ``camera.ui``."""
    width, height = scale
    return Entity(
        parent=parent if parent is not None else camera.ui,
        model=rounded_quad(aspect=max(width, 0.001) / max(height, 0.001)),
        color=to_color(hex_color, alpha),
        scale=(width, height),
        position=(position[0], position[1], z),
    )


def label(
    text: str,
    position=(0.0, 0.0),
    scale: float = theme.TEXT_SCALE_BODY,
    hex_color: str = theme.INK,
    origin=(0, 0),
    wordwrap: int = 0,
    z: float = -0.01,
    parent=None,
) -> Text:
    """A piece of UI text on ``camera.ui``."""
    kwargs = {}
    if wordwrap:
        kwargs["wordwrap"] = wordwrap
    return Text(
        text=text,
        parent=parent if parent is not None else camera.ui,
        position=(position[0], position[1], z),
        origin=origin,
        scale=scale,
        color=to_color(hex_color),
        **kwargs,
    )


class UIButton:
    """A clickable card with a caption.

    The background quad and the caption are two independent entities on
    ``camera.ui``; that avoids the text being stretched by the button's own
    non-uniform scale.
    """

    def __init__(
        self,
        text: str,
        on_click: Callable[[], None],
        position=(0.0, 0.0),
        scale=(0.22, 0.062),
        hex_color: str = theme.DEVICE,
        text_color: str = theme.PAPER,
        text_scale: float = theme.TEXT_SCALE_BODY,
        tooltip: str = "",
    ):
        self.base_color = hex_color
        self.hover_color = shade(hex_color, 1.18)
        self.callback = on_click
        self.tooltip = tooltip
        self._enabled = True

        self.background = Entity(
            parent=camera.ui,
            model=rounded_quad(aspect=scale[0] / scale[1], radius=0.12),
            color=to_color(hex_color),
            scale=scale,
            position=(position[0], position[1], 0.0),
            collider="box",
        )
        self.background.on_click = self._clicked
        self.background.on_mouse_enter = self._enter
        self.background.on_mouse_exit = self._exit

        self.caption = label(
            text,
            position=(position[0], position[1]),
            scale=text_scale,
            hex_color=text_color,
            z=-0.02,
        )

    # -- behaviour --------------------------------------------------------

    def _clicked(self) -> None:
        if self._enabled and self.callback:
            self.callback()

    def _enter(self) -> None:
        if self._enabled:
            self.background.color = to_color(self.hover_color)

    def _exit(self) -> None:
        if self._enabled:
            self.background.color = to_color(self.base_color)

    # -- state ------------------------------------------------------------

    @property
    def text(self) -> str:
        return self.caption.text

    @text.setter
    def text(self, value: str) -> None:
        self.caption.text = value

    @property
    def enabled(self) -> bool:
        return self._enabled

    @enabled.setter
    def enabled(self, value: bool) -> None:
        """Greyed-out buttons stay visible but stop reacting."""
        self._enabled = bool(value)
        self.background.color = to_color(
            self.base_color if self._enabled else shade(self.base_color, 0.55)
        )
        self.background.collision = self._enabled

    @property
    def visible(self) -> bool:
        return self.background.enabled

    @visible.setter
    def visible(self, value: bool) -> None:
        self.background.enabled = bool(value)
        self.caption.enabled = bool(value)

    def set_color(self, hex_color: str) -> None:
        self.base_color = hex_color
        self.hover_color = shade(hex_color, 1.18)
        self.background.color = to_color(hex_color)

    def destroy(self) -> None:
        from ursina import destroy as ursina_destroy

        ursina_destroy(self.caption)
        ursina_destroy(self.background)
