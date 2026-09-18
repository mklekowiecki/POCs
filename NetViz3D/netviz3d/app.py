"""The shell: window, start menu, camera, HUD, clicks and the optional quiz.

Everything domain-specific lives in a visualization plugin; this module never
mentions packets, routers or processors. It offers the raw building blocks and
gets out of the way.
"""

from __future__ import annotations

import sys
from time import perf_counter

from netviz3d import theme
from netviz3d.context import PickInfo, SceneContext
from netviz3d.core import registry
from netviz3d.core.meta import VisualizationMeta
from netviz3d.core.quiz import QuizSession
from netviz3d.core.storyline import Storyline

WINDOW_TITLE = "Wirtualne wycieczki 3D — jak działa internet"
AUTO_STEP_SECONDS = 11.0
CLICK_DRAG_TOLERANCE = 0.012

#: Keeps the running shell alive for as long as the window is open.
_SHELL = None

HELP_TEXT = (
    "Obracanie: przeciągnij lewym przyciskiem myszy albo użyj strzałek "
    "(lub klawiszy W, S, A, D).\n"
    "Przybliżanie: kółko myszy albo klawisze Q i E.\n"
    "Przesuwanie: przeciągnij prawym przyciskiem myszy.\n"
    "R — wracasz do widoku początkowego.\n\n"
    "Spacja lub przycisk „Dalej” — następny przystanek.\n"
    "Backspace lub „Wstecz” — poprzedni przystanek.\n"
    "P — samo odtwarzanie kolejnych przystanków.\n\n"
    "Kliknij dowolny obiekt w scenie, żeby dowiedzieć się, czym jest.\n"
    "H — chowa i pokazuje tę pomoc. Esc — powrót do menu."
)


def _is_ui_entity(entity) -> bool:
    """True when the entity belongs to the 2D overlay rather than the scene."""
    from ursina import camera

    node = entity
    for _ in range(24):  # guard against a broken parent chain
        if node is None:
            return False
        if node is camera.ui:
            return True
        node = getattr(node, "parent", None)
    return False


