"""Orbit camera maths.

Kept apart from Ursina so the awkward parts (clamping, wrapping, the spherical
to cartesian conversion) can be unit-tested without a window.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

Vector3 = tuple[float, float, float]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@dataclass
class OrbitState:
    """Spherical camera placement around a focus point.

    ``yaw`` and ``pitch`` are in degrees, ``distance`` in world units.
    """

    target: Vector3 = (0.0, 0.0, 0.0)
    yaw: float = 25.0
    pitch: float = 22.0
    distance: float = 40.0

    min_pitch: float = -5.0
    max_pitch: float = 80.0
    min_distance: float = 6.0
    max_distance: float = 160.0

    _home: dict = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        self.pitch = _clamp(self.pitch, self.min_pitch, self.max_pitch)
        self.distance = _clamp(self.distance, self.min_distance, self.max_distance)
        self.yaw = self.yaw % 360.0
        self.remember_home()

    # -- book-keeping ----------------------------------------------------

    def remember_home(self) -> None:
        """Store the current placement as the one the reset button returns to."""
        self._home = {
            "target": tuple(self.target),
            "yaw": self.yaw,
            "pitch": self.pitch,
            "distance": self.distance,
        }

    def reset(self) -> None:
        """Go back to the remembered placement."""
        self.target = self._home["target"]
        self.yaw = self._home["yaw"]
        self.pitch = self._home["pitch"]
        self.distance = self._home["distance"]

    # -- movement --------------------------------------------------------

    def orbit(self, delta_yaw: float, delta_pitch: float) -> None:
        """Turn around the focus point. Pitch is clamped, yaw wraps."""
        self.yaw = (self.yaw + delta_yaw) % 360.0
        self.pitch = _clamp(self.pitch + delta_pitch, self.min_pitch, self.max_pitch)

    def zoom(self, delta: float) -> None:
        """Move closer (negative) or further away (positive).

        The step is proportional to the current distance so zooming feels the
        same whether we look at a whole continent or at a single router.
        """
        self.distance = _clamp(
            self.distance + delta * max(1.0, self.distance * 0.12),
            self.min_distance,
            self.max_distance,
        )

    def pan(self, right: float, up: float) -> None:
        """Slide the focus point in the camera's own screen plane."""
        yaw = math.radians(self.yaw)
        # Right vector of the camera, projected on the ground plane.
        rx, rz = math.cos(yaw), math.sin(yaw)
        x, y, z = self.target
        self.target = (x + rx * right, y + up, z + rz * right)

    def focus_on(self, position: Vector3, distance: float | None = None) -> None:
        """Look at a new point, optionally changing how close we stand."""
        self.target = tuple(float(value) for value in position)
        if distance is not None:
            self.distance = _clamp(distance, self.min_distance, self.max_distance)

    # -- output ----------------------------------------------------------

    def camera_position(self) -> Vector3:
        """Where the camera has to stand to look at ``target``."""
        yaw = math.radians(self.yaw)
        pitch = math.radians(self.pitch)
        horizontal = self.distance * math.cos(pitch)
        x = self.target[0] + horizontal * math.sin(yaw)
        y = self.target[1] + self.distance * math.sin(pitch)
        z = self.target[2] - horizontal * math.cos(yaw)
        return (x, y, z)

    def blend_towards(self, other: "OrbitState", factor: float) -> None:
        """Move a fraction of the way towards another placement.

        Used for the smooth glide between story stops; ``factor`` is clamped to
        0..1 so a long frame cannot overshoot.
        """
        factor = _clamp(factor, 0.0, 1.0)
        delta_yaw = ((other.yaw - self.yaw + 540.0) % 360.0) - 180.0
        self.yaw = (self.yaw + delta_yaw * factor) % 360.0
        self.pitch += (other.pitch - self.pitch) * factor
        self.distance += (other.distance - self.distance) * factor
        self.target = tuple(
            current + (goal - current) * factor
            for current, goal in zip(self.target, other.target)
        )
