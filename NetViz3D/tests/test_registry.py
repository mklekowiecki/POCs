"""Wykrywanie wtyczek — działa bez okna i bez zainstalowanej Ursiny."""

import importlib.util

import pytest

from netviz3d.core import registry
from netviz3d.core.meta import VisualizationMeta

URSINA_AVAILABLE = importlib.util.find_spec("ursina") is not None


def test_discover_finds_both_visualizations():
    ids = [meta.id for meta in registry.discover()]
    assert "internet_journey" in ids
    assert "home_network" in ids


def test_template_is_hidden_by_default():
    assert "template" not in [meta.id for meta in registry.discover()]
    assert "template" in [meta.id for meta in registry.discover(include_hidden=True)]


def test_discover_fills_in_the_package_path():
    meta = registry.get("internet_journey")
    assert meta.package == "netviz3d.visualizations.internet_journey"
    assert meta.scene_module == "netviz3d.visualizations.internet_journey.scene"


def test_discover_is_sorted_by_order():
    metas = registry.discover()
    assert [meta.order for meta in metas] == sorted(meta.order for meta in metas)


def test_every_meta_has_texts_for_the_menu_tile():
    for meta in registry.discover(include_hidden=True):
        assert meta.title and meta.subtitle and meta.description
        assert meta.accent.startswith("#") and len(meta.accent) == 7
        assert isinstance(meta, VisualizationMeta)


def test_unknown_id_raises():
    with pytest.raises(KeyError):
        registry.get("nie_ma_takiej")


def test_scene_module_needs_a_package():
    with pytest.raises(ValueError):
        VisualizationMeta(id="x", title="x", subtitle="x", description="x").scene_module


@pytest.mark.skipif(not URSINA_AVAILABLE, reason="Ursina nie jest zainstalowana")
def test_scene_classes_can_be_imported():
    for meta in registry.discover(include_hidden=True):
        scene_class = registry.load_scene_class(meta)
        assert hasattr(scene_class, "build")