def _create_shell_class():
    """Build the shell class lazily so importing this module needs no window."""
    from ursina import Entity, application, destroy, mouse, scene

    from netviz3d.ui.camera_rig import CameraRig
    from netviz3d.ui.hud import Hud
    from netviz3d.ui.menu import MenuScreen
    from netviz3d.ui.widgets import to_color

    class AppShell(Entity):
        """Single long-lived entity that drives menu and visualizations."""

        def __init__(self):
            super().__init__(name="netviz3d_shell")

            self.rig = CameraRig()
            self.hud = Hud(self._hud_callbacks())
            self.hud.set_help_text(HELP_TEXT)
            self.hud.set_visible(False)

            self.metas = registry.discover()
            self.menu = MenuScreen(self.metas, self.start_visualization, self.quit)

            self.root: Entity | None = None
            self.visualization = None
            self.storyline: Storyline | None = None
            self.quiz: QuizSession | None = None
            self.mode = "menu"

            self.pickables: dict[int, PickInfo] = {}
            self.pickables_by_id: dict[str, PickInfo] = {}
            self._flash_restore: list[tuple] = []
            self.auto_play = False
            self.auto_timer = 0.0
            self._last_tick = perf_counter()

        # -- wiring -------------------------------------------------------

        def _hud_callbacks(self) -> dict:
            return {
                "menu": self.back_to_menu,
                "help": self.toggle_help,
                "prev": self.previous_step,
                "next": self.next_step,
                "auto": self.toggle_auto_play,
                "quiz": self.start_quiz,
                "skip": self.skip_question,
                "quiz_exit": self.stop_quiz,
                "quiz_restart": self.restart_quiz,
                "yaw_left": lambda: self.rig.nudge_yaw(-1),
                "yaw_right": lambda: self.rig.nudge_yaw(1),
                "pitch_up": lambda: self.rig.nudge_pitch(1),
                "pitch_down": lambda: self.rig.nudge_pitch(-1),
                "zoom_in": lambda: self.rig.step_zoom(-1),
                "zoom_out": lambda: self.rig.step_zoom(1),
                "reset_view": self.rig.reset,
            }

        # -- running a visualization --------------------------------------

        def start_visualization(self, meta: VisualizationMeta) -> None:
            self.close_visualization()

            scene_class = registry.load_scene_class(meta)
            self.root = Entity(name=f"viz_{meta.id}", parent=scene)
            context = SceneContext(
                root=self.root,
                camera=self.rig,
                hud=self.hud,
                register_pickable=self.register_pickable,
                position_of=self.position_of,
                back_to_menu=self.back_to_menu,
            )
            self.visualization = scene_class(context, meta)
            self.visualization.build()

            steps = list(self.visualization.steps())
            self.storyline = Storyline(steps) if steps else None
            questions = list(self.visualization.questions())
            self.quiz = QuizSession(questions) if questions else None

            self.menu.set_visible(False)
            self.hud.set_visible(True)
            self.hud.set_mode("story")
            self.hud.set_title(meta.title, meta.subtitle)
            self.hud.set_quiz_available(self.quiz is not None)
            extra = list(self.visualization.help_lines())
            self.hud.set_help_text(
                HELP_TEXT + ("\n\n" + "\n".join(extra) if extra else "")
            )

            self.mode = "story"
            self.auto_play = False
            self.auto_timer = 0.0
            self.visualization.on_enter()
            if self.storyline:
                self._apply_step()
            else:
                self.hud.show_step(meta.title, meta.description)
                self.hud.set_nav_state(False, False, False)
                self.hud.set_progress("")

        def close_visualization(self) -> None:
            if self.visualization is not None:
                self.visualization.on_exit()
            self.visualization = None
            self.storyline = None
            self.quiz = None
            self.pickables.clear()
            self.pickables_by_id.clear()
            self._flash_restore.clear()
            if self.root is not None:
                destroy(self.root)
                self.root = None

        def back_to_menu(self) -> None:
            self.close_visualization()
            self.mode = "menu"
            self.auto_play = False
            self.hud.set_visible(False)
            self.menu.set_visible(True)
            self.rig.set_home(target=(0, 0, 0), yaw=25, pitch=24, distance=45)

        def quit(self) -> None:
            application.quit()

        # -- services offered to the visualization ------------------------

        def register_pickable(
            self, entity, object_id: str, title: str, description: str = ""
        ) -> PickInfo:
            """Make an entity clickable and describable.

            The entity gets a box collider if it has none, so a visualization
            can simply hand over the model it already built.
            """
            if getattr(entity, "collider", None) is None:
                entity.collider = "box"
            info = PickInfo(object_id, title, description, entity)
            self.pickables[id(entity)] = info
            self.pickables_by_id[object_id] = info
            return info

        def position_of(self, object_id: str):
            info = self.pickables_by_id.get(object_id)
            if info is None or info.entity is None:
                return None
            return info.entity.world_position

        # -- guided tour ---------------------------------------------------

        def _apply_step(self) -> None:
            if not self.storyline:
                return
            step = self.storyline.current
            self.hud.show_step(step.title, step.text)
            self.hud.set_progress(self.storyline.progress_text())
            self.hud.set_nav_state(
                not self.storyline.is_first, not self.storyline.is_last, self.auto_play
            )
            if step.focus:
                position = self.position_of(step.focus)
                if position is not None:
                    self.rig.glide_to(position)
            if self.visualization is not None:
                self.visualization.on_step(step, self.storyline.index)

        def next_step(self) -> None:
            if not self.storyline or self.storyline.is_last:
                self.auto_play = False
                if self.storyline:
                    self.hud.set_nav_state(not self.storyline.is_first, False, False)
                return
            self.storyline.next()
            self.auto_timer = 0.0
            self._apply_step()

        def previous_step(self) -> None:
            if not self.storyline or self.storyline.is_first:
                return
            self.storyline.previous()
            self.auto_timer = 0.0
            self._apply_step()

        def toggle_auto_play(self) -> None:
            if not self.storyline or self.mode != "story":
                return
            self.auto_play = not self.auto_play
            self.auto_timer = 0.0
            if self.auto_play and self.storyline.is_last:
                self.storyline.restart()
                self._apply_step()
            self.hud.set_nav_state(
                not self.storyline.is_first, not self.storyline.is_last, self.auto_play
            )

        # -- quiz -----------------------------------------------------------

        def start_quiz(self) -> None:
            if self.quiz is None:
                return
            self.auto_play = False
            self.mode = "quiz"
            self.quiz.restart()
            self.hud.hide_info()
            self.hud.set_mode("quiz")
            self._show_question()
            if self.visualization is not None:
                self.visualization.on_quiz_start()

        def stop_quiz(self) -> None:
            if self.mode != "quiz":
                return
            self.mode = "story"
            self.hud.set_mode("story")
            if self.storyline:
                self._apply_step()
            if self.visualization is not None:
                self.visualization.on_quiz_end()

        def restart_quiz(self) -> None:
            if self.quiz is None:
                return
            self.quiz.restart()
            self._show_question()

        def skip_question(self) -> None:
            if self.quiz is None or self.mode != "quiz":
                return
            result = self.quiz.skip()
            self._reveal_target()
            self._after_answer(result)

        def _show_question(self) -> None:
            question = self.quiz.current if self.quiz else None
            if question is None:
                self.hud.show_quiz_summary(self.quiz.summary() if self.quiz else "")
                return
            self.hud.show_quiz_question(question.prompt, self.quiz.progress_text())
            self.hud.show_quiz_feedback(self.quiz.score_text())

        def _reveal_target(self) -> None:
            """Blink the object that was the right answer."""
            question = self.quiz.current if self.quiz else None
            if question is None:
                return
            info = self.pickables_by_id.get(question.target)
            if info is not None and info.entity is not None:
                self._flash(info.entity, theme.GOOD, duration=1.4)

        def _after_answer(self, result) -> None:
            self.hud.show_quiz_feedback(
                f"{result.message}  ({self.quiz.score_text()})",
                good=True if result.correct else (False if result.revealed else None),
            )
            if result.finished:
                self.hud.show_quiz_summary(self.quiz.summary())
            elif result.correct or result.revealed:
                question = self.quiz.current
                if question is not None:
                    self.hud.show_quiz_question(question.prompt, self.quiz.progress_text())

        def _answer_with(self, object_id: str) -> None:
            if self.quiz is None or self.quiz.current is None:
                return
            expected = self.quiz.current.target
            result = self.quiz.answer(object_id)
            info = self.pickables_by_id.get(object_id)
            if info is not None and info.entity is not None:
                self._flash(info.entity, theme.GOOD if result.correct else theme.BAD)
            if result.revealed and not result.correct:
                target = self.pickables_by_id.get(expected)
                if target is not None and target.entity is not None:
                    self._flash(target.entity, theme.GOOD, duration=1.4)
            self._after_answer(result)

        # -- clicking --------------------------------------------------------

        def _flash(self, entity, hex_color: str, duration: float = 0.7) -> None:
            """Tint an entity for a moment, then put its colour back."""
            from ursina import invoke

            original = entity.color
            entity.color = to_color(hex_color)

            def restore(entity=entity, original=original):
                if entity is not None:
                    entity.color = original

            invoke(restore, delay=duration)

        def _lookup_pickable(self, entity) -> PickInfo | None:
            node = entity
            for _ in range(8):
                if node is None:
                    return None
                info = self.pickables.get(id(node))
                if info is not None:
                    return info
                node = getattr(node, "parent", None)
            return None

        def handle_scene_click(self) -> None:
            entity = mouse.hovered_entity
            if entity is None or _is_ui_entity(entity):
                return
            info = self._lookup_pickable(entity)
            if info is None:
                return
            if self.mode == "quiz" and self.quiz is not None and self.quiz.current:
                self._answer_with(info.object_id)
            else:
                # Po skończonym quizie klikanie znowu tylko opowiada o obiekcie.
                self.hud.show_info(info.title, info.description)
            if self.visualization is not None:
                self.visualization.on_pick(info.object_id)

        # -- Ursina hooks -----------------------------------------------------

        def toggle_help(self) -> None:
            if self.mode == "menu":
                return
            self.hud.toggle_help()

        def input(self, key):  # noqa: A003 - name required by Ursina
            if key == "escape":
                if self.mode != "menu" and self.hud.help_visible:
                    self.hud.set_help_visible(False)
                elif self.mode != "menu" and self.hud.info_visible:
                    self.hud.hide_info()
                elif self.mode == "quiz":
                    self.stop_quiz()
                elif self.mode != "menu":
                    self.back_to_menu()
                else:
                    self.quit()
                return

            if key == "left mouse down":
                hovered = mouse.hovered_entity
                if hovered is None or not _is_ui_entity(hovered):
                    self.rig.begin_drag()
                return

            if key == "left mouse up":
                travelled = self.rig.end_drag()
                if travelled < CLICK_DRAG_TOLERANCE and self.mode != "menu":
                    self.handle_scene_click()
                return

            if self.mode == "menu":
                return

            if key == "h":
                self.toggle_help()
                return
            if self.hud.help_visible:
                return
            if key in ("space", "enter"):
                self.next_step()
                return
            if key == "backspace":
                self.previous_step()
                return
            if key == "p":
                self.toggle_auto_play()
                return

            self.rig.handle_input(key)

        def update(self):  # noqa: D401 - Ursina calls this every frame
            now = perf_counter()
            # Clamped so a hiccup (or a dragged window) cannot teleport
            # the camera or skip half of the packet's route.
            dt = min(0.1, max(0.0, now - self._last_tick))
            self._last_tick = now
            if self.mode == "menu":
                return

            self.rig.update(dt)

            if self.auto_play and self.storyline and self.mode == "story":
                self.auto_timer += dt
                if self.auto_timer >= AUTO_STEP_SECONDS:
                    self.auto_timer = 0.0
                    if self.storyline.is_last:
                        self.auto_play = False
                        self.hud.set_nav_state(True, False, False)
                    else:
                        self.next_step()

            if self.visualization is not None:
                self.visualization.update(dt)

    return AppShell


def run() -> int:
    """Create the window and start the main loop."""
    try:
        from ursina import Text, Ursina, window
    except ImportError:
        print(
            "Nie znaleziono biblioteki Ursina.\n"
            "Zainstaluj ją poleceniem:  pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 1

    app = Ursina()

    font_path = theme.find_font()
    if font_path:
        Text.default_font = font_path
    else:
        print(theme.font_warning())
    try:  # sharper text on big screens; harmless if unsupported
        Text.default_resolution = 1080 * Text.size
    except Exception:  # pragma: no cover - depends on Ursina version
        pass

    window.title = WINDOW_TITLE
    window.borderless = False
    window.fullscreen = False
    window.exit_button.visible = False
    window.fps_counter.enabled = False
    window.color = _background_color()

    global _SHELL
    _SHELL = _create_shell_class()()
    app.run()
    return 0


def _background_color():
    from netviz3d.ui.widgets import to_color

    return to_color(theme.BACKGROUND)
