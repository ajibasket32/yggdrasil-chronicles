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
