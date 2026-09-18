"""The handle a visualization receives from the shell.

Deliberately small: the shell hands over a parent entity, the camera rig, the
HUD and a way to make an entity clickable. Everything else the visualization
does itself with plain Ursina calls.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class PickInfo:
    """What the HUD shows when a registered object is clicked."""

    object_id: str
    title: str
    description: str = ""
    entity: Any = None


@dataclass
class SceneContext:
    """Services the shell offers to the running visualization."""

    #: Ursina entity every scene entity should be parented to; the shell
    #: destroys it when the visualization is closed.
    root: Any

    #: :class:`netviz3d.ui.camera_rig.CameraRig` - orbit, zoom, focus_on().
    camera: Any

    #: :class:`netviz3d.ui.hud.Hud` - title bar, story bar, info panel.
    hud: Any

    #: Registers an entity as clickable; the entity needs a collider.
    register_pickable: Callable[..., PickInfo]

    #: Looks up world coordinates of a registered object id, or None.
    position_of: Callable[[str], Any]

    #: Returns to the start menu.
    back_to_menu: Callable[[], None]
