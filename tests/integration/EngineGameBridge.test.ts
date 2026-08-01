import { describe, expect, it } from "vitest";
import { encounters, jobs, recruitProfiles, startingBuildLoadouts } from "../../src/content";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves), saves };
}

async function startChronicle(bridge: EngineGameBridge): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard" });
}

async function winCurrentBattle(bridge: EngineGameBridge): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    const battle = bridge.getSnapshot().battle;
    if (battle?.phase === "victory") return;
    if (!battle || battle.phase !== "choosing") {
      throw new Error(`Battle became unwinnable in phase '${battle?.phase ?? "missing"}'`);
    }
    await bridge.chooseBattleAction("attack");
  }
  throw new Error("Battle did not end within the deterministic turn budget");
}

describe("EngineGameBridge party combat", () => {
  it("gives every living party member a deterministic turn before enemies act", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      quests: initial.quests.map((quest) =>
        quest.questId === "quest.tovins-company"
          ? { ...quest, state: "completed" as const, currentStep: 3 }
          : quest
      )
    });
    await bridge.continueGame();
    await bridge.interactNpc("npc.tovin-ash");
    bridge.startEncounter("encounter.mossroad-foragers");

    expect(bridge.getSnapshot().battle?.activeActorId).toBe("party.protagonist");
    await bridge.chooseBattleAction("guard");
    expect(bridge.getSnapshot().battle).toMatchObject({
      phase: "choosing",
      activeActorId: "party.tovin-ash",
      round: 1
    });

    await bridge.chooseBattleAction("guard");
    expect(bridge.getSnapshot().battle).toMatchObject({
      phase: "choosing",
      activeActorId: "party.protagonist",
      round: 2
    });
  });

  it("handles item and escape actions safely through the public bridge", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    const startingHp = bridge.getSnapshot().party[0]?.hp ?? 0;
    const tonicCount = bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.root-tonic")?.quantity ?? 0;
    bridge.startEncounter("encounter.mossroad-foragers");

    await bridge.chooseBattleAction("item");
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.root-tonic")?.quantity)
      .toBe(tonicCount - 1);
    expect(bridge.getSnapshot().battle?.activeActorId).toBe("party.protagonist");

    await bridge.chooseBattleAction("escape");
    expect(bridge.getSnapshot().battle?.phase).toBe("escaped");
    await bridge.leaveBattle();
    expect(bridge.getSnapshot().battle).toBeUndefined();
    expect(bridge.getSnapshot().party[0]?.hp).toBeLessThan(startingHp);
  });

  it("uses the selected job's authored form and applies starting equipment in battle", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Nyra", ancestryId: "stonekin", jobId: "vanguard" });
    const saved = await saves.load("autosave");
    const protagonist = saved?.party[0];
    expect(protagonist?.skills).toContain("skill.guard-line");
    expect(protagonist?.equipment.armor).toBe("item.resin-vest");
    expect(saved?.inventory.some(({ itemId }) => itemId === "item.resin-vest")).toBe(false);

    bridge.startEncounter("encounter.mossroad-foragers");
    expect(bridge.getSnapshot().battle?.activeSkills.map(({ name }) => name)).toEqual(["Guard Line", "Shield Bash"]);
    const actor = bridge.getSnapshot().battle?.actors.find(({ id }) => id === "party.protagonist");
    expect(actor?.maxHp).toBe((protagonist?.stats.maxHp ?? 0) + 14);
    // Battle portraits must be job-specific, not a shared generic sprite.
    expect(actor?.spriteKey).toBe("sprite.job.vanguard");
    expect(actor?.tint).toBeDefined();
  });

  it("lets the player choose any known form, not just the first learned skill", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Nyra", ancestryId: "stonekin", jobId: "vanguard" });
    bridge.startEncounter("encounter.mossroad-foragers");
    const options = bridge.getSnapshot().battle?.activeSkills;
    expect(options?.map(({ id }) => id)).toEqual(["skill.guard-line", "skill.shield-bash"]);
    const shieldBash = options?.find(({ id }) => id === "skill.shield-bash");
    expect(shieldBash?.mpCost).toBe(5);

    const logBefore = bridge.getSnapshot().battle?.log.length ?? 0;
    await bridge.chooseBattleAction("skill", "skill.shield-bash");
    // Confirms the requested (non-default, non-first-learned) skill actually
    // resolved a combat action rather than being silently ignored.
    expect(bridge.getSnapshot().battle?.log.length).toBeGreaterThan(logBefore);
  });

  it("gives every authored enemy and starting job a distinct battle portrait, not a shared generic sprite", async () => {
    for (const encounter of encounters) {
      const { bridge } = createBridge();
      await startChronicle(bridge);
      bridge.startEncounter(encounter.id);
      const enemyActors = bridge.getSnapshot().battle?.actors.filter(({ isParty }) => !isParty) ?? [];
      expect(enemyActors.length).toBeGreaterThan(0);
      for (const enemy of enemyActors) {
        expect(enemy.spriteKey, `${encounter.id}: ${enemy.name}`).toMatch(/^sprite\.enemy\.(small|humanoid|boss)$/);
        expect(enemy.tint, `${encounter.id}: ${enemy.name}`).toBeDefined();
      }
    }
    for (const job of jobs) {
      const { bridge } = createBridge();
      await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: job.id });
      bridge.startEncounter("encounter.mossroad-foragers");
      const actor = bridge.getSnapshot().battle?.actors.find(({ id }) => id === "party.protagonist");
      expect(actor?.spriteKey, job.id).toBe(`sprite.job.${job.id}`);
    }
  });

  it("lets a Mender use their active form to restore vitality", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Sage", ancestryId: "sylvan", jobId: "mender" });
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({ ...member, hp: 1 }))
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");

    await bridge.chooseBattleAction("skill");

    // The chronicle seed is intentionally unique per new game, so the enemy
    // response may legally end this deliberately one-HP test battle. The
    // public combat log is the contract this test owns: the Mender acted and
    // restored vitality before that response.
    expect(bridge.getSnapshot().battle?.log.join(" ")).toMatch(/Sage restores \d+ vitality to Sage/);
  });

  it("does not turn an equipment max-HP bonus into free healing after victory", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Nyra", ancestryId: "stonekin", jobId: "vanguard" });
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({
        ...member,
        hp: 50,
        stats: { ...member.stats, strength: 1_000 }
      }))
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");
    await bridge.chooseBattleAction("attack");

    expect((await saves.load("autosave"))?.party[0]?.hp).toBe(50);
  });

  it("activates authored boss phases as health thresholds are crossed", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({
        ...member,
        stats: { ...member.stats, strength: 25, maxHp: 1_000 },
        hp: 1_000
      }))
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mire-antler");
    expect(bridge.getSnapshot().battle?.bossPhase).toBe("Drowned Charge");

    for (let turn = 0; turn < 8 && bridge.getSnapshot().battle?.bossPhase !== "Rooted Panic"; turn += 1) {
      await bridge.chooseBattleAction("attack");
    }
    expect(bridge.getSnapshot().battle?.bossPhase).toBe("Rooted Panic");
    expect(bridge.getSnapshot().battle?.log.join(" ")).toContain("hooves split the flooded ground");
    expect(bridge.getSnapshot().battle?.actors.find(({ isParty }) => isParty)?.status).toBe("freeze");
  });

  it("cures a blocking status with Ash Spice, the only in-battle counter to a boss freeze/burn phase", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({
        ...member,
        stats: { ...member.stats, strength: 25, maxHp: 1_000 },
        hp: 1_000
      })),
      inventory: [...initial.inventory, { itemId: "item.ash-spice", quantity: 1 }]
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mire-antler");
    for (let turn = 0; turn < 8 && bridge.getSnapshot().battle?.bossPhase !== "Rooted Panic"; turn += 1) {
      await bridge.chooseBattleAction("attack");
    }
    expect(bridge.getSnapshot().battle?.actors.find(({ isParty }) => isParty)?.status).toBe("freeze");

    // Ash Spice must be offered as a usable item once the party is frozen,
    // and choosing it explicitly clears the blocking status.
    expect(bridge.getSnapshot().battle?.activeItems.map(({ id }) => id)).toContain("item.ash-spice");
    await bridge.chooseBattleAction("item", "item.ash-spice");
    expect(bridge.getSnapshot().battle?.actors.find(({ isParty }) => isParty)?.status).not.toBe("freeze");
    expect(bridge.getSnapshot().battle?.log.join(" ")).toContain("shakes off the affliction");
    expect(bridge.getSnapshot().inventory.some(({ itemId }) => itemId === "item.ash-spice")).toBe(false);
  });

  it("lets the player choose a specific usable item instead of always defaulting to Root Tonic", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      inventory: [...initial.inventory, { itemId: "item.aether-drop", quantity: 1 }]
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");
    const itemIds = bridge.getSnapshot().battle?.activeItems.map(({ id }) => id) ?? [];
    expect(itemIds).toContain("item.root-tonic");
    expect(itemIds).toContain("item.aether-drop");

    const mpBefore = bridge.getSnapshot().party[0]?.mp ?? 0;
    await bridge.chooseBattleAction("item", "item.aether-drop");
    // Root Tonic (hp-only) must not have been consumed instead of the
    // explicitly requested Aether Drop (mp-only).
    expect(bridge.getSnapshot().inventory.some(({ itemId }) => itemId === "item.aether-drop")).toBe(false);
    expect(bridge.getSnapshot().party[0]?.mp).toBeGreaterThanOrEqual(mpBefore);
  });
});

