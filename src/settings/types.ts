/**
 * Bumped to v2 when bindings became lists. The sanitizer resets on an unknown
 * version, so a v1 record is discarded rather than misread as a list of
 * one-character codes.
 */
export const SETTINGS_STORAGE_KEY = "yggdrasil-chronicles.settings.v2";

export const REBINDABLE_ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "confirm",
  "cancel",
  "interact",
  "journal",
  "inventory",
  "party",
  "encounter",
  "quickSave",
  "quickLoad",
  "codex",
  "map"
] as const;

export type KeyboardAction = (typeof REBINDABLE_ACTIONS)[number];
/**
 * One or more key codes per action. Movement ships with both the arrow keys and
 * WASD because WASD is the first thing most players try and the docs have
 * always said it works; a single-code map could not honour both. Rebinding an
 * action replaces its whole list, so an explicit choice always wins.
 */
export type KeyboardBindings = Record<KeyboardAction, readonly string[]>;

export const DEFAULT_KEYBOARD_BINDINGS: Readonly<KeyboardBindings> = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  confirm: ["Enter", "Space"],
  cancel: ["Escape"],
  interact: ["KeyE"],
  journal: ["KeyJ"],
  inventory: ["KeyI"],
  party: ["KeyP"],
  encounter: ["KeyB"],
  // Deliberately not F5. The browser's reload key must never be bound to a
  // destructive write: pressing it navigated away mid-IndexedDB-write, losing
  // the session the player was trying to protect.
  quickSave: ["F9"],
  quickLoad: ["F8"],
  codex: ["KeyH"],
  map: ["KeyM"]
};

/**
 * Keys the browser owns. Binding one means the browser acts on it too, so a
 * game action bound here fires alongside a reload, a devtools panel, or a
 * fullscreen toggle. Persisted bindings using these are healed back to default.
 */
export const RESERVED_KEY_CODES: readonly string[] = [
  "F1", "F3", "F5", "F6", "F7", "F10", "F11", "F12", "Tab"
];

/**
 * Interface text scale. The smallest text in the game is 9px HP/MP readouts,
 * which is below what a lot of people can read on a 960px canvas; `large`
 * exists so that is a preference rather than a barrier.
 */
export const TEXT_SIZES = ["small", "medium", "large"] as const;
export type TextSize = typeof TEXT_SIZES[number];

/** Steps to the next text size, wrapping. Both settings surfaces cycle rather than toggle. */
export function nextTextSize(current: TextSize): TextSize {
  const index = TEXT_SIZES.indexOf(current);
  return TEXT_SIZES[(index + 1) % TEXT_SIZES.length] ?? "medium";
}

export interface GameSettings {
  version: 1;
  highContrast: boolean;
  textSize: TextSize;
  reducedMotion: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  /** Background music, separately from effects: many players keep one and not the other. */
  musicEnabled: boolean;
  musicVolume: number;
  keyBindings: KeyboardBindings;
}

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = {
  version: 1,
  highContrast: false,
  textSize: "medium",
  reducedMotion: false,
  soundEnabled: true,
  soundVolume: 0.65,
  musicEnabled: true,
  musicVolume: 0.5,
  keyBindings: { ...DEFAULT_KEYBOARD_BINDINGS }
};

export type GameSettingsPatch = Partial<Omit<GameSettings, "version" | "keyBindings">> & {
  keyBindings?: Partial<KeyboardBindings>;
};
