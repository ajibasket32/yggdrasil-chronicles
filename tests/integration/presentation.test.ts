import { describe, expect, it } from "vitest";
import { advancedJobs, ancestries, jobs } from "../../src/content";
import { enemyContentId } from "../../src/integration/enemies";
import { ANCESTRY_TINTS, spriteKeyForJob } from "../../src/integration/presentation";

const LOADED_JOB_SPRITES = new Set([
  "sprite.job.vanguard",
  "sprite.job.ranger",
  "sprite.job.mender",
  "sprite.job.shaper",
  "sprite.job.trickster",
  "sprite.job.warden"
]);

describe("sprite presentation lookups", () => {
  it("maps every authored job to a loaded sprite", () => {
    for (const job of [...jobs, ...advancedJobs]) {
      expect(LOADED_JOB_SPRITES.has(spriteKeyForJob(job.id)), job.id).toBe(true);
    }
    expect(spriteKeyForJob("unknown-job")).toBe("sprite.player");
  });

  it("gives every authored ancestry a valid tint", () => {
    for (const ancestry of ancestries) {
      expect(ANCESTRY_TINTS[ancestry.id], ancestry.id).toBeGreaterThanOrEqual(0);
      expect(ANCESTRY_TINTS[ancestry.id], ancestry.id).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe("enemy sprite lookup ids", () => {
  it("removes only a combat instance suffix", () => {
    expect(enemyContentId("enemy.briar-wolf.0")).toBe("enemy.briar-wolf");
    expect(enemyContentId("enemy.briar-wolf")).toBe("enemy.briar-wolf");
  });
});
