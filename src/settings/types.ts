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
  "quickSave"
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
  quickSave: "F5"
};

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
