import {
  REBINDABLE_ACTIONS,
  RESERVED_KEY_CODES,
  type KeyboardAction,
  type KeyboardBindings
} from "../settings";

const ACTION_LABELS: Readonly<Record<KeyboardAction, string>> = {
  up: "Move / Menu Up",
  down: "Move / Menu Down",
  left: "Move / Menu Left",
  right: "Move / Menu Right",
  confirm: "Confirm",
  cancel: "Cancel / System Menu",
  interact: "Interact",
  journal: "Journal",
  inventory: "Inventory",
  party: "Party",
  encounter: "Quick Encounter",
  quickSave: "Quick Save",
  quickLoad: "Quick Load",
  codex: "Help / Codex"
};

/** True when the browser itself acts on this key, so the game must not claim it. */
export function isReservedKeyCode(code: string): boolean {
  return RESERVED_KEY_CODES.includes(code);
}

export function keyboardActionForCode(
  code: string,
  bindings: Readonly<KeyboardBindings>
): KeyboardAction | undefined {
  return REBINDABLE_ACTIONS.find((action) => bindings[action] === code);
}

export function keyboardActionLabel(action: KeyboardAction): string {
  return ACTION_LABELS[action];
}

export function keyboardCodeLabel(code: string): string {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code
    .replace("Arrow", "")
    .replace("Escape", "Esc")
    .replace("Space", "Spacebar");
}

/**
 * Rebinding swaps conflicts so every action remains reachable. Browser-owned
 * keys are refused outright — binding one means the browser still acts on it.
 */
export function rebindKeyboardAction(
  bindings: Readonly<KeyboardBindings>,
  action: KeyboardAction,
  code: string
): KeyboardBindings {
  if (isReservedKeyCode(code)) return { ...bindings };
  const next = { ...bindings };
  const previousCode = next[action];
  const conflict = keyboardActionForCode(code, bindings);
  next[action] = code;
  if (conflict && conflict !== action) next[conflict] = previousCode;
  return next;
}
