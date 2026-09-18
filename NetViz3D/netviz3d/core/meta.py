"""Metadata describing a single visualization.

This module is deliberately free of any Ursina import so that the start menu
(and the tests) can list every visualization without touching the 3D engine.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class VisualizationMeta:
    """Everything the shell needs to know before a visualization is loaded.

    Attributes:
        id: Stable identifier, used in tests, logs and saved progress.
        title: Name shown on the menu tile (Polish, for pupils).
        subtitle: One short line under the title.
        description: Two or three sentences shown on the menu tile.
        age_hint: Target audience, e.g. "klasy 4-6".
        accent: Hex colour of the tile, e.g. "#4FA3F7".
        duration_hint: Rough lesson length, e.g. "15-20 minut".
        order: Sort order in the menu (lower first).
        hidden: Templates and work-in-progress scenes stay out of the menu.
        scene_class: Name of the class inside the package's ``scene`` module.
        package: Filled in by the registry; the importable package path.
    """

    id: str
    title: str
    subtitle: str
    description: str
    age_hint: str = "klasy 4-6"
    accent: str = "#4FA3F7"
    duration_hint: str = ""
    order: int = 100
    hidden: bool = False
    scene_class: str = "Scene"
    package: str = field(default="", compare=False)

    @property
    def scene_module(self) -> str:
        """Import path of the module holding the Ursina scene."""
        if not self.package:
            raise ValueError(
                f"Visualization '{self.id}' has no package set. "
                "Metadata is normally completed by netviz3d.core.registry."
            )
        return f"{self.package}.scene"
