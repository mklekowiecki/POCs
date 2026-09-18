"""Discovery of visualization plugins.

A visualization is a sub-package of ``netviz3d.visualizations`` laid out like
this::

    netviz3d/visualizations/my_topic/
        __init__.py
        meta.py      -> VISUALIZATION = VisualizationMeta(...)   (no Ursina)
        content.py   -> Polish texts and scene data              (no Ursina)
        scene.py     -> class Scene(Visualization)               (Ursina here)

Only ``meta`` is imported while the menu is built, so listing the catalogue is
cheap and works without a display. ``scene`` is imported the moment the pupil
picks a tile.
"""

from __future__ import annotations

import dataclasses
import importlib
import pkgutil
from typing import Iterator

from netviz3d.core.meta import VisualizationMeta

PACKAGE = "netviz3d.visualizations"


class VisualizationLoadError(RuntimeError):
    """Raised when a plugin package is present but cannot be used."""


def _iter_packages() -> Iterator[str]:
    package = importlib.import_module(PACKAGE)
    for module_info in pkgutil.iter_modules(package.__path__):
        if module_info.ispkg:
            yield module_info.name


def discover(include_hidden: bool = False) -> list[VisualizationMeta]:
    """Return metadata of every visualization, sorted for the menu."""
    found: list[VisualizationMeta] = []
    for name in _iter_packages():
        package_path = f"{PACKAGE}.{name}"
        try:
            module = importlib.import_module(f"{package_path}.meta")
        except ImportError as exc:  # pragma: no cover - broken plugin
            raise VisualizationLoadError(
                f"Nie udało się wczytać opisu wizualizacji '{name}': {exc}"
            ) from exc

        meta = getattr(module, "VISUALIZATION", None)
        if not isinstance(meta, VisualizationMeta):
            raise VisualizationLoadError(
                f"Moduł {package_path}.meta musi definiować VISUALIZATION "
                "typu VisualizationMeta."
            )
        found.append(dataclasses.replace(meta, package=package_path))

    if not include_hidden:
        found = [meta for meta in found if not meta.hidden]
    found.sort(key=lambda meta: (meta.order, meta.title))
    return found


def get(visualization_id: str, include_hidden: bool = True) -> VisualizationMeta:
    """Return metadata of one visualization by id."""
    for meta in discover(include_hidden=include_hidden):
        if meta.id == visualization_id:
            return meta
    raise KeyError(f"Nie ma wizualizacji o identyfikatorze '{visualization_id}'.")


def load_scene_class(meta: VisualizationMeta):
    """Import the Ursina scene class of a visualization.

    This is the only place where plugin code (and therefore Ursina) is
    imported, which keeps the menu and the test-suite display-free.
    """
    module = importlib.import_module(meta.scene_module)
    scene_class = getattr(module, meta.scene_class, None)
    if scene_class is None:
        raise VisualizationLoadError(
            f"Moduł {meta.scene_module} nie zawiera klasy {meta.scene_class}."
        )
    return scene_class
