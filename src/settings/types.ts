export const SETTINGS_STORAGE_KEY = "yggdrasil-chronicles.settings.v1";

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
  "quickLoad"
] as const;

export type KeyboardAction = (typeof REBINDABLE_ACTIONS)[number];
export type KeyboardBindings = Record<KeyboardAction, string>;

export const DEFAULT_KEYBOARD_BINDINGS: Readonly<KeyboardBindings> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  confirm: "Enter",
  cancel: "Escape",
  interact: "KeyE",
  journal: "KeyJ",
  inventory: "KeyI",
  party: "KeyP",
  encounter: "KeyB",
  // Deliberately not F5. The browser's reload key must never be bound to a
  // destructive write: pressing it navigated away mid-IndexedDB-write, losing
  // the session the player was trying to protect.
  quickSave: "F9",
  quickLoad: "F8"
};

/**
 * Keys the browser owns. Binding one means the browser acts on it too, so a
 * game action bound here fires alongside a reload, a devtools panel, or a
 * fullscreen toggle. Persisted bindings using these are healed back to default.
 */
export const RESERVED_KEY_CODES: readonly string[] = [
  "F1", "F3", "F5", "F6", "F7", "F10", "F11", "F12", "Tab"
];

export interface GameSettings {
  version: 1;
  highContrast: boolean;
  reducedMotion: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  keyBindings: KeyboardBindings;
}

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = {
  version: 1,
  highContrast: false,
  reducedMotion: false,
  soundEnabled: true,
  soundVolume: 0.65,
  keyBindings: { ...DEFAULT_KEYBOARD_BINDINGS }
};

export type GameSettingsPatch = Partial<Omit<GameSettings, "version" | "keyBindings">> & {
  keyBindings?: Partial<KeyboardBindings>;
};
