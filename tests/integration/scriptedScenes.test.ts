import { describe, expect, it } from "vitest";
import { encounters, locations, npcs, scenes } from "../../src/content";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "scene-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

describe("scripted scenes are authored content", () => {
  it("authors a prologue and several staged beats", () => {
    expect(scenes.length).toBeGreaterThanOrEqual(5);
    expect(scenes.some(({ trigger }) => trigger.kind === "campaign_start")).toBe(true);
    expect(scenes.some(({ trigger }) => trigger.kind === "encounter_start")).toBe(true);
    expect(scenes.some(({ trigger }) => trigger.kind === "location_first_visit")).toBe(true);
  });

  it("gives every scene unique ids and real lines", () => {
    const ids = scenes.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scene of scenes) {
      expect(scene.lines.length, scene.id).toBeGreaterThan(0);
      for (const line of scene.lines) {
        expect(line.text.length, scene.id).toBeGreaterThan(20);
      }
    }
  });

  it("points every trigger at something that exists", () => {
    const encounterIds = new Set(encounters.map(({ id }) => id));
    const locationIds = new Set(locations.map(({ id }) => id));
    for (const scene of scenes) {
      if (scene.trigger.kind === "encounter_start") {
        expect(encounterIds.has(scene.trigger.encounterId), scene.id).toBe(true);
      }
      if (scene.trigger.kind === "location_first_visit") {
        expect(locationIds.has(scene.trigger.locationId), scene.id).toBe(true);
      }
    }
  });

  it("names a real portrait tag whenever it names one at all", () => {
    const tags = new Set(npcs.map(({ assetTag }) => assetTag));
    for (const scene of scenes) {
      for (const line of scene.lines) {
        if (line.portraitTag) expect(tags.has(line.portraitTag), `${scene.id}: ${line.portraitTag}`).toBe(true);
      }
    }
  });
});

describe("scenes fire on their trigger and only once", () => {
  it("queues the prologue when a chronicle begins", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });

    const pending = bridge.getSnapshot().pendingScene;
    expect(pending, "the prologue is waiting").toBeDefined();
    expect(pending?.id).toBe("scene.prologue");
    expect(pending?.lines.length ?? 0).toBeGreaterThan(3);
    // Narration and spoken lines are distinguishable, which is what lets the
    // scene render them differently.
    expect(pending?.lines.some(({ speaker }) => speaker === "")).toBe(true);
    expect(pending?.lines.some(({ speaker }) => speaker !== "")).toBe(true);
  });

  it("clears once acknowledged and does not return", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    await bridge.acknowledgeScene("scene.prologue");
    expect(bridge.getSnapshot().pendingScene).toBeUndefined();

    // Travelling would queue another scene if the seen-flag had not stuck.
    await bridge.travel("location.mossroad");
    expect(bridge.getSnapshot().pendingScene?.id).not.toBe("scene.prologue");
  });

  it("survives a reload, so a scene is not replayed after a save", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    await bridge.acknowledgeScene("scene.prologue");

    const reloaded = new EngineGameBridge(saves, () => "scene-fixture");
    await reloaded.initialize();
    await reloaded.continueGame();
    expect(reloaded.getSnapshot().pendingScene).toBeUndefined();
  });

  it("stages a boss introduction before the first turn", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    await bridge.acknowledgeScene("scene.prologue");
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", { ...state, world: { ...state.world, currentLocationId: "location.hollow-root" } });
    await bridge.continueGame();
    // Clear whatever arrival scene the location queues.
    const arrival = bridge.getSnapshot().pendingScene;
    if (arrival) await bridge.acknowledgeScene(arrival.id);

    bridge.startEncounter("encounter.mire-antler");
    const pending = bridge.getSnapshot().pendingScene;
    expect(pending?.id).toBe("scene.mire-antler-intro");
    // The battle is live underneath: the scene stages it rather than replacing it.
    expect(bridge.getSnapshot().battle).toBeDefined();
  });

  it("plays a location's arrival scene the first time only", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    await bridge.acknowledgeScene("scene.prologue");

    await bridge.travel("location.mossroad");
    await bridge.travel("location.hollow-root");
    const first = bridge.getSnapshot().pendingScene;
    expect(first?.id).toBe("scene.hollow-root-arrival");
    await bridge.acknowledgeScene(first?.id ?? "");

    await bridge.travel("location.mossroad");
    await bridge.travel("location.hollow-root");
    expect(bridge.getSnapshot().pendingScene).toBeUndefined();
  });
});

