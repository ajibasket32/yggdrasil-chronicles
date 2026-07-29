import { describe, expect, it, vi } from "vitest";
import {
  NarrativeCheckpointQueue,
  narrativeCacheKey
} from "../../src/ai/checkpointQueue";
import { narrativeContext, validPatch } from "./fixtures";

describe("narrative checkpoint queue", () => {
  it("deduplicates an in-flight checkpoint and caches its valid result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      patch: validPatch(),
      source: "provider"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const queue = new NarrativeCheckpointQueue({ fetch: fetchMock });
    const context = narrativeContext();

    const first = queue.enqueue(context);
    const duplicate = queue.enqueue(context);

    expect(duplicate).toBe(first);
    await expect(first).resolves.toMatchObject({
      source: "provider",
      cacheKey: narrativeCacheKey(context)
    });
    await queue.enqueue(context);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("runs different checkpoints sequentially", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      new Promise<Response>((resolve) => resolvers.push(resolve)));
    const queue = new NarrativeCheckpointQueue({ fetch: fetchMock });
    const firstContext = narrativeContext();
    const secondContext = narrativeContext({
      trigger: { ...narrativeContext().trigger, id: "trigger-2" },
      worldDigest: "world-digest-2"
    });
    const firstPatch = validPatch();
    const secondPatch = validPatch({ id: "generated.patch-2", triggerId: "trigger-2" });

    const first = queue.enqueue(firstContext);
    const second = queue.enqueue(secondContext);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolvers[0]?.(new Response(JSON.stringify({ patch: firstPatch, source: "provider" })));
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolvers[1]?.(new Response(JSON.stringify({ patch: secondPatch, source: "provider" })));
    await second;
  });

  it("uses a safe scripted patch when the network is unavailable", async () => {
    const queue = new NarrativeCheckpointQueue({
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"))
    });

    const result = await queue.enqueue(narrativeContext());

    expect(result.source).toBe("scripted");
    expect(result.report.valid).toBe(true);
    expect(result.patch.quests).toEqual([]);
    expect(result.fallbackReason).toContain("offline");
  });

  it("times out a stalled request and continues draining later checkpoints", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockImplementationOnce((_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          }, { once: true });
        }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        patch: validPatch({ id: "generated.patch-2", triggerId: "trigger-2" }),
        source: "provider"
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }));
    const queue = new NarrativeCheckpointQueue({
      fetch: fetchMock,
      requestTimeoutMs: 10
    });
    const secondContext = narrativeContext({
      trigger: { ...narrativeContext().trigger, id: "trigger-2" },
      worldDigest: "world-digest-2"
    });

    const stalled = queue.enqueue(narrativeContext());
    const later = queue.enqueue(secondContext);

    await expect(stalled).resolves.toMatchObject({
      source: "scripted",
      fallbackReason: "Narrative service request timed out."
    });
    await expect(later).resolves.toMatchObject({
      source: "provider",
      patch: { triggerId: "trigger-2" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queue.pendingCount).toBe(0);
  });
});
