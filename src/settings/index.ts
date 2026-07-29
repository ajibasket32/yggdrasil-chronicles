import { createGameSettingsStore } from "./runtime";

export * from "./runtime";
export * from "./types";

/** Shared browser preference store used by bootstrap and every Phaser scene. */
export const gameSettingsStore = createGameSettingsStore();
