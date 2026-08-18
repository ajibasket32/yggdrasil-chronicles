import { describe, expect, it } from "vitest";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

/**
 * Choosing a form you cannot pay for must cost nothing.
 *
 * The engine already declined the cast and returned its state untouched — but
 * the caller fell through to the enemy's turn regardless, so the round
 * advanced, both foes attacked, and the log said nothing at all. The player
 * lost a turn to a keypress the game had shown as available, with no
 * explanation anywhere on screen.
 *
 * Every caster runs out of focus, so this is reachable in the first hour and
 * every hour after it.
 */

function createBridge(): EngineGameBridge {
  return new EngineGameBridge(new SaveRepository(new MemorySaveStorage()), () => "insufficient-focus");
}

/** Casts the first form until the caster can no longer afford it. */
async function castUntilDrained(bridge: EngineGameBridge): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const battle = bridge.getSnapshot().battle;
    if (!battle || battle.phase !== "choosing") return;
    const caster = battle.actors.find(({ isParty }) => isParty);
    const form = battle.activeSkills[0];
    if (!caster || !form) return;
    if (caster.mp < form.mpCost) return;
    await bridge.chooseBattleAction("skill", form.id);
  }
}

describe("a form the caster cannot afford", () => {
  it("is refused without spending the turn, and says why", async () => {
    const bridge = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "mender", difficulty: "normal" });
    await bridge.startEncounter("encounter.mossroad-foragers");
    await castUntilDrained(bridge);

    const before = bridge.getSnapshot().battle;
    expect(before, "the fight should still be running").toBeDefined();
    const caster = before!.actors.find(({ isParty }) => isParty);
    const form = before!.activeSkills[0];
    expect(caster!.mp, "the caster should be out of focus by now").toBeLessThan(form!.mpCost);

    const roundBefore = before!.round;
    const partyHpBefore = before!.actors.filter(({ isParty }) => isParty)
      .reduce((total, actor) => total + actor.hp, 0);

    await bridge.chooseBattleAction("skill", form!.id);

    const after = bridge.getSnapshot().battle;
    expect(after!.round, "the round must not advance").toBe(roundBefore);
    // The real cost of the old behaviour: the enemies took a free turn.
    expect(
      after!.actors.filter(({ isParty }) => isParty).reduce((total, actor) => total + actor.hp, 0),
      "the party must not be struck for a refused action"
    ).toBe(partyHpBefore);
    expect(after!.actors.find(({ isParty }) => isParty)!.mp, "no focus may be spent").toBe(caster!.mp);

    // The view keeps only the last few lines, so this asserts on what the
    // player can actually read rather than on how many lines were appended.
    const newest = after!.log.at(-1) ?? "";
    expect(newest, "the refusal must be explained, not silent").not.toBe("");
    expect(newest, "and it must name the form the player chose").toContain(form!.name);
  });

  it("marks the form unaffordable so the choice was visible beforehand", async () => {
    const bridge = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "mender", difficulty: "normal" });
    await bridge.startEncounter("encounter.mossroad-foragers");

    // Affordable at full focus...
    expect(bridge.getSnapshot().battle!.activeSkills.every((skill) => skill.affordable)).toBe(true);

    await castUntilDrained(bridge);

    // ...and reported unaffordable once the focus is gone, which is what the
    // battle menu dims. Nothing read this field before, so a form the caster
    // could not pay for looked exactly like one they could.
    const drained = bridge.getSnapshot().battle!;
    const cheapest = Math.min(...drained.activeSkills.map((skill) => skill.mpCost));
    const casterMp = drained.actors.find(({ isParty }) => isParty)!.mp;
    expect(casterMp).toBeLessThan(cheapest);
    expect(drained.activeSkills.some((skill) => skill.affordable === false)).toBe(true);
  });
});