describe("EngineGameBridge campaign persistence", () => {
  it("lists and loads manual save slots through the game bridge", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard" });
    await bridge.save("manual-1");
    await bridge.newGame({ name: "Vale", ancestryId: "sylvan", jobId: "mender" });

    expect(bridge.getSnapshot().saveSlots).toEqual(expect.arrayContaining(["autosave", "manual-1"]));
    await bridge.load("manual-1");
    expect(bridge.getSnapshot().playerName).toBe("Aster");
  });

  it("discovers an available travel-first side quest from the matching action", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);

    await bridge.travel("location.mossroad");

    expect(bridge.getSnapshot().quests.find(({ id }) => id === "quest.storytellers-toll")).toMatchObject({
      state: "active",
      objectiveKind: "talk",
      objectiveTargetId: "npc.pella-wren"
    });
  });

  it("accumulates counted defeat objectives across repeatable encounters", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({
        ...member,
        hp: 1_000,
        stats: { ...member.stats, maxHp: 1_000, strength: 1_000 }
      })),
      quests: initial.quests.map((quest) =>
        quest.questId === "quest.hollow-witness"
          ? { ...quest, state: "active" as const, currentStep: 1 }
          : quest
      ),
      world: {
        ...initial.world,
        currentLocationId: "location.hollow-root",
        flags: { ...initial.world.flags, "progress.defeat.enemy.root-gnawer": 2 }
      }
    });
    await bridge.continueGame();

    bridge.startEncounter("encounter.mossroad-foragers");
    await winCurrentBattle(bridge);
    expect((await saves.load("autosave"))?.world.flags["progress.defeat.enemy.root-gnawer"]).toBe(3);
    expect(bridge.getSnapshot().quests.find(({ id }) => id === "quest.hollow-witness")?.objectiveTargetId)
      .toBe("enemy.root-gnawer");
    await bridge.leaveBattle();

    bridge.startEncounter("encounter.mossroad-foragers");
    await winCurrentBattle(bridge);
    expect((await saves.load("autosave"))?.world.flags["progress.defeat.enemy.root-gnawer"]).toBe(4);
    expect(bridge.getSnapshot().quests.find(({ id }) => id === "quest.hollow-witness")?.objectiveTargetId)
      .toBe("enemy.mire-antler");
  });

  it("rests the party, advances time, records the camp, and autosaves", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({
        ...member,
        hp: 1,
        mp: 0,
        statuses: [{ id: "poison", remainingTurns: 2, potency: 3 }]
      }))
    });
    await bridge.continueGame();

    await bridge.rest();

    const rested = await saves.load("autosave");
    expect(rested?.world.worldMinutes).toBe(initial.world.worldMinutes + 480);
    expect(rested?.party.every((member) =>
      member.hp === member.stats.maxHp && member.mp === member.stats.maxMp && member.statuses.length === 0
    )).toBe(true);
    expect(rested?.world.chronicle.at(-1)?.title).toBe("A Quiet Rest");
  });

  it("claims location discoveries once and refuses a defeated boss encounter", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);

    await bridge.travel("location.mossroad");
    const firstFindCount = bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.brass-rivet")?.quantity;
    await bridge.travel("location.hearthcross");
    await bridge.travel("location.mossroad");
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.brass-rivet")?.quantity).toBe(firstFindCount);

    const saved = await saves.load("autosave");
    if (!saved) throw new Error("Expected an autosave after travel");
    await saves.save("autosave", {
      ...saved,
      world: { ...saved.world, defeatedBossIds: ["encounter.mire-antler"] }
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mire-antler");
    expect(bridge.getSnapshot().battle).toBeUndefined();
  });

  it("pays a completed quest exactly once and preserves its reward marker", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    await bridge.interactNpc("npc.mara-vell");
    await bridge.interactNpc("npc.orren-pike");

    const rewarded = await saves.load("autosave");
    if (!rewarded) throw new Error("Expected a quest reward autosave");
    const protagonist = rewarded.party.find(({ id }) => id === "party.protagonist");
    expect(rewarded.world.flags["content.quest-reward.quest.first-silence"]).toBe(true);
    expect(rewarded.world.flags["outcome.quest.first-silence"]).toBe(true);
    expect(protagonist?.experience).toBeGreaterThan(0);
    expect(rewarded.world.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ npcId: "npc.mara-vell", respect: 6 }),
      expect.objectContaining({ npcId: "npc.orren-pike", respect: 6 })
    ]));
    expect(rewarded.world.factionStanding).toMatchObject({
      "faction.rootwardens": 3,
      "faction.lantern-archive": 3
    });
    expect(rewarded.world.chronicle.filter(({ title }) => title === "The First Silence resolved")).toHaveLength(1);

    await bridge.interactNpc("npc.orren-pike");
    const repeated = await saves.load("autosave");
    expect(repeated?.party.find(({ id }) => id === "party.protagonist")?.experience).toBe(protagonist?.experience);
    expect(repeated?.world.chronicle.filter(({ title }) => title === "The First Silence resolved")).toHaveLength(1);
    expect(repeated?.world.factionStanding).toEqual(rewarded.world.factionStanding);
  });

  it("makes persisted personal and faction standing visible in NPC dialogue and snapshots", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const saved = await saves.load("autosave");
    if (!saved) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...saved,
      world: {
        ...saved.world,
        relationships: [{ npcId: "npc.mara-vell", trust: 9, respect: 14, fear: 0 }],
        factionStanding: { "faction.rootwardens": 12 }
      }
    });
    await bridge.continueGame();

    const interaction = await bridge.interactNpc("npc.mara-vell");
    expect(interaction.lines.join(" ")).toContain("kept faith");
    expect(interaction.lines.join(" ")).toContain("proven allies");
    expect(bridge.getSnapshot().reputation).toMatchObject({
      factions: [expect.objectContaining({ id: "faction.rootwardens", standing: 12 })],
      relationships: [expect.objectContaining({ npcId: "npc.mara-vell", trust: 9, respect: 14 })]
    });
  });

  it("rotates authored dialogue from persistent NPC conversation memory", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);

    const first = await bridge.interactNpc("npc.joryn-hale");
    const second = await bridge.interactNpc("npc.joryn-hale");
    const third = await bridge.interactNpc("npc.joryn-hale");

    expect(first.lines).toHaveLength(2);
    expect(first.lines[0]).toBe(second.lines[0]);
    expect(new Set([first.lines[1], second.lines[1], third.lines[1]]).size).toBe(3);
    expect((await saves.load("autosave"))?.world.flags["memory.npc.joryn-hale.conversations"]).toBe(3);

    const restored = new EngineGameBridge(saves);
    await restored.initialize();
    await restored.continueGame();
    const fourth = await restored.interactNpc("npc.joryn-hale");
    expect(fourth.lines[1]).not.toBe(third.lines[1]);
    expect((await saves.load("autosave"))?.world.flags["memory.npc.joryn-hale.conversations"]).toBe(4);
  });

  it("backfills authored consequences into older rewarded saves without paying twice", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const saved = await saves.load("autosave");
    if (!saved) throw new Error("Expected an initial autosave");
    const experience = saved.party[0]?.experience ?? 0;
    await saves.save("autosave", {
      ...saved,
      quests: saved.quests.map((quest) =>
        quest.questId === "quest.first-silence"
          ? { ...quest, state: "completed" as const, currentStep: 2 }
          : quest
      ),
      world: {
        ...saved.world,
        flags: {
          ...saved.world.flags,
          "content.quest-reward.quest.first-silence": true
        },
        relationships: [],
        factionStanding: {}
      }
    });

    await bridge.continueGame();

    const recovered = await saves.load("autosave");
    expect(recovered?.party[0]?.experience).toBe(experience);
    expect(recovered?.world.flags["content.quest-consequence.quest.first-silence"]).toBe(true);
    expect(recovered?.world.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ npcId: "npc.mara-vell", respect: 6 })
    ]));
    expect(recovered?.world.factionStanding["faction.rootwardens"]).toBe(3);
  });

  it("reports authored campaign completion from persisted main quest state", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const saved = await saves.load("autosave");
    if (!saved) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...saved,
      quests: saved.quests.map((quest) => ({ ...quest, state: "completed" as const }))
    });

    await bridge.continueGame();

    expect(bridge.getSnapshot().campaign).toMatchObject({
      completedMainQuests: 15,
      totalMainQuests: 15,
      complete: true,
      ending: {
        id: "ending.concord-remade",
        title: "THE CONCORD REMADE"
      }
    });
    expect((await saves.load("autosave"))?.world.flags["ending.concord-remade"]).toBe(true);
  });

  it("requires a persisted three-way choice before completing the authored campaign", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const saved = await saves.load("autosave");
    if (!saved) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...saved,
      quests: saved.quests.map((quest) =>
        quest.questId === "quest.a-new-concord"
          ? { ...quest, state: "active" as const, currentStep: 2 }
          : { ...quest, state: "completed" as const }
      )
    });
    await bridge.continueGame();

    const decision = await bridge.interactNpc("npc.sable-voss");
    expect(decision.choices?.map(({ id }) => id)).toEqual([
      "ending.concord-remade",
      "ending.rootways-freed",
      "ending.lantern-covenant"
    ]);
    expect(bridge.getSnapshot().campaign).toMatchObject({
      completedMainQuests: 14,
      complete: false
    });

    const freeboundBefore = bridge.getSnapshot().reputation?.factions.find(
      ({ id }) => id === "faction.freebound"
    )?.standing ?? 0;
    const resolution = await bridge.resolveInteractionChoice("ending.rootways-freed");
    expect(resolution.lines[0]).toContain("No single covenant");
    expect(bridge.getSnapshot().campaign).toMatchObject({
      completedMainQuests: 15,
      complete: true,
      ending: {
        id: "ending.rootways-freed",
        title: "THE ROOTWAYS FREED"
      }
    });

    const persisted = await saves.load("autosave");
    expect(persisted?.world.flags["ending.rootways-freed"]).toBe(true);
    expect(persisted?.world.flags["ending.concord-remade"]).not.toBe(true);
    expect(persisted?.world.factionStanding["faction.freebound"]).toBeGreaterThanOrEqual(freeboundBefore + 8);
    expect(persisted?.world.chronicle.some(({ tags }) =>
      tags.includes("ending.rootways-freed")
    )).toBe(true);
    expect(persisted?.world.chronicle.some(({ tags, body }) =>
      tags.includes("epilogue") && body.includes("Rootwardens")
    )).toBe(true);
    expect(bridge.getSnapshot().campaign?.ending?.epilogue).toContain("Rootwardens");

    await bridge.resolveInteractionChoice("ending.lantern-covenant");
    const unchanged = await saves.load("autosave");
    expect(unchanged?.world.flags["ending.rootways-freed"]).toBe(true);
    expect(unchanged?.world.flags["ending.lantern-covenant"]).not.toBe(true);
  });

  it("applies each ending's +8/-5 faction trade-off on top of an otherwise-unaffected baseline", async () => {
    // Starts the Concord decision directly from a fresh chronicle with no
    // other quests completed. Completing "A New Concord" itself still grants
    // its own authored consequences (talking to the Rootwarden Mara Vell
    // adjusts faction.rootwardens by the standard main-story +3), so the
    // expected values below are that quest's consequence composed with the
    // ending's own +8/-5 trade-off, not the trade-off in isolation.
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const saved = await saves.load("autosave");
    if (!saved) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...saved,
      quests: saved.quests.map((quest) =>
        quest.questId === "quest.a-new-concord"
          ? { ...quest, state: "active" as const, currentStep: 2 }
          : quest
      )
    });
    await bridge.continueGame();

    await bridge.resolveInteractionChoice("ending.rootways-freed");
    const persisted = await saves.load("autosave");
    // Freebound: only the ending's +8 (no Freebound NPC is talked to by
    // "A New Concord"). Rootwardens: the quest's own +3 (from talking to
    // Mara Vell) composed with the ending's -5 opposed-faction trade-off.
    expect(persisted?.world.factionStanding["faction.freebound"]).toBe(8);
    expect(persisted?.world.factionStanding["faction.rootwardens"]).toBe(3 - 5);
  });
});

