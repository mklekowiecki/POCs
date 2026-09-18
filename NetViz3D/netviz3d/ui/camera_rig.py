"""Orbit camera the pupil steers with mouse, keyboard or on-screen buttons.

The maths lives in :mod:`netviz3d.core.orbit`; this class only wires it to
Ursina input and moves the real camera.
"""

from __future__ import annotations

import copy

from ursina import Entity, camera, held_keys, mouse, scene

from netviz3d.core.orbit import OrbitState

# Degrees per second when a key is held down.
KEY_ORBIT_SPEED = 70.0
KEY_PITCH_SPEED = 45.0
KEY_ZOOM_SPEED = 3.0
# Degrees per unit of mouse movement while dragging.
DRAG_ORBIT_SPEED = 260.0
DRAG_PAN_SPEED = 26.0
# How quickly the camera glides to a story stop (fraction per second).
GLIDE_SPEED = 3.2


class CameraRig:
    """Keeps the Ursina camera on a sphere around a focus point."""

    def __init__(self, state: OrbitState | None = None):
        self.state = state or OrbitState()
        self.goal: OrbitState | None = None
        self.dragging = False
        self.panning = False
        self.drag_distance = 0.0
        self.enabled = True

        camera.parent = scene
        camera.fov = 62
        camera.clip_plane_near = 0.1
        camera.clip_plane_far = 900
        # look_at() wants something with a world position, so we keep an
        # invisible entity sitting on the focus point.
        self._focus = Entity(name="camera_focus", visible=False)
        self.apply()

    # -- placement --------------------------------------------------------

    def apply(self) -> None:
        """Push the current state onto the Ursina camera."""
        self._focus.position = self.state.target
        camera.position = self.state.camera_position()
        camera.look_at(self._focus)

    def set_home(
        self,
        target=(0, 0, 0),
        yaw: float = 25.0,
        pitch: float = 24.0,
        distance: float = 45.0,
    ) -> None:
        """Define the starting view of a visualization (and the reset view)."""
        self.state.focus_on(target, distance)
        self.state.yaw = yaw % 360.0
        self.state.pitch = max(self.state.min_pitch, min(self.state.max_pitch, pitch))
        self.state.remember_home()
        self.goal = None
        self.apply()

    def set_limits(
        self,
        min_distance: float | None = None,
        max_distance: float | None = None,
        min_pitch: float | None = None,
        max_pitch: float | None = None,
    ) -> None:
        """Let a visualization decide how close and how low the pupil may go."""
        if min_distance is not None:
            self.state.min_distance = min_distance
        if max_distance is not None:
            self.state.max_distance = max_distance
        if min_pitch is not None:
            self.state.min_pitch = min_pitch
        if max_pitch is not None:
            self.state.max_pitch = max_pitch

    def glide_to(self, position, distance: float | None = None, yaw: float | None = None) -> None:
        """Smoothly move the focus point (used when the story changes stop)."""
        goal = copy.copy(self.state)
        goal._home = dict(self.state._home)
        goal.focus_on(position, distance)
        if yaw is not None:
            goal.yaw = yaw % 360.0
        self.goal = goal

    def stop_gliding(self) -> None:
        self.goal = None

    def reset(self) -> None:
        self.goal = None
        self.state.reset()
        self.apply()

    # -- direct controls (also used by the on-screen buttons) -------------

    def nudge_yaw(self, direction: float) -> None:
        self.goal = None
        self.state.orbit(direction * 18.0, 0.0)
        self.apply()

    def nudge_pitch(self, direction: float) -> None:
        self.goal = None
        self.state.orbit(0.0, direction * 10.0)
        self.apply()

    def step_zoom(self, direction: float) -> None:
        self.goal = None
        self.state.zoom(direction)
        self.apply()

    # -- input ------------------------------------------------------------

    def handle_input(self, key: str) -> bool:
        """React to a single key event. Returns True when it was consumed."""
        if not self.enabled:
            return False
        if key == "scroll up":
            self.step_zoom(-1)
            return True
        if key == "scroll down":
            self.step_zoom(1)
            return True
        if key == "right mouse down":
            self.panning = True
            return True
        if key == "right mouse up":
            self.panning = False
            return True
        if key == "r":
            self.reset()
            return True
        return False

    def begin_drag(self) -> None:
        self.dragging = True
        self.drag_distance = 0.0

    def end_drag(self) -> float:
        """Finish a left-mouse drag and report how far the mouse travelled.

        The shell uses that distance to tell a click ("show me this router")
        from a drag ("turn the scene").
        """
        self.dragging = False
        travelled = self.drag_distance
        self.drag_distance = 0.0
        return travelled

    def update(self, dt: float) -> None:
        if not self.enabled:
            return

        moved = False

        # Keyboard: arrows or WSAD turn, Q/E zoom.
        yaw_input = (
            held_keys["right arrow"] + held_keys["d"] - held_keys["left arrow"] - held_keys["a"]
        )
        pitch_input = (
            held_keys["up arrow"] + held_keys["w"] - held_keys["down arrow"] - held_keys["s"]
        )
        zoom_input = held_keys["e"] - held_keys["q"]

        if yaw_input or pitch_input:
            self.state.orbit(
                yaw_input * KEY_ORBIT_SPEED * dt, pitch_input * KEY_PITCH_SPEED * dt
            )
            self.goal = None
            moved = True
        if zoom_input:
            self.state.zoom(zoom_input * KEY_ZOOM_SPEED * dt)
            self.goal = None
            moved = True

        # Mouse: left drag turns, right drag slides the focus point.
        velocity = mouse.velocity
        if self.dragging and (velocity[0] or velocity[1]):
            self.drag_distance += abs(velocity[0]) + abs(velocity[1])
            self.state.orbit(
                velocity[0] * DRAG_ORBIT_SPEED, -velocity[1] * DRAG_ORBIT_SPEED
            )
            self.goal = None
            moved = True
        elif self.panning and (velocity[0] or velocity[1]):
            scale = self.state.distance / 40.0
            self.state.pan(
                -velocity[0] * DRAG_PAN_SPEED * scale,
                -velocity[1] * DRAG_PAN_SPEED * scale,
            )
            moved = True

        # Glide towards the stop the story asked for.
        if self.goal is not None:
            self.state.blend_towards(self.goal, min(1.0, GLIDE_SPEED * dt))
            moved = True
            close_enough = (
                abs(self.state.distance - self.goal.distance) < 0.05
                and max(
                    abs(a - b) for a, b in zip(self.state.target, self.goal.target)
                )
                < 0.05
            )
            if close_enough:
                self.goal = None

        if moved:
            self.apply()
