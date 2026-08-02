import { describe, expect, it } from "vitest";
import { npcs, recruitProfiles } from "../../src/content";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "recruit-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

async function readyToRecruit(
  bridge: EngineGameBridge,
  saves: SaveRepository,
  questId: string
): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
  const state = await saves.load("autosave");
  if (!state) throw new Error("expected an autosave");
  await saves.save("autosave", {
    ...state,
    quests: state.quests.map((quest) =>
      quest.questId === questId ? { ...quest, state: "completed" as const, currentStep: 3 } : quest)
  });
  await bridge.continueGame();
}

describe("a companion joining is a moment, not a toast", () => {
  it("authors a recruitment moment for every recruit", () => {
    expect(recruitProfiles.length).toBeGreaterThan(0);
    for (const profile of recruitProfiles) {
      expect(profile.recruitmentMoment.length, profile.id).toBeGreaterThan(20);
    }
  });

  it("speaks the authored moment in the conversation that recruits them", async () => {
    const profile = recruitProfiles[0];
    if (!profile) throw new Error("expected a recruit profile");
    const { bridge, saves } = createBridge();
    await readyToRecruit(bridge, saves, profile.recruitmentQuestId);

    const view = await bridge.interactNpc(profile.npcId);

    expect(view.recruitedMember, "the companion joined").toBeDefined();
    // The authored prose reaches the player rather than being dead content.
    expect(view.lines.join(" ")).toContain(profile.recruitmentMoment);
    expect(view.lines.join(" ")).toMatch(/joins the party/i);
  });

  it("says so plainly when the newcomer waits in reserve instead", async () => {
    const profile = recruitProfiles[0];
    if (!profile) throw new Error("expected a recruit profile");
    const { bridge, saves } = createBridge();
    await readyToRecruit(bridge, saves, profile.recruitmentQuestId);

    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const hero = state.party[0];
    if (!hero) throw new Error("expected a protagonist");
    // Fill the active party so the recruit is benched rather than turned away.
    await saves.save("autosave", {
      ...state,
      party: Array.from({ length: 4 }, (_, index) =>
        index === 0 ? hero : { ...hero, id: `party.filler${index}`, name: `Filler ${index}` })
    });
    await bridge.continueGame();

    const view = await bridge.interactNpc(profile.npcId);
    expect(view.lines.join(" ")).toContain(profile.recruitmentMoment);
    expect(view.lines.join(" ")).toMatch(/reserve/i);
    expect(bridge.getSnapshot().reserve?.length ?? 0).toBe(1);
  });

  it("does not repeat the moment on a second conversation", async () => {
    const profile = recruitProfiles[0];
    if (!profile) throw new Error("expected a recruit profile");
    const { bridge, saves } = createBridge();
    await readyToRecruit(bridge, saves, profile.recruitmentQuestId);

    await bridge.interactNpc(profile.npcId);
    const again = await bridge.interactNpc(profile.npcId);
    expect(again.recruitedMember).toBeUndefined();
    expect(again.lines.join(" ")).not.toContain(profile.recruitmentMoment);
  });
});

describe("a travelling companion is not also standing in their home town", () => {
  it("maps every recruit to a real NPC in a real location", () => {
    for (const profile of recruitProfiles) {
      const npc = npcs.find(({ id }) => id === profile.npcId);
      expect(npc, profile.id).toBeDefined();
      // The scene filters residents by party id derived from the npc id, so the
      // two must correspond exactly.
      expect(profile.id.replace("recruit.", "party.")).toBe(profile.npcId.replace("npc.", "party."));
    }
  });

  it("has the recruit in the party under the id the world filters on", async () => {
    const profile = recruitProfiles[0];
    if (!profile) throw new Error("expected a recruit profile");
    const { bridge, saves } = createBridge();
    await readyToRecruit(bridge, saves, profile.recruitmentQuestId);
    await bridge.interactNpc(profile.npcId);

    const expectedId = profile.npcId.replace("npc.", "party.");
    const roster = [...bridge.getSnapshot().party, ...(bridge.getSnapshot().reserve ?? [])];
    expect(roster.some(({ id }) => id === expectedId)).toBe(true);
  });
});
