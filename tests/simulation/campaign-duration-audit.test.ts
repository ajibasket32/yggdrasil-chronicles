import { describe, expect, it } from "vitest";
import {
  AUTHORED_DURATION_TARGET_MINUTES,
  auditCampaignDuration,
  type CampaignTimingEvidence
} from "../../tools/campaign-duration-audit";
import { coreCampaign } from "../../src/content";

const completeEvidence = (overrides: Partial<CampaignTimingEvidence> = {}): CampaignTimingEvidence => ({
  schemaVersion: 1,
  runId: "manual-release-run-001",
  mode: "normal-exploratory",
  aiEnabled: false,
  campaignComplete: true,
  startedAt: "2026-07-01T08:00:00.000Z",
  endedAt: "2026-07-02T04:05:00.000Z",
  elapsedMinutes: AUTHORED_DURATION_TARGET_MINUTES + 5,
  completedQuestIds: coreCampaign.quests.map(({ id }) => id),
  recordingReference: "release-evidence/manual-release-run-001.mp4",
  notes: "Fresh offline route; no debug travel; explored authored optional routes.",
  ...overrides
});

describe("campaign duration certification audit", () => {
  it("audits authored breadth without converting it into an hours claim", () => {
    const result = auditCampaignDuration();

    expect(result.validPacingStructure, result.structuralErrors.join("\n")).toBe(true);
    expect(result.authoredQuestCount).toBe(35);
    expect(result.mainQuestCount).toBe(15);
    expect(result.optionalQuestCount).toBe(20);
    expect(result.regionEvidence).toHaveLength(3);
    for (const region of result.regionEvidence) {
      expect(region.locationKinds).toEqual(["dungeon", "town", "wilderness"]);
      expect(region.bossEncounterCount).toBe(1);
      expect(region.recruitmentQuestIds).toHaveLength(1);
    }
    expect(result.certification.status).toBe("unverified");
    expect(result.certification.elapsedMinutes).toBeUndefined();
  });

  it("certifies only complete offline timed evidence that reaches the target", () => {
    expect(auditCampaignDuration(completeEvidence()).certification.status).toBe("certified");

    const shortRun = auditCampaignDuration(completeEvidence({ elapsedMinutes: AUTHORED_DURATION_TARGET_MINUTES - 1 }));
    expect(shortRun.certification.status).toBe("invalid");
    expect(shortRun.certification.missingOrInvalid).toContain(`Observed duration must be at least ${AUTHORED_DURATION_TARGET_MINUTES} minutes.`);

    const aiRun = auditCampaignDuration(completeEvidence({ aiEnabled: true }));
    expect(aiRun.certification.status).toBe("invalid");
    expect(aiRun.certification.missingOrInvalid).toContain("Timing evidence must be recorded with AI disabled.");

    const noReference = auditCampaignDuration(completeEvidence({ recordingReference: "" }));
    expect(noReference.certification.missingOrInvalid).toContain("Timing evidence needs a reviewable recording reference.");
  });
});
