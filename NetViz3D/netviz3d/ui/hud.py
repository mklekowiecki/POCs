"""On-screen interface of the shell: title bar, story bar, info card, help.

The HUD knows nothing about networks or computers - it only shows the texts
the running visualization hands over.
"""

from __future__ import annotations

from typing import Callable

from ursina import Entity, camera, destroy

from netviz3d import theme
from netviz3d.ui.widgets import UIButton, label, panel, to_color

BUTTON_SIZE = (0.215, 0.058)
SMALL_BUTTON = (0.062, 0.052)


class Hud:
    """All 2D overlays of a running visualization."""

    def __init__(self, callbacks: dict[str, Callable[[], None]]):
        self.callbacks = callbacks
        self.mode = "story"
        self._widgets: list = []
        self._buttons: list[UIButton] = []

        self._build_top_bar()
        self._build_story_bar()
        self._build_quiz_bar()
        self._build_camera_controls()
        self._build_info_card()
        self._build_help_overlay()

        self.set_mode("story")
        self.hide_info()

    # -- construction -----------------------------------------------------

    def _track(self, *widgets):
        for widget in widgets:
            if isinstance(widget, UIButton):
                self._buttons.append(widget)
            else:
                self._widgets.append(widget)
        return widgets[0] if len(widgets) == 1 else widgets

    def _button(self, *args, **kwargs) -> UIButton:
        button = UIButton(*args, **kwargs)
        self._buttons.append(button)
        return button

    def _build_top_bar(self) -> None:
        self._track(panel((0, 0.455), (1.79, 0.085), theme.INK, 0.86))
        self.title_label = self._track(
            label("", (-0.865, 0.472), 1.25, theme.PAPER, origin=(-0.5, 0))
        )
        self.subtitle_label = self._track(
            label("", (-0.865, 0.434), theme.TEXT_SCALE_SMALL, theme.GLASS, origin=(-0.5, 0))
        )
        self.progress_label = self._track(
            label("", (0.30, 0.455), theme.TEXT_SCALE_SMALL, theme.PAPER, origin=(0.5, 0))
        )
        self.help_button = self._button(
            "Pomoc (H)",
            self.callbacks.get("help", lambda: None),
            position=(0.545, 0.455),
            scale=(0.2, 0.058),
            hex_color=theme.DEVICE_DARK,
        )
        self.menu_button = self._button(
            "Menu (Esc)",
            self.callbacks.get("menu", lambda: None),
            position=(0.765, 0.455),
            scale=(0.2, 0.058),
            hex_color=theme.ACCENT_DARK,
        )

    def _build_story_bar(self) -> None:
        self.story_panel = self._track(panel((0, -0.395), (1.79, 0.2), theme.PAPER, 0.94))
        self.step_title = self._track(
            label("", (-0.865, -0.318), 1.25, theme.INK, origin=(-0.5, 0))
        )
        self.step_text = self._track(
            label("", (-0.865, -0.358), 1.05, theme.INK_SOFT, origin=(-0.5, 0.5), wordwrap=76)
        )
        self.prev_button = self._button(
            "< Wstecz",
            self.callbacks.get("prev", lambda: None),
            position=(0.44, -0.338),
            scale=BUTTON_SIZE,
            hex_color=theme.INK_SOFT,
        )
        self.next_button = self._button(
            "Dalej >",
            self.callbacks.get("next", lambda: None),
            position=(0.685, -0.338),
            scale=BUTTON_SIZE,
            hex_color=theme.DEVICE,
        )
        self.auto_button = self._button(
            "Odtwarzaj (P)",
            self.callbacks.get("auto", lambda: None),
            position=(0.44, -0.445),
            scale=BUTTON_SIZE,
            hex_color=theme.INK_SOFT,
        )
        self.quiz_button = self._button(
            "Zagraj w quiz",
            self.callbacks.get("quiz", lambda: None),
            position=(0.685, -0.445),
            scale=BUTTON_SIZE,
            hex_color=theme.GOOD,
        )
        self._story_widgets = [
            self.step_title,
            self.step_text,
            self.prev_button,
            self.next_button,
            self.auto_button,
            self.quiz_button,
        ]

    def _build_quiz_bar(self) -> None:
        self.quiz_prompt = self._track(
            label("", (-0.865, -0.318), 1.2, theme.INK, origin=(-0.5, 0), wordwrap=62)
        )
        self.quiz_feedback = self._track(
            label("", (-0.865, -0.402), 1.0, theme.INK_SOFT, origin=(-0.5, 0.5), wordwrap=74)
        )
        self.quiz_skip_button = self._button(
            "Nie wiem",
            self.callbacks.get("skip", lambda: None),
            position=(0.44, -0.338),
            scale=BUTTON_SIZE,
            hex_color=theme.INK_SOFT,
        )
        self.quiz_exit_button = self._button(
            "Koniec quizu",
            self.callbacks.get("quiz_exit", lambda: None),
            position=(0.685, -0.338),
            scale=BUTTON_SIZE,
            hex_color=theme.ACCENT_DARK,
        )
        self.quiz_again_button = self._button(
            "Jeszcze raz",
            self.callbacks.get("quiz_restart", lambda: None),
            position=(0.685, -0.445),
            scale=BUTTON_SIZE,
            hex_color=theme.GOOD,
        )
        self._quiz_widgets = [
            self.quiz_prompt,
            self.quiz_feedback,
            self.quiz_skip_button,
            self.quiz_exit_button,
            self.quiz_again_button,
        ]

    def _build_camera_controls(self) -> None:
        camera_callbacks = (
            ("<", "yaw_left"),
            (">", "yaw_right"),
            ("^", "pitch_up"),
            ("v", "pitch_down"),
            ("+", "zoom_in"),
            ("-", "zoom_out"),
        )
        start_x = -0.855
        self.camera_buttons = []
        for index, (caption, key) in enumerate(camera_callbacks):
            self.camera_buttons.append(
                self._button(
                    caption,
                    self.callbacks.get(key, lambda: None),
                    position=(start_x + index * 0.068, -0.225),
                    scale=SMALL_BUTTON,
                    hex_color=theme.DEVICE_DARK,
                    text_scale=1.0,
                )
            )
        self.camera_buttons.append(
            self._button(
                "Widok od nowa (R)",
                self.callbacks.get("reset_view", lambda: None),
                position=(-0.70, -0.285),
                scale=(0.31, 0.052),
                hex_color=theme.INK_SOFT,
                text_scale=0.8,
            )
        )

    def _build_info_card(self) -> None:
        self.info_panel = panel((0.60, 0.115), (0.52, 0.5), theme.PAPER, 0.96)
        self.info_title = label(
            "", (0.365, 0.33), 1.15, theme.INK, origin=(-0.5, 0), wordwrap=24
        )
        self.info_text = label(
            "", (0.365, 0.275), 0.95, theme.INK_SOFT, origin=(-0.5, 0.5), wordwrap=33
        )
        self.info_close = UIButton(
            "Zamknij",
            self.hide_info,
            position=(0.60, -0.10),
            scale=(0.2, 0.052),
            hex_color=theme.INK_SOFT,
            text_scale=0.8,
        )
        self._info_widgets = [self.info_panel, self.info_title, self.info_text]
        self._widgets.extend([self.info_panel, self.info_title, self.info_text])
        self._buttons.append(self.info_close)

    def _build_help_overlay(self) -> None:
        self.help_shade = Entity(
            parent=camera.ui,
            model="quad",
            color=to_color(theme.INK, 0.82),
            scale=(2.0, 1.1),
            position=(0, 0, -0.5),
        )
        self.help_title = label(
            "Jak sterować?", (0, 0.36), 1.9, theme.PAPER, z=-0.52
        )
        self.help_text = label(
            "", (0, 0.28), 1.1, theme.PAPER, origin=(0, 0.5), wordwrap=68, z=-0.52
        )
        self.help_close = UIButton(
            "Zamknij pomoc",
            self.callbacks.get("help", lambda: None),
            position=(0, -0.42),
            scale=(0.34, 0.07),
            hex_color=theme.ACCENT,
            text_color=theme.INK,
        )
        self.help_close.background.z = -0.52
        self.help_close.caption.z = -0.53
        self._widgets.extend([self.help_shade, self.help_title, self.help_text])
        self._buttons.append(self.help_close)
        self.set_help_visible(False)

    # -- top bar ----------------------------------------------------------

    def set_title(self, title: str, subtitle: str = "") -> None:
        self.title_label.text = title
        self.subtitle_label.text = subtitle

    def set_progress(self, text: str) -> None:
        self.progress_label.text = text

    # -- story mode -------------------------------------------------------

    def show_step(self, title: str, text: str) -> None:
        self.step_title.text = title
        self.step_text.text = text

    def set_nav_state(self, can_prev: bool, can_next: bool, auto_on: bool) -> None:
        self.prev_button.enabled = can_prev
        self.next_button.enabled = can_next
        self.auto_button.text = "Zatrzymaj (P)" if auto_on else "Odtwarzaj (P)"
        self.auto_button.set_color(theme.ACCENT_DARK if auto_on else theme.INK_SOFT)

    def set_quiz_available(self, available: bool) -> None:
        self.quiz_button.visible = available

    # -- quiz mode --------------------------------------------------------

    def show_quiz_question(self, prompt: str, progress: str) -> None:
        self.quiz_prompt.text = prompt
        self.set_progress(progress)
        self.quiz_again_button.visible = False
        self.quiz_skip_button.visible = True

    def show_quiz_feedback(self, text: str, good: bool | None = None) -> None:
        self.quiz_feedback.text = text
        colour = theme.INK_SOFT if good is None else (theme.GOOD if good else theme.BAD)
        self.quiz_feedback.color = to_color(colour)

    def show_quiz_summary(self, text: str) -> None:
        self.quiz_prompt.text = "Koniec quizu!"
        self.quiz_feedback.text = text
        self.quiz_feedback.color = to_color(theme.INK)
        self.quiz_skip_button.visible = False
        self.quiz_again_button.visible = True

    @staticmethod
    def _set_group_visible(widgets, visible: bool) -> None:
        for widget in widgets:
            if isinstance(widget, UIButton):
                widget.visible = visible
            else:
                widget.enabled = visible

    def set_mode(self, mode: str) -> None:
        """Switch the bottom bar between the guided tour and the quiz."""
        self.mode = mode
        story = mode == "story"
        self._set_group_visible(self._story_widgets, story)
        self._set_group_visible(self._quiz_widgets, not story)
        if story:
            self.quiz_feedback.text = ""

    # -- info card --------------------------------------------------------

    def show_info(self, title: str, description: str) -> None:
        self.info_title.text = title
        self.info_text.text = description
        for widget in self._info_widgets:
            widget.enabled = True
        self.info_close.visible = True

    def hide_info(self) -> None:
        for widget in self._info_widgets:
            widget.enabled = False
        self.info_close.visible = False

    @property
    def info_visible(self) -> bool:
        return self.info_panel.enabled

    # -- help overlay -----------------------------------------------------

    def set_help_text(self, text: str) -> None:
        self.help_text.text = text

    def set_help_visible(self, visible: bool) -> None:
        self.help_shade.enabled = visible
        self.help_title.enabled = visible
        self.help_text.enabled = visible
        self.help_close.visible = visible

    @property
    def help_visible(self) -> bool:
        return self.help_shade.enabled

    def toggle_help(self) -> None:
        self.set_help_visible(not self.help_visible)

    # -- whole HUD --------------------------------------------------------

    def set_visible(self, visible: bool) -> None:
        """Hide the whole interface while the start menu is on screen."""
        for button in self._buttons:
            button.visible = visible
        for widget in self._widgets:
            widget.enabled = visible
        if visible:
            self.set_mode(self.mode)
            self.hide_info()
            self.set_help_visible(False)

    # -- teardown ---------------------------------------------------------

    def destroy(self) -> None:
        for button in self._buttons:
            button.destroy()
        for widget in self._widgets:
            destroy(widget)
        self._buttons.clear()
        self._widgets.clear()
