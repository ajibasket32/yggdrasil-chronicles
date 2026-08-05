import { describe, expect, it } from "vitest";
import { npcs, startingBuildLoadouts } from "../../src/content/campaign";
import { knownPortraitTags, portraitAppearance } from "../../src/content/portraits";
import { scenes } from "../../src/content/scenes";

/** Texture keys BootScene loads. A portrait pointing anywhere else draws nothing. */
const LOADED_SHEETS = new Set([
  "sprite.job.vanguard",
  "sprite.job.ranger",
  "sprite.job.mender",
  "sprite.job.shaper",
  "sprite.job.trickster",
  "sprite.job.warden",
  "sprite.enemy.small",
  "sprite.enemy.humanoid",
  "sprite.enemy.boss"
]);

describe("speaker portraits", () => {
  it("gives every authored NPC a face", () => {
    const missing = npcs.filter((npc) => portraitAppearance(npc.assetTag) === undefined);
    expect(missing.map(({ id }) => id)).toEqual([]);
  });

  it("gives every portrait a sheet the game actually loads", () => {
    for (const tag of knownPortraitTags()) {
      const appearance = portraitAppearance(tag);
      expect(appearance, tag).toBeDefined();
      expect(LOADED_SHEETS.has(appearance!.spriteKey), `${tag} -> ${appearance!.spriteKey}`).toBe(true);
      // 24x8 grids of 32px frames on the character sheets.
      expect(appearance!.frame).toBeGreaterThanOrEqual(0);
      expect(appearance!.frame).toBeLessThan(192);
    }
  });

  it("keeps speakers visually distinct rather than reusing one look", () => {
    const looks = knownPortraitTags().map((tag) => {
      const appearance = portraitAppearance(tag)!;
      return `${appearance.spriteKey}:${appearance.frame}:${appearance.tint}`;
    });
    expect(new Set(looks).size).toBe(looks.length);
  });

  it("resolves every portrait a scripted scene names", () => {
    const named = scenes.flatMap((scene) => scene.lines.map((line) => line.portraitTag)).filter(Boolean);
    expect(named.length).toBeGreaterThan(0);
    for (const tag of named) expect(portraitAppearance(tag), tag).toBeDefined();
  });

  it("returns nothing for an absent tag rather than a default face", () => {
    expect(portraitAppearance(undefined)).toBeUndefined();
    expect(portraitAppearance("portrait.nobody")).toBeUndefined();
  });
});

describe("authored build affinities", () => {
  it("gives every starting build the elemental identity the docs claim", () => {
    for (const loadout of startingBuildLoadouts) {
      const entries = Object.entries(loadout.elementalAffinities);
      expect(entries.length, loadout.id).toBeGreaterThan(0);
      for (const [element, value] of entries) {
        expect(Math.abs(value), `${loadout.id} ${element}`).toBeLessThanOrEqual(1);
        expect(value, `${loadout.id} ${element}`).not.toBe(0);
      }
    }
  });

  it("varies affinities by ancestry rather than giving everyone the same set", () => {
    const byAncestry = new Map<string, string>();
    for (const loadout of startingBuildLoadouts) {
      byAncestry.set(loadout.ancestryId, JSON.stringify(loadout.elementalAffinities));
    }
    expect(new Set(byAncestry.values()).size).toBe(byAncestry.size);
  });
});