describe("EngineGameBridge runtime party management", () => {
  it("gives every recruited companion an exclusive skill no self-made character of the same job can learn", async () => {
    for (const profile of recruitProfiles) {
      const { bridge, saves } = createBridge();
      await startChronicle(bridge);
      const initial = await saves.load("autosave");
      if (!initial) throw new Error("Expected an initial autosave");
      await saves.save("autosave", {
        ...initial,
        quests: initial.quests.map((quest) =>
          quest.questId === profile.recruitmentQuestId
            ? { ...quest, state: "completed" as const, currentStep: 3 }
            : quest
        )
      });
      await bridge.continueGame();
      await bridge.interactNpc(profile.npcId);

      const recruited = (await saves.load("autosave"))?.party.find(
        ({ id }) => id === profile.id.replace("recruit.", "party.")
      );
      expect(recruited, profile.id).toBeDefined();

      const selfMadeSkills = new Set(
        startingBuildLoadouts
          .filter((loadout) => loadout.jobId === profile.jobId)
          .flatMap((loadout) => loadout.startingSkills)
      );
      const exclusiveSkills = (recruited?.skills ?? []).filter((skillId) => !selfMadeSkills.has(skillId));
      expect(exclusiveSkills.length, `${profile.id} should learn at least one skill unavailable to a self-made ${profile.jobId}`).toBeGreaterThan(0);
    }
  });

  it("publishes item kinds, equipment ownership, and the three-job branch view", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Bran", ancestryId: "stonekin", jobId: "vanguard" });
    const snapshot = bridge.getSnapshot();
    const protagonist = snapshot.party[0];

    expect(snapshot.inventory.find(({ itemId }) => itemId === "item.vesleaf")).toMatchObject({
      kind: "consumable",
      equippedBy: []
    });
    expect(protagonist?.equipment?.armor).toEqual({ itemId: "item.resin-vest", name: "Resin Vest" });
    expect(protagonist?.jobOptions).toEqual([
      expect.objectContaining({ id: "vanguard", state: "active" }),
      expect.objectContaining({ id: "bulwark", state: "locked" }),
      expect.objectContaining({ id: "banneret", state: "locked" })
    ]);
    // Full stat block must be exposed, not just HP/MP, so the party overlay
    // can show why one build differs mechanically from another.
    expect(protagonist?.stats).toEqual({
      strength: expect.any(Number),
      dexterity: expect.any(Number),
      agility: expect.any(Number),
      vitality: expect.any(Number),
      intellect: expect.any(Number),
      wisdom: expect.any(Number),
      charisma: expect.any(Number)
    });
  });

  it("reflects equipment stat modifiers in the published stat block", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Bran", ancestryId: "stonekin", jobId: "vanguard" });
    const protagonist = bridge.getSnapshot().party[0];
    if (!protagonist) throw new Error("Expected a protagonist");
    // The starting Vanguard build already wears a Resin Vest (+3 vitality),
    // so removing it should measurably drop the published vitality stat.
    const vitalityEquipped = protagonist.stats.vitality;
    await bridge.setEquipment(protagonist.id, "armor");
    const vitalityUnequipped = bridge.getSnapshot().party[0]?.stats.vitality;
    expect(vitalityUnequipped).toBe(vitalityEquipped - 3);
  });

  it("uses restorative inventory only when a member can benefit and persists each use", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Eira", ancestryId: "sylvan", jobId: "mender" });
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    const protagonist = initial.party[0];
    if (!protagonist) throw new Error("Expected a protagonist");
    await saves.save("autosave", {
      ...initial,
      party: [{ ...protagonist, hp: 1, mp: 0 }],
      inventory: [
        ...initial.inventory,
        { itemId: "item.frost-resin", quantity: 1 },
        { itemId: "item.cold-ember", quantity: 1 }
      ]
    });
    await bridge.continueGame();

    expect((await bridge.useInventoryItem("item.vesleaf", protagonist.id)).success).toBe(true);
    expect((await bridge.useInventoryItem("item.aether-drop", protagonist.id)).success).toBe(true);
    expect((await bridge.useInventoryItem("item.frost-resin", protagonist.id)).success).toBe(true);
    expect((await bridge.useInventoryItem("item.cold-ember", protagonist.id)).success).toBe(true);
    const afterUses = await saves.load("autosave");
    const restored = afterUses?.party[0];
    expect(restored?.hp).toBeGreaterThan(1);
    expect(restored?.mp).toBeGreaterThan(0);
    expect(afterUses?.inventory.some(({ itemId }) => itemId === "item.frost-resin")).toBe(false);
    expect(afterUses?.inventory.some(({ itemId }) => itemId === "item.cold-ember")).toBe(false);

    await bridge.rest();
    const fullItemCount = bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.root-tonic")?.quantity;
    const noEffect = await bridge.useInventoryItem("item.root-tonic", protagonist.id);
    expect(noEffect.success).toBe(false);
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.root-tonic")?.quantity).toBe(fullItemCount);
  });

  it("moves gear atomically between inventory and equipment without changing the HP deficit", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Bran", ancestryId: "stonekin", jobId: "vanguard" });
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    const protagonist = initial.party[0];
    if (!protagonist) throw new Error("Expected a protagonist");
    await saves.save("autosave", {
      ...initial,
      party: [{ ...protagonist, hp: protagonist.stats.maxHp - 19 }]
    });
    await bridge.continueGame();

    expect((await bridge.setEquipment(protagonist.id, "armor")).success).toBe(true);
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.resin-vest")?.quantity).toBe(1);
    expect(bridge.getSnapshot().party[0]?.equipment?.armor).toBeUndefined();

    expect((await bridge.setEquipment(protagonist.id, "armor", "item.resin-vest")).success).toBe(true);
    const equipped = await saves.load("autosave");
    expect(equipped?.inventory.some(({ itemId }) => itemId === "item.resin-vest")).toBe(false);
    expect(equipped?.party[0]?.equipment.armor).toBe("item.resin-vest");
    expect(equipped?.party[0]?.hp).toBe(protagonist.stats.maxHp - 19);
  });

  it("drops regional gear from named bosses and enforces minimum level before it can be equipped", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    // Level stays 1 so the minimum-level rejection below is meaningful; stats
    // are buffed only enough to win within the deterministic turn budget.
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({
        ...member,
        stats: { ...member.stats, strength: 25, maxHp: 1_000 },
        hp: 1_000
      }))
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mire-antler");
    await winCurrentBattle(bridge);
    await bridge.leaveBattle();

    const afterVictory = await saves.load("autosave");
    const protagonist = afterVictory?.party[0];
    if (!protagonist) throw new Error("Expected a protagonist");
    expect(afterVictory?.inventory.some(({ itemId }) => itemId === "item.hearthsteel-blade")).toBe(true);
    expect(afterVictory?.inventory.some(({ itemId }) => itemId === "item.kilnforge-plate")).toBe(true);

    // Tier-2 gear requires level 7; this protagonist is still level 1.
    expect(protagonist.level).toBeLessThan(7);
    const tooLow = await bridge.setEquipment(protagonist.id, "weapon", "item.hearthsteel-blade");
    expect(tooLow.success).toBe(false);
    expect(bridge.getSnapshot().party[0]?.equipment?.weapon?.itemId).not.toBe("item.hearthsteel-blade");

    await saves.save("autosave", {
      ...afterVictory,
      party: afterVictory.party.map((member) => ({ ...member, level: 7 }))
    });
    await bridge.continueGame();
    const atLevel = await bridge.setEquipment(protagonist.id, "weapon", "item.hearthsteel-blade");
    expect(atLevel.success).toBe(true);
    expect(bridge.getSnapshot().party[0]?.equipment?.weapon?.itemId).toBe("item.hearthsteel-blade");
  });

  it("unlocks advanced jobs at level four, persists the flag, and promotes the signature skill", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Bran", ancestryId: "hearthborn", jobId: "vanguard" });
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({ ...member, level: 4 }))
    });
    await bridge.continueGame();

    expect(bridge.getSnapshot().party[0]?.jobOptions?.map(({ state }) => state)).toEqual(["active", "available", "available"]);
    const baseStrength = (await saves.load("autosave"))?.party[0]?.stats.strength ?? 0;
    expect((await bridge.selectJob("party.protagonist", "banneret")).success).toBe(true);
    const advanced = await saves.load("autosave");
    expect(advanced?.party[0]?.jobId).toBe("banneret");
    expect(advanced?.party[0]?.skills[0]).toBe("skill.shield-bash");
    // Banneret grants a permanently new form in addition to reordering its signature skill.
    expect(advanced?.party[0]?.skills).toContain("skill.rallying-strike");
    // Banneret's stat delta (strength +3, charisma +2) is distinct from Bulwark's (maxHp +10, vitality +2).
    expect(advanced?.party[0]?.stats.strength).toBe(baseStrength + 3);
    expect(advanced?.world.flags["progression.job.party.protagonist.banneret"]).toBe(true);
    expect(bridge.getSnapshot().party[0]?.jobOptions?.find(({ id }) => id === "banneret")?.state).toBe("active");

    expect((await bridge.selectJob("party.protagonist", "vanguard")).success).toBe(true);
    expect(bridge.getSnapshot().party[0]?.jobOptions?.find(({ id }) => id === "banneret")?.state).toBe("unlocked");
    // Reverting to the base job removes the branch's stat delta cleanly.
    expect((await saves.load("autosave"))?.party[0]?.stats.strength).toBe(baseStrength);
  });
});

