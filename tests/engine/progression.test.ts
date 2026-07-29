import { describe, expect, it } from "vitest";
import {
  changeJob,
  getJobUnlockBlockers,
  listUnlockableJobs,
  unlockJob,
  type JobDefinition
} from "../../src/engine/progression";
import { makePlayerCharacter } from "./fixtures";

const bulwark: JobDefinition = {
  id: "job-bulwark",
  name: "Bulwark",
  prerequisiteJobIds: ["job-vanguard"],
  minimumLevel: 4,
  requiredSkillIds: ["skill-riposte"]
};

const banneret: JobDefinition = {
  id: "job-banneret",
  name: "Banneret",
  prerequisiteJobIds: ["job-vanguard"],
  minimumLevel: 3,
  requiredSkillIds: []
};

describe("job branch progression", () => {
  it("explains every unmet job branch prerequisite in stable order", () => {
    const character = makePlayerCharacter();

    expect(getJobUnlockBlockers(character, bulwark, [])).toEqual([
      { type: "minimum_level", requiredLevel: 4, currentLevel: 1 },
      { type: "required_skill", skillId: "skill-riposte" }
    ]);
  });

  it("treats a character's active root job as already known", () => {
    const character = { ...makePlayerCharacter(), level: 3 };

    expect(listUnlockableJobs(character, [bulwark, banneret], [])).toEqual([banneret]);
  });

  it("unlocks a branch once, preserves order, and does not switch jobs", () => {
    const character = { ...makePlayerCharacter(), level: 3 };
    const unlocked = unlockJob(character, banneret, []);

    expect(unlocked).toEqual(["job-banneret"]);
    expect(unlockJob(character, banneret, unlocked)).toEqual(unlocked);
    expect(character.jobId).toBe("job-vanguard");
  });

  it("allows switching to a newly eligible branch without mutating the original", () => {
    const character = { ...makePlayerCharacter(), level: 4, skills: ["skill-riposte"] };
    const changed = changeJob(character, bulwark, []);

    expect(changed.jobId).toBe("job-bulwark");
    expect(character.jobId).toBe("job-vanguard");
  });

  it("refuses a branch that remains locked", () => {
    expect(() => unlockJob(makePlayerCharacter(), bulwark, [])).toThrow(/does not meet/);
  });
});
