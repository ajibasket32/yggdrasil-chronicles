export const SETTINGS_STORAGE_KEY = "yggdrasil-chronicles.settings.v1";

export interface GameSettings {
  version: 1;
  highContrast: boolean;
  reducedMotion: boolean;
  soundEnabled: boolean;
  soundVolume: number;
}

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = {
  version: 1,
  highContrast: false,
  reducedMotion: false,
  soundEnabled: true,
  soundVolume: 0.65
};

export type GameSettingsPatch = Partial<Omit<GameSettings, "version">>;
