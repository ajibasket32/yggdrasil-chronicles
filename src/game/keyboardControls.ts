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
  codex: "Help / Codex",
  map: "World Map"
};

/** True when the browser itself acts on this key, so the game must not claim it. */
export function isReservedKeyCode(code: string): boolean {
  return RESERVED_KEY_CODES.includes(code);
}

export function keyboardActionForCode(
  code: string,
  bindings: Readonly<KeyboardBindings>
): KeyboardAction | undefined {
  return REBINDABLE_ACTIONS.find((action) => bindings[action].includes(code));
}

/** Every code bound to an action, for display: "↑ / W". */
export function keyboardBindingLabel(codes: readonly string[]): string {
  return codes.length > 0 ? codes.map(keyboardCodeLabel).join(" / ") : "unbound";
}

export function keyboardActionLabel(action: KeyboardAction): string {
  return ACTION_LABELS[action];
}

/** What this keyboard actually prints on each key, where the browser will say. */
let layoutLabels: ReadonlyMap<string, string> | undefined;

/**
 * Asks the browser which characters this keyboard prints.
 *
 * A `KeyboardEvent.code` names a physical position on a US layout, so deriving
 * the label from it told an AZERTY player to press "W" for the key their
 * keyboard prints as "Z", and misdirected a Dvorak player on nearly every
 * letter. Resolved once at startup; where the API is absent or refused, the
 * code-derived label below stands, which is the best guess available.
 */
export async function loadKeyboardLayoutLabels(
  navigatorRef: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator
): Promise<void> {
  const keyboard = (navigatorRef as {
    keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> };
  } | undefined)?.keyboard;
  if (!keyboard?.getLayoutMap) return;
  try {
    layoutLabels = await keyboard.getLayoutMap();
  } catch {
    // Unsupported or refused; the positional label remains.
  }
}

export function keyboardCodeLabel(code: string): string {
  const printed = layoutLabels?.get(code);
  if (printed !== undefined && printed.length > 0 && printed.length <= 2) {
    return printed.toUpperCase();
  }
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
  const next = { ...bindings } as Record<KeyboardAction, readonly string[]>;
  const previousCodes = next[action];
  const conflict = keyboardActionForCode(code, bindings);
  // An explicit choice replaces the whole list: a player who binds "up" to K
  // means K, not K plus the arrow and W they never asked for.
  next[action] = [code];
  if (conflict && conflict !== action) {
    // Give the displaced action whatever it lost, so nothing becomes unreachable.
    const remaining = next[conflict].filter((existing) => existing !== code);
    next[conflict] = remaining.length > 0 ? remaining : previousCodes;
  }
  return next;
}
