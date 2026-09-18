"""Colours, sizes and font handling for the whole application.

Plain data only - no Ursina import - so the tests and the menu can read it
without a window. Colours are hex strings; ``netviz3d.ui.widgets.to_color``
turns them into Ursina colours.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# -- palette -------------------------------------------------------------
# Bright, high-contrast and readable on a classroom projector.

SKY_TOP = "#7EC8F2"
SKY_BOTTOM = "#CDEBFB"
BACKGROUND = "#9BD7F5"
GROUND = "#79C46B"
GROUND_DARK = "#5FA855"
WATER = "#2E7FC4"
ROAD = "#8A8F98"

INK = "#132033"          # main text
INK_SOFT = "#43566E"     # secondary text
PAPER = "#FFFFFF"        # panels
PAPER_DIM = "#EEF4FA"

ACCENT = "#F5A524"       # highlight / current step
ACCENT_DARK = "#C97F0C"
GOOD = "#2FB86B"
BAD = "#E2554A"
PACKET = "#FFE066"
LINK = "#3C5A78"

DEVICE = "#4FA3F7"
DEVICE_DARK = "#2B6FB5"
BUILDING = "#C9D3DF"
BUILDING_DARK = "#9AA8B8"
ROOF = "#D4614F"
SERVER = "#33415A"
GLASS = "#B7E3FF"

# -- layout --------------------------------------------------------------

PANEL_ALPHA = 0.92
TEXT_SCALE_TITLE = 1.4
TEXT_SCALE_BODY = 1.0
TEXT_SCALE_SMALL = 0.85

# -- font ----------------------------------------------------------------
# Ursina's built-in font has no Polish diacritics, so we look for a system
# font that does. The first candidate that exists wins.

FONT_CANDIDATES = (
    # Bundled with the project (optional - drop a .ttf here to be sure).
    Path(__file__).resolve().parent.parent / "assets" / "fonts" / "font.ttf",
    # Windows
    Path("C:/Windows/Fonts/segoeui.ttf"),
    Path("C:/Windows/Fonts/calibri.ttf"),
    Path("C:/Windows/Fonts/arial.ttf"),
    # macOS
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
    # Linux
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
    Path("/usr/share/fonts/TTF/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
)


def find_font() -> str | None:
    """Return a path to a font with Polish characters, or None.

    ``NETVIZ3D_FONT`` overrides the search, which is handy on a school
    computer with an unusual font directory.
    """
    override = os.environ.get("NETVIZ3D_FONT")
    if override and Path(override).is_file():
        return str(Path(override))

    for candidate in FONT_CANDIDATES:
        try:
            if candidate.is_file():
                return str(candidate)
        except OSError:  # pragma: no cover - unreadable path on some systems
            continue
    return None


def font_warning() -> str:
    """Message printed to the console when no suitable font was found."""
    return (
        "Uwaga: nie znaleziono czcionki z polskimi znakami. Napisy mogą "
        "wyglądać dziwnie (np. brak ą, ć, ę). Skopiuj dowolny plik .ttf do "
        "assets/fonts/font.ttf albo ustaw zmienną NETVIZ3D_FONT na ścieżkę "
        "do czcionki."
    )


def is_windows() -> bool:  # pragma: no cover - trivial
    return sys.platform.startswith("win")
