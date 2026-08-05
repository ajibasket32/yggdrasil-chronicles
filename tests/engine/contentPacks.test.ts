import { describe, expect, it } from "vitest";
import { reconcileContentPacks } from "../../src/engine/contentPacks";

const RUNNING = { "core.yggdrasil-chronicles": "0.2.0" } as const;

describe("content pack reconciliation", () => {
  it("says nothing when the save matches the running build", () => {
    const result = reconcileContentPacks({ "core.yggdrasil-chronicles": "0.2.0" }, RUNNING);
    expect(result.verdict).toBe("compatible");
    expect(result.changed).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("reports a version the save predates, with both numbers", () => {
    const result = reconcileContentPacks({ "core.yggdrasil-chronicles": "0.1.0" }, RUNNING);
    expect(result.verdict).toBe("updated");
    expect(result.changed).toEqual([["core.yggdrasil-chronicles", "0.1.0", "0.2.0"]]);
    expect(result.message).toContain("0.1.0 → 0.2.0");
  });

  it("reports content this build cannot provide at all", () => {
    const result = reconcileContentPacks(
      { "core.yggdrasil-chronicles": "0.2.0", "dlc.hollow-root": "1.0.0" },
      RUNNING
    );
    expect(result.verdict).toBe("missing");
    expect(result.missing).toEqual(["dlc.hollow-root"]);
    expect(result.message).toContain("dlc.hollow-root");
  });

  it("notices packs the save was written before, without calling them missing", () => {
    const result = reconcileContentPacks({}, RUNNING);
    expect(result.verdict).toBe("updated");
    expect(result.added).toEqual(["core.yggdrasil-chronicles"]);
    expect(result.missing).toEqual([]);
  });

  it("always produces a message a player could be shown", () => {
    const cases: Record<string, string>[] = [{}, { a: "1" }, { "core.yggdrasil-chronicles": "0.2.0" }];
    for (const saved of cases) {
      expect(reconcileContentPacks(saved, RUNNING).message.length).toBeGreaterThan(0);
    }
  });
});
