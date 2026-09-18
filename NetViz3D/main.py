#!/usr/bin/env python3
"""Uruchamia aplikację „Wirtualne wycieczki 3D”.

Sposób użycia:

    python main.py                    - otwiera menu wyboru wycieczki
    python main.py --lista            - wypisuje dostępne wizualizacje
"""

from __future__ import annotations

import sys


def print_catalogue() -> int:
    """Wypisuje katalog wizualizacji bez otwierania okna."""
    from netviz3d.core import registry

    metas = registry.discover(include_hidden=True)
    if not metas:
        print("Nie znaleziono żadnej wizualizacji.")
        return 1
    print("Dostępne wizualizacje:\n")
    for meta in metas:
        mark = "  (ukryta)" if meta.hidden else ""
        print(f"  {meta.id:<18} {meta.title}{mark}")
        print(f"  {'':<18} {meta.subtitle}")
        print()
    return 0


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] in ("--lista", "--list", "-l"):
        return print_catalogue()
    if len(argv) > 1 and argv[1] in ("--pomoc", "--help", "-h"):
        print(__doc__)
        return 0

    from netviz3d.app import run

    return run()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
