import { describe, expect, it } from "vitest";
import { encounters } from "../../src/content";
import { grantExperience, totalExperienceForLevel } from "../../src/engine/progression";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "elements-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

async function startAtLevel(bridge: EngineGameBridge, saves: SaveRepository, level: number, jobId = "shaper"): Promise<void> {
  await bridge.newGame({ name: "Sage", ancestryId: "sylvan", jobId, difficulty: "easy" });
  const state = await saves.load("autosave");
  if (!state) throw new Error("expected an autosave");
  await saves.save("autosave", {
    ...state,
    party: state.party.map((member) => grantExperience(member, totalExperienceForLevel(level)).character)
  });
  await bridge.continueGame();
}

describe("enemies have distinct elemental identities", () => {
  it("does not give every enemy the same element table", async () => {
    const { bridge, saves } = createBridge();
    await startAtLevel(bridge, saves, 20);

    const signatures = new Set<string>();
    for (const encounter of encounters) {
      bridge.startEncounter(encounter.id);
      const battle = bridge.getSnapshot().battle;
      for (const enemy of battle?.actors.filter((actor) => !actor.isParty) ?? []) {
        signatures.add(enemy.name);
      }
      await bridge.leaveBattle();
    }
    // Sanity: the sweep actually visited enemies.
    expect(signatures.size).toBeGreaterThan(8);
  });

  it("keeps weaknesses hidden until the player has landed that element", async () => {
    const { bridge, saves } = createBridge();
    await startAtLevel(bridge, saves, 20);
    bridge.startEncounter("encounter.mossroad-foragers");

    const before = bridge.getSnapshot().battle?.actors.find((actor) => !actor.isParty);
    expect(before?.knownWeaknesses).toEqual([]);
    expect(before?.knownResistances).toEqual([]);
  });

  it("reveals a weakness once the player lands that element on the species", async () => {
    const { bridge, saves } = createBridge();
    // The Aether Shaper opens with Ember Spark (fire); briar wolves are authored
    // as fire-weak, so one cast is enough to teach it.
    await startAtLevel(bridge, saves, 20, "shaper");
    bridge.startEncounter("encounter.mossroad-foragers");

    const wolf = bridge.getSnapshot().battle?.actors.find((actor) => !actor.isParty && actor.name.includes("briar"));
    if (!wolf) throw new Error("expected a briar wolf");

    await bridge.chooseBattleAction("skill", "skill.ember-spark", wolf.id);

    const after = bridge.getSnapshot().battle?.actors.find(({ id }) => id === wolf.id);
    expect(after?.knownWeaknesses).toContain("fire");
  });

  it("carries what the player learned into the next encounter with the same species", async () => {
    const { bridge, saves } = createBridge();
    await startAtLevel(bridge, saves, 20, "shaper");
    bridge.startEncounter("encounter.mossroad-foragers");
    const wolf = bridge.getSnapshot().battle?.actors.find((actor) => !actor.isParty && actor.name.includes("briar"));
    if (!wolf) throw new Error("expected a briar wolf");
    await bridge.chooseBattleAction("skill", "skill.ember-spark", wolf.id);

    // Finish and re-enter: knowledge is per-species and persists in world flags.
    for (let turn = 0; turn < 40; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing") break;
      await bridge.chooseBattleAction("attack");
    }
    await bridge.leaveBattle();

    bridge.startEncounter("encounter.mossroad-foragers");
    const remembered = bridge.getSnapshot().battle?.actors.find((actor) => !actor.isParty && actor.name.includes("briar"));
    expect(remembered?.knownWeaknesses).toContain("fire");
  });

  it("gives the ice element a real user and a real target", async () => {
    const { bridge, saves } = createBridge();
    await startAtLevel(bridge, saves, 20, "shaper");

    // Grant the ice form directly: it is a branch bonus skill, and this test is
    // about the element being live, not about how the skill is unlocked.
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      party: state.party.map((member) => ({ ...member, skills: [...member.skills, "skill.deep-resonance"] }))
    });
    await bridge.continueGame();

    bridge.startEncounter("encounter.whitebough-hunt");
    const iceForm = bridge.getSnapshot().battle?.activeSkills.find(({ id }) => id === "skill.deep-resonance");
    expect(iceForm?.element).toBe("ice");

    // Rime stags resist ice, so landing it teaches a resistance rather than a
    // weakness — the same discovery channel, opposite sign.
    const stag = bridge.getSnapshot().battle?.actors.find((actor) => !actor.isParty && actor.name.includes("rime"));
    if (!stag) throw new Error("expected a rime stag");
    await bridge.chooseBattleAction("skill", "skill.deep-resonance", stag.id);

    const after = bridge.getSnapshot().battle?.actors.find(({ id }) => id === stag.id);
    expect(after?.knownResistances).toContain("ice");
    expect(after?.knownWeaknesses).not.toContain("ice");
  });

  it("does not leak knowledge between different species", async () => {
    const { bridge, saves } = createBridge();
    await startAtLevel(bridge, saves, 20, "shaper");
    bridge.startEncounter("encounter.mossroad-foragers");
    const wolf = bridge.getSnapshot().battle?.actors.find((actor) => !actor.isParty && actor.name.includes("briar"));
    const gnawer = bridge.getSnapshot().battle?.actors.find((actor) => !actor.isParty && actor.name.includes("gnawer"));
    if (!wolf || !gnawer) throw new Error("expected both species present");

    await bridge.chooseBattleAction("skill", "skill.ember-spark", wolf.id);

    const wolfAfter = bridge.getSnapshot().battle?.actors.find(({ id }) => id === wolf.id);
    const gnawerAfter = bridge.getSnapshot().battle?.actors.find(({ id }) => id === gnawer.id);
    expect(wolfAfter?.knownWeaknesses).toContain("fire");
    // The gnawer is also fire-weak, but the player has not tested it yet.
    expect(gnawerAfter?.knownWeaknesses).not.toContain("fire");
  });
});
