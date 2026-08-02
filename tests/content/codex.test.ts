import { describe, expect, it } from "vitest";
import { codexEntryCount, codexSections } from "../../src/content";
import { DEFAULT_KEYBOARD_BINDINGS, REBINDABLE_ACTIONS, RESERVED_KEY_CODES } from "../../src/settings";
import { keyboardActionLabel } from "../../src/game/keyboardControls";

describe("the codex explains the game", () => {
  it("authors sections and entries with real prose", () => {
    expect(codexSections.length).toBeGreaterThanOrEqual(4);
    expect(codexEntryCount).toBeGreaterThanOrEqual(12);
    for (const section of codexSections) {
      expect(section.title.length, section.id).toBeGreaterThan(0);
      expect(section.entries.length, section.id).toBeGreaterThan(0);
      for (const entry of section.entries) {
        expect(entry.title.length, entry.id).toBeGreaterThan(0);
        // Long enough to be an explanation rather than a label.
        expect(entry.body.length, entry.id).toBeGreaterThan(60);
      }
    }
  });

  it("uses unique ids throughout", () => {
    const sectionIds = codexSections.map(({ id }) => id);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    const entryIds = codexSections.flatMap(({ entries }) => entries.map(({ id }) => id));
    expect(new Set(entryIds).size).toBe(entryIds.length);
  });

  it("covers the systems a player cannot otherwise discover", () => {
    const text = codexSections
      .flatMap(({ entries }) => entries.map(({ title, body }) => `${title} ${body}`))
      .join(" ")
      .toLowerCase();
    // Each of these is a rule the game implements and never stated anywhere.
    for (const topic of ["guard", "escape", "element", "focus", "reserve", "level"]) {
      expect(text, `codex explains ${topic}`).toContain(topic);
    }
  });

  it("describes the status vocabulary the battle screen shows", () => {
    const text = codexSections
      .flatMap(({ entries }) => entries.map(({ body }) => body))
      .join(" ")
      .toLowerCase();
    for (const status of ["poison", "burn", "bleed", "stun", "sleep", "freeze", "haste", "slow"]) {
      expect(text, `codex explains ${status}`).toContain(status);
    }
  });
});

describe("the codex is reachable", () => {
  it("has its own rebindable action with a browser-safe default", () => {
    expect(REBINDABLE_ACTIONS).toContain("codex");
    const code = DEFAULT_KEYBOARD_BINDINGS.codex;
    expect(code.length).toBeGreaterThan(0);
    expect(RESERVED_KEY_CODES).not.toContain(code);
  });

  it("names the action for the rebinding screen", () => {
    expect(keyboardActionLabel("codex").length).toBeGreaterThan(0);
  });
});
