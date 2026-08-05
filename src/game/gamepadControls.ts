/**
 * Standard Gamepad button mapping shared by the Phaser scenes.  Keeping this
 * small and data-only makes the browser controls easy to verify without the
 * rendering runtime.
 */
export type GamepadAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "cancel"
  | "journal"
  | "party"
  | "inventory"
  | "system";

const BUTTON_ACTIONS: Readonly<Record<number, GamepadAction>> = {
  0: "confirm", // A / Cross
  1: "cancel", // B / Circle
  2: "journal", // X / Square
  3: "party", // Y / Triangle
  4: "inventory", // left bumper
  8: "system", // Back / Select
  9: "system", // Start / Menu
  12: "up",
  13: "down",
  14: "left",
  15: "right"
};

export function gamepadButtonAction(buttonIndex: number): GamepadAction | undefined {
  return BUTTON_ACTIONS[buttonIndex];
}

/** Mutable repeat state one scene keeps per pad; timestamps in ms. */
export interface StickRepeatState {
  lastDirection?: "up" | "down" | "left" | "right";
  nextAt: number;
}

const STICK_THRESHOLD = 0.5;
/** First movement fires immediately; holding repeats at a readable cadence. */
const STICK_REPEAT_MS = 220;

/**
 * Polls the left analog stick, which button events never report. Returns a
 * direction when the stick is pushed past the threshold and the repeat window
 * has elapsed, so holding the stick walks rather than teleporting.
 */
export function pollStickDirection(
  pad: { axes: Array<{ getValue(): number }> } | undefined,
  state: StickRepeatState,
  now: number
): "up" | "down" | "left" | "right" | undefined {
  const horizontal = pad?.axes[0]?.getValue() ?? 0;
  const vertical = pad?.axes[1]?.getValue() ?? 0;
  let direction: "up" | "down" | "left" | "right" | undefined;
  if (Math.abs(horizontal) >= Math.abs(vertical)) {
    if (horizontal <= -STICK_THRESHOLD) direction = "left";
    else if (horizontal >= STICK_THRESHOLD) direction = "right";
  } else if (vertical <= -STICK_THRESHOLD) direction = "up";
  else if (vertical >= STICK_THRESHOLD) direction = "down";

  if (!direction) {
    state.lastDirection = undefined;
    state.nextAt = 0;
    return undefined;
  }
  if (direction === state.lastDirection && now < state.nextAt) return undefined;
  state.lastDirection = direction;
  state.nextAt = now + STICK_REPEAT_MS;
  return direction;
}
