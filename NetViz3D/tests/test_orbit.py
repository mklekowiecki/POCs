"""Matematyka kamery orbitującej."""

import math

from netviz3d.core.orbit import OrbitState


def test_camera_sits_at_the_requested_distance():
    state = OrbitState(target=(0, 0, 0), yaw=0, pitch=0, distance=25)
    x, y, z = state.camera_position()
    assert math.isclose(math.sqrt(x * x + y * y + z * z), 25, rel_tol=1e-6)


def test_yaw_zero_puts_the_camera_behind_the_target():
    state = OrbitState(target=(0, 0, 0), yaw=0, pitch=0, distance=10)
    x, y, z = state.camera_position()
    assert math.isclose(x, 0, abs_tol=1e-9)
    assert math.isclose(y, 0, abs_tol=1e-9)
    assert math.isclose(z, -10, rel_tol=1e-9)


def test_pitch_is_clamped_both_ways():
    state = OrbitState(pitch=0, min_pitch=-5, max_pitch=80)
    state.orbit(0, 500)
    assert state.pitch == 80
    state.orbit(0, -500)
    assert state.pitch == -5


def test_yaw_wraps_around():
    state = OrbitState(yaw=350)
    state.orbit(20, 0)
    assert math.isclose(state.yaw, 10, abs_tol=1e-9)


def test_zoom_is_clamped_and_proportional():
    state = OrbitState(distance=40, min_distance=6, max_distance=160)
    state.zoom(-1)
    assert 6 <= state.distance < 40
    for _ in range(100):
        state.zoom(-1)
    assert state.distance == 6
    for _ in range(200):
        state.zoom(1)
    assert state.distance == 160


def test_reset_returns_to_the_remembered_home():
    state = OrbitState(target=(1, 2, 3), yaw=10, pitch=20, distance=30)
    state.orbit(90, 30)
    state.zoom(5)
    state.pan(10, 10)
    state.reset()
    assert state.target == (1, 2, 3)
    assert state.yaw == 10
    assert state.pitch == 20
    assert state.distance == 30


def test_focus_on_moves_the_target_and_optionally_the_distance():
    state = OrbitState()
    state.focus_on((5, 1, -2))
    assert state.target == (5.0, 1.0, -2.0)
    state.focus_on((0, 0, 0), distance=12)
    assert state.distance == 12


def test_pan_slides_along_the_camera_right_vector():
    state = OrbitState(target=(0, 0, 0), yaw=0)
    state.pan(2, 0)
    assert math.isclose(state.target[0], 2, abs_tol=1e-9)
    assert math.isclose(state.target[2], 0, abs_tol=1e-9)


def test_blend_towards_takes_the_short_way_around():
    state = OrbitState(yaw=350, distance=10, target=(0, 0, 0))
    goal = OrbitState(yaw=10, distance=20, target=(10, 0, 0))
    state.blend_towards(goal, 0.5)
    assert math.isclose(state.yaw, 0, abs_tol=1e-6)
    assert math.isclose(state.distance, 15, abs_tol=1e-6)
    assert math.isclose(state.target[0], 5, abs_tol=1e-6)


def test_blend_factor_is_clamped():
    state = OrbitState(distance=10)
    goal = OrbitState(distance=20)
    state.blend_towards(goal, 5)
    assert math.isclose(state.distance, 20, abs_tol=1e-9)
