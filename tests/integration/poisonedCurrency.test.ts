import { describe, expect, it } from "vitest";
import { EngineGameBridge, readCurrency, readFlagCount } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";
import { gameStateSchema } from "../../src/save/schema";

/**
 * Marks live in `world.flags.currency`, and world flags are typed
 * `boolean | number | string` because generated story flags need all three.
 * Nothing downstream expects a string there — every reader is
 * `Number(flags.currency ?? 0)`, which answers NaN.
 *
 * That is reachable, not theoretical: importing a save is a first-class
 * recovery route the player drives with a JSON file from disk, and a string in
 * that one field passed validation. NaN is not merely a bad display either.
 * `NaN < price` is false, so the affordability check does not reject it: the
 * purchase succeeds, the balance stays NaN, and the shop becomes an unlimited
 * supply for a save that can never show a number again.
 *
 * NaN itself cannot be persisted — Zod rejects it — so the string is the whole
 * of the hole, and the schema is where it is closed.
 */

function createBridge(): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => "poisoned-currency"), saves };
}

async function startChronicle(bridge: EngineGameBridge): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
}

describe("a save whose currency flag is not a number", () => {
  it("is refused by the schema instead of validating", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");

    const poisoned = {
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, currency: "lots" } }
    };

    expect(() => gameStateSchema.parse(poisoned), "a non-numeric currency must not validate")
      .toThrow();
  });

  it("refuses a fractional or negative balance too", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");

    const withCurrency = (currency: unknown): unknown => ({
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, currency } }
    });

    expect(() => gameStateSchema.parse(withCurrency(-40))).toThrow();
    expect(() => gameStateSchema.parse(withCurrency(12.5))).toThrow();
    expect(() => gameStateSchema.parse(withCurrency(200))).not.toThrow();
    // Absent is legitimate: a chronicle that has never held a mark.
    const { currency: _dropped, ...withoutCurrency } = state.world.flags;
    expect(() => gameStateSchema.parse({
      ...state,
      world: { ...state.world, flags: withoutCurrency }
    })).not.toThrow();
  });

  it("reads any stored value as a real, non-negative whole number", () => {
    // Second layer, for a save that predates the schema rule or arrives by some
    // other route: whatever sits in the flag, the number the game does
    // arithmetic with is finite. A NaN balance is worse than a wrong one —
    // `NaN < price` is false, so the shop would have sold to it for free.
    expect(readCurrency({ currency: 250 })).toBe(250);
    expect(readCurrency({})).toBe(0);
    expect(readCurrency({ currency: "lots" })).toBe(0);
    expect(readCurrency({ currency: "" })).toBe(0);
    expect(readCurrency({ currency: -12 })).toBe(0);
    expect(readCurrency({ currency: 12.9 })).toBe(12);
    expect(readCurrency({ currency: true })).toBe(1);
    expect(readCurrency({ currency: "48" })).toBe(48);
  });

  it("keeps every other flag counter finite, so the save stays writable", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");

    // Marks are not the only number kept in the flag bag. A NaN in any of these
    // is worse than a wrong count: it gets written straight back into the flag,
    // and the schema refuses NaN — from then on the chronicle cannot autosave.
    expect(() => saves.save("autosave", {
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, "progress.completed-runs": Number.NaN } }
    })).rejects.toThrow();

    for (const key of [
      "progress.completed-runs",
      "progress.encounter.mossroad-foragers",
      "progress.npc.mara.conversations"
    ]) {
      expect(readFlagCount({ [key]: "many" }, key)).toBe(0);
      expect(readFlagCount({ [key]: Number.NaN }, key)).toBe(0);
      expect(readFlagCount({}, key, 1), "an absent counter keeps its own default").toBe(1);
      expect(readFlagCount({ [key]: 7 }, key)).toBe(7);
    }
  });
});