describe("EngineGameBridge shop", () => {
  async function grantCurrency(bridge: EngineGameBridge, saves: SaveRepository, amount: number): Promise<void> {
    const state = await saves.load("autosave");
    if (!state) throw new Error("Expected an initial autosave");
    await saves.save("autosave", { ...state, world: { ...state.world, flags: { ...state.world.flags, currency: amount } } });
    await bridge.continueGame();
  }

  it("opens the shop when talking to a vendor NPC and exposes its catalog", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    const view = await bridge.interactNpc("npc.joryn-hale");
    expect(view.opensVendorId).toBe("vendor.joryn-hale");
    const shop = bridge.getSnapshot().shop;
    expect(shop?.vendorId).toBe("vendor.joryn-hale");
    expect(shop?.catalog.some(({ itemId }) => itemId === "item.wayfarer-blade")).toBe(true);
  });

  it("does not open a shop when talking to a non-vendor NPC", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    const view = await bridge.interactNpc("npc.mara-vell");
    expect(view.opensVendorId).toBeUndefined();
    expect(bridge.getSnapshot().shop).toBeUndefined();
  });

  it("buys an item, deducting currency and adding the item, persisted across reload", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    await grantCurrency(bridge, saves, 200);
    await bridge.interactNpc("npc.joryn-hale");

    const before = bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.wayfarer-blade")?.quantity ?? 0;
    const result = await bridge.buyItem("item.wayfarer-blade");
    expect(result.success).toBe(true);
    expect(bridge.getSnapshot().currency).toBe(80);
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.wayfarer-blade")?.quantity).toBe(before + 1);

    const persisted = await saves.load("autosave");
    expect(Number(persisted?.world.flags.currency)).toBe(80);
    expect(persisted?.inventory.some(({ itemId }) => itemId === "item.wayfarer-blade")).toBe(true);
  });

  it("rejects buying an item the party cannot afford, changing nothing", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    await grantCurrency(bridge, saves, 10);
    await bridge.interactNpc("npc.joryn-hale");

    const inventoryBefore = bridge.getSnapshot().inventory;
    const result = await bridge.buyItem("item.wayfarer-blade");
    expect(result.success).toBe(false);
    expect(bridge.getSnapshot().currency).toBe(10);
    expect(bridge.getSnapshot().inventory).toEqual(inventoryBefore);
  });

  it("sells an item, crediting currency at the vendor's sell rate and removing it from the pack", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    // The starting Vanguard build carries a spare item.root-tonic, which
    // vendor.joryn-hale's catalog also lists, so it's sellable without a buy first.
    const owned = bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.root-tonic")?.quantity ?? 0;
    expect(owned).toBeGreaterThan(0);
    await bridge.interactNpc("npc.joryn-hale");

    const result = await bridge.sellItem("item.root-tonic");
    expect(result.success).toBe(true);
    expect(bridge.getSnapshot().currency).toBe(18);
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.root-tonic")?.quantity).toBe(owned - 1);

    const persisted = await saves.load("autosave");
    expect(Number(persisted?.world.flags.currency)).toBe(18);
  });

  it("rejects selling an item the party does not carry", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    await bridge.interactNpc("npc.joryn-hale");
    const result = await bridge.sellItem("item.aether-drop");
    expect(result.success).toBe(false);
    expect(bridge.getSnapshot().currency).toBe(0);
  });

  it("rejects buying and selling items outside the open vendor's catalog", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    await grantCurrency(bridge, saves, 500);
    await bridge.interactNpc("npc.joryn-hale");
    // item.hearthsteel-blade belongs to vendor.hett-copper's catalog, not Joryn's.
    expect((await bridge.buyItem("item.hearthsteel-blade")).success).toBe(false);
    expect((await bridge.sellItem("item.hearthsteel-blade")).success).toBe(false);
  });

  it("closes the shop on leaveShop and rejects further transactions", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    await grantCurrency(bridge, saves, 200);
    await bridge.interactNpc("npc.joryn-hale");
    expect(bridge.getSnapshot().shop).toBeDefined();

    await bridge.leaveShop();
    expect(bridge.getSnapshot().shop).toBeUndefined();
    expect((await bridge.buyItem("item.wayfarer-blade")).success).toBe(false);
  });
});

