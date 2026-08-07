import { afterEach, describe, expect, it } from "vitest";
import { contextSchema } from "../../server/contracts";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

/**
 * The narrative request the bridge builds has to satisfy the contract the
 * server enforces. That schema is `.strict()`, so exceeding a cap is a 400 and
 * not a truncation — and because the client falls back to scripted prose on any
 * failure, breaking it retires the whole feature with no symptom in gameplay at
 * all. Nothing checked the two ends against each other.
 */

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Captures the request bodies the bridge sends. The queue binds `globalThis.fetch`
 * in its constructor, and the queue is a field of the bridge — so the stub has to
 * be in place before the bridge is built.
 */
async function capturedContexts(relationshipCount: number): Promise<unknown[]> {
  const sent: unknown[] = [];
  globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
    sent.push(JSON.parse(init?.body ?? "{}").context);
    throw new Error("captured — the response is not what this test is about");
  }) as unknown as typeof fetch;

  const saves = new SaveRepository(new MemorySaveStorage());
  const bridge = new EngineGameBridge(saves, () => "contract-seed");
  await bridge.newGame({
    name: "Aster",
    ancestryId: "hearthborn",
    jobId: "vanguard",
    difficulty: "normal"
  });

  // A late-game world. Relationships accrue one per distinct quest NPC, and the
  // campaign authors twenty-five of them, so passing twelve is routine.
  const state = await saves.load("autosave");
  if (!state) throw new Error("expected an autosave");
  await saves.save("autosave", {
    ...state,
    world: {
      ...state.world,
      relationships: Array.from({ length: relationshipCount }, (_unused, index) => ({
        npcId: `npc.companion-${index}`,
        trust: index % 40,
        respect: (index * 3) % 40,
        fear: 0
      }))
    }
  });
  await bridge.continueGame();

  // Travelling enqueues a narrative checkpoint, which is what builds a request.
  await bridge.travel("location.mossroad");
  await new Promise((resolve) => setTimeout(resolve, 20));
  return sent;
}

describe("the narrative request the bridge builds satisfies the server contract", () => {
  it("stays valid for a world far richer than the contract's cap", async () => {
    const sent = await capturedContexts(30);
    expect(sent.length, "the bridge should have built a narrative request").toBeGreaterThan(0);
    for (const context of sent) {
      const parsed = contextSchema.safeParse(context);
      // One entry per relationship failed here from the thirteenth onward, and
      // the provider was never contacted again for the rest of the campaign —
      // silently, since scripted fallback prose is indistinguishable.
      expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
    }
  });

  it("keeps the strongest bonds rather than an arbitrary first twelve", async () => {
    const sent = await capturedContexts(30) as Array<{ npcMemories: Array<{ npcId: string }> }>;
    const context = sent[0]!;
    expect(context.npcMemories.length).toBeLessThanOrEqual(12);
    expect(context.npcMemories.length).toBeGreaterThan(0);
    // Ordering is by strongest axis, so the companions carrying the largest
    // trust/respect survive the cut rather than whoever was met first.
    expect(context.npcMemories.some(({ npcId }) => npcId === "npc.companion-0")).toBe(false);
  });

  it("is valid for an ordinary early chronicle too", async () => {
    const sent = await capturedContexts(2);
    expect(sent.length).toBeGreaterThan(0);
    expect(contextSchema.safeParse(sent[0]).success).toBe(true);
  });
});