describe("a scene queued behind another is not lost", () => {
  it("keeps a boss introduction that fires while an arrival beat is still waiting", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    await bridge.acknowledgeScene("scene.prologue");

    await bridge.travel("location.mossroad");
    await bridge.travel("location.hollow-root");
    // Deliberately leave the arrival beat unacknowledged.
    expect(bridge.getSnapshot().pendingScene?.id).toBe("scene.hollow-root-arrival");

    bridge.startEncounter("encounter.mire-antler");
    // The arrival beat is still the one on screen...
    expect(bridge.getSnapshot().pendingScene?.id).toBe("scene.hollow-root-arrival");

    // ...and the boss introduction is behind it rather than discarded. The
    // boss falls only once, so a dropped intro could never be re-triggered.
    await bridge.acknowledgeScene("scene.hollow-root-arrival");
    expect(bridge.getSnapshot().pendingScene?.id).toBe("scene.mire-antler-intro");
  });

  it("does not let a chronicle's leftover scene suppress the next chronicle's prologue", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    expect(bridge.getSnapshot().pendingScene?.id).toBe("scene.prologue");

    // Start over without ever acknowledging the first prologue.
    await bridge.newGame({ name: "Bram", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const pending = bridge.getSnapshot().pendingScene;
    expect(pending?.id).toBe("scene.prologue");
    // Exactly one copy: the abandoned chronicle's queue does not carry over.
    await bridge.acknowledgeScene("scene.prologue");
    expect(bridge.getSnapshot().pendingScene).toBeUndefined();
  });
});

describe("arrival scenes wait for their location", () => {
  it("tags a first-visit scene with its location and keeps it pending elsewhere", async () => {
    const bridge = new EngineGameBridge(
      new SaveRepository(new MemorySaveStorage()),
      () => "scene-location-fixture"
    );
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    // Clear the campaign-start prologue first.
    const prologue = bridge.getSnapshot().pendingScene;
    if (prologue) await bridge.acknowledgeScene(prologue.id);

    // Reaching the Mossroad then Hollow Root queues the arrival beat, tagged.
    await bridge.travel("location.mossroad");
    await bridge.travel("location.hollow-root");
    const arrival = bridge.getSnapshot().pendingScene;
    expect(arrival?.id).toBe("scene.hollow-root-arrival");
    expect(arrival?.locationId).toBe("location.hollow-root");

    // Stepping straight back out withholds the beat rather than narrating a
    // dripping cavern on the open road.
    await bridge.travel("location.mossroad");
    expect(bridge.getSnapshot().pendingScene?.id).not.toBe("scene.hollow-root-arrival");
    expect(bridge.getSnapshot().locationId).toBe("location.mossroad");

    // It is withheld, not discarded: it is waiting again on return.
    await bridge.travel("location.hollow-root");
    expect(bridge.getSnapshot().pendingScene?.id).toBe("scene.hollow-root-arrival");
  });

  it("does not let a withheld arrival beat block the beats behind it", async () => {
    const { bridge } = createBridge("scene-block-fixture");
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    await bridge.acknowledgeScene("scene.prologue");

    // Walk in, leave without watching: the arrival beat is queued and stranded.
    await bridge.travel("location.mossroad");
    await bridge.travel("location.hollow-root");
    expect(bridge.getSnapshot().pendingScene?.id).toBe("scene.hollow-root-arrival");
    await bridge.travel("location.mossroad");

    // A beat queued afterwards must still be reachable. Taking strictly the
    // head of the queue left the stranded arrival in front of it, hiding every
    // later beat — boss introductions and quest epilogues — for the whole run.
    await bridge.travel("location.hollow-root");
    bridge.startEncounter("encounter.mire-antler");
    await bridge.travel("location.mossroad");
    expect(bridge.getSnapshot().pendingScene?.id).toBe("scene.mire-antler-intro");
  });
});