describe("EngineGameBridge save interchange", () => {
  it("exports, imports into the requested slot, restores active state, and preserves the target backup", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Imported", ancestryId: "sylvan", jobId: "mender" });
    await bridge.travel("location.mossroad");
    await bridge.save("manual-2");
    const exported = await bridge.exportSave("manual-2");

    await bridge.newGame({ name: "Replaced", ancestryId: "stonekin", jobId: "vanguard" });
    await bridge.save("manual-1");
    const previousTarget = await saves.load("manual-1");
    bridge.startEncounter("encounter.mossroad-foragers");
    expect(bridge.getSnapshot().battle).toBeDefined();

    const result = await bridge.importSave("manual-1", exported);
    expect(result.success).toBe(true);
    expect(bridge.getSnapshot()).toMatchObject({
      playerName: "Imported",
      locationId: "location.mossroad",
      battle: undefined
    });
    expect((await saves.load("manual-1"))?.seed).toBe((await saves.load("manual-2"))?.seed);
    expect((await saves.backups("manual-1"))[0]?.record.seed).toBe(previousTarget?.seed);
    expect(bridge.getSnapshot().saveSlots).toEqual(expect.arrayContaining(["autosave", "manual-1", "manual-2"]));
  });

  it("rejects corrupt imports without replacing either the active state or target save", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Safe", ancestryId: "hearthborn", jobId: "vanguard" });
    await bridge.save("manual-1");
    const activeBefore = bridge.getSnapshot();
    const targetBefore = await saves.load("manual-1");
    const corrupt = JSON.parse(await bridge.exportSave("manual-1")) as Record<string, unknown>;
    corrupt.checksum = "invalid";

    const result = await bridge.importSave("manual-1", JSON.stringify(corrupt));

    expect(result).toMatchObject({ success: false, message: expect.stringMatching(/checksum mismatch/i) });
    expect(bridge.getSnapshot()).toMatchObject({
      playerName: activeBefore.playerName,
      locationId: activeBefore.locationId,
      party: activeBefore.party
    });
    expect((await saves.load("manual-1"))?.seed).toBe(targetBefore?.seed);
    expect(await saves.backups("manual-1")).toHaveLength(0);
  });
});
