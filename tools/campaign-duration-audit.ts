import { existsSync, readFileSync } from "node:fs";
import {
  coreCampaign,
  dialogueByNpcId,
  encounterFinds,
  locationEncounters,
  locationFinds,
  npcs,
  recruitProfiles
} from "../src/content";

/**
 * This is deliberately a certification audit, not an hours estimator. Content
 * counts describe authored breadth; only an observed, completed playthrough is
 * allowed to certify the 20-hour release target.
 */

export const AUTHORED_DURATION_TARGET_MINUTES = 20 * 60;
export const TIMING_EVIDENCE_SCHEMA_VERSION = 1;

export interface CampaignTimingEvidence {
  readonly schemaVersion: number;
  readonly runId: string;
  readonly mode: "normal-exploratory";
  readonly aiEnabled: boolean;
  readonly campaignComplete: boolean;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly elapsedMinutes: number;
  readonly completedQuestIds: readonly string[];
  /** Link, file path, or immutable archive reference reviewed by release QA. */
  readonly recordingReference: string;
  readonly notes: string;
}

export interface RegionPacingEvidence {
  readonly regionId: string;
  readonly locationKinds: readonly string[];
  readonly npcCount: number;
  readonly questTouchpointCount: number;
  readonly mainQuestTouchpointCount: number;
  readonly optionalQuestTouchpointCount: number;
  readonly encounterCount: number;
  readonly bossEncounterCount: number;
  readonly recruitmentQuestIds: readonly string[];
}

export interface DurationCertification {
  readonly status: "unverified" | "invalid" | "certified";
  readonly targetMinutes: number;
  readonly elapsedMinutes?: number;
  readonly missingOrInvalid: readonly string[];
}

export interface CampaignDurationAuditResult {
  readonly validPacingStructure: boolean;
  readonly structuralErrors: readonly string[];
  readonly authoredQuestCount: number;
  readonly mainQuestCount: number;
  readonly optionalQuestCount: number;
  readonly dialogueLineCount: number;
  readonly consequenceCount: number;
  readonly regionEvidence: readonly RegionPacingEvidence[];
  readonly certification: DurationCertification;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function regionsForObjective(kind: string, targetId: string): string[] {
  if (kind === "travel") {
    return coreCampaign.locations.filter(({ id }) => id === targetId).map(({ regionId }) => regionId);
  }
  if (kind === "talk") {
    const npc = npcs.find(({ id }) => id === targetId);
    const location = coreCampaign.locations.find(({ id }) => id === npc?.locationId);
    return location ? [location.regionId] : [];
  }
  if (kind === "defeat") {
    const encounterIds = coreCampaign.encounters
      .filter(({ enemyIds }) => enemyIds.includes(targetId))
      .map(({ id }) => id);
    return unique(Object.entries(locationEncounters).flatMap(([locationId, placed]) =>
      placed.some((encounterId) => encounterIds.includes(encounterId))
        ? coreCampaign.locations.filter(({ id }) => id === locationId).map(({ regionId }) => regionId)
        : []
    ));
  }
  if (kind === "collect") {
    const directRegions = Object.entries(locationFinds).flatMap(([locationId, finds]) =>
      finds.some(([itemId]) => itemId === targetId)
        ? coreCampaign.locations.filter(({ id }) => id === locationId).map(({ regionId }) => regionId)
        : []
    );
    const encounterIds = Object.entries(encounterFinds)
      .filter(([, finds]) => finds.some(([itemId]) => itemId === targetId))
      .map(([encounterId]) => encounterId);
    const encounterRegions = Object.entries(locationEncounters).flatMap(([locationId, placed]) =>
      placed.some((encounterId) => encounterIds.includes(encounterId))
        ? coreCampaign.locations.filter(({ id }) => id === locationId).map(({ regionId }) => regionId)
        : []
    );
    return unique([...directRegions, ...encounterRegions]);
  }
  return [];
}

function regionPacingEvidence(): RegionPacingEvidence[] {
  return coreCampaign.regions.map((region) => {
    const locationIds = new Set(coreCampaign.locations
      .filter(({ regionId }) => regionId === region.id)
      .map(({ id }) => id));
    const questIds = coreCampaign.quests.filter((quest) => quest.steps.some((step) =>
      regionsForObjective(step.kind, step.targetId).includes(region.id)
    ));
    const encounterIds = unique(Object.entries(locationEncounters).flatMap(([locationId, ids]) =>
      locationIds.has(locationId) ? [...ids] : []
    ));
    const recruitmentQuestIds = recruitProfiles
      .filter((profile) => {
        const quest = coreCampaign.quests.find(({ id }) => id === profile.recruitmentQuestId);
        return quest?.steps.some((step) => regionsForObjective(step.kind, step.targetId).includes(region.id));
      })
      .map(({ recruitmentQuestId }) => recruitmentQuestId);
    return {
      regionId: region.id,
      locationKinds: unique(coreCampaign.locations
        .filter(({ regionId }) => regionId === region.id)
        .map(({ kind }) => kind)),
      npcCount: npcs.filter(({ locationId }) => locationIds.has(locationId)).length,
      questTouchpointCount: questIds.length,
      mainQuestTouchpointCount: questIds.filter(({ mainStory }) => mainStory).length,
      optionalQuestTouchpointCount: questIds.filter(({ mainStory }) => !mainStory).length,
      encounterCount: encounterIds.length,
      bossEncounterCount: coreCampaign.encounters.filter(({ id, boss }) => boss && encounterIds.includes(id)).length,
      recruitmentQuestIds
    };
  });
}

function validateEvidence(evidence: CampaignTimingEvidence | undefined): DurationCertification {
  const targetMinutes = AUTHORED_DURATION_TARGET_MINUTES;
  if (!evidence) {
    return {
      status: "unverified",
      targetMinutes,
      missingOrInvalid: [
        "No observed full-playthrough timing evidence was supplied.",
        "Run a fresh, offline normal-exploratory route and record all authored quest IDs before certifying the target."
      ]
    };
  }
  const issues: string[] = [];
  const authoredQuestIds = coreCampaign.quests.map(({ id }) => id);
  const completed = new Set(evidence.completedQuestIds);
  if (evidence.schemaVersion !== TIMING_EVIDENCE_SCHEMA_VERSION) issues.push("Unsupported timing evidence schema version.");
  if (!evidence.runId.trim()) issues.push("Timing evidence needs a stable run ID.");
  if (!evidence.recordingReference.trim()) issues.push("Timing evidence needs a reviewable recording reference.");
  if (evidence.mode !== "normal-exploratory") issues.push("Timing evidence must use normal-exploratory mode.");
  if (evidence.aiEnabled) issues.push("Timing evidence must be recorded with AI disabled.");
  if (!evidence.campaignComplete) issues.push("Timing evidence does not mark the campaign complete.");
  if (!Number.isFinite(evidence.elapsedMinutes) || evidence.elapsedMinutes < targetMinutes) {
    issues.push(`Observed duration must be at least ${targetMinutes} minutes.`);
  }
  if (!evidence.notes.trim()) issues.push("Timing evidence needs playtester notes.");
  const startedAt = Date.parse(evidence.startedAt);
  const endedAt = Date.parse(evidence.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    issues.push("Timing evidence needs valid increasing start and end timestamps.");
  }
  for (const questId of authoredQuestIds) {
    if (!completed.has(questId)) issues.push(`Timing evidence is missing authored quest ${questId}.`);
  }
  return {
    status: issues.length === 0 ? "certified" : "invalid",
    targetMinutes,
    elapsedMinutes: evidence.elapsedMinutes,
    missingOrInvalid: issues
  };
}

export function auditCampaignDuration(evidence?: CampaignTimingEvidence): CampaignDurationAuditResult {
  const regionEvidence = regionPacingEvidence();
  const structuralErrors: string[] = [];
  for (const region of regionEvidence) {
    for (const requiredKind of ["town", "wilderness", "dungeon"]) {
      if (!region.locationKinds.includes(requiredKind)) structuralErrors.push(`${region.regionId} is missing a ${requiredKind}.`);
    }
    if (region.npcCount < 6) structuralErrors.push(`${region.regionId} has fewer than six named NPCs.`);
    if (region.questTouchpointCount === 0) structuralErrors.push(`${region.regionId} has no authored quest touchpoint.`);
    if (region.bossEncounterCount !== 1) structuralErrors.push(`${region.regionId} must have exactly one authored boss encounter.`);
    if (region.recruitmentQuestIds.length !== 1) structuralErrors.push(`${region.regionId} must have exactly one authored companion recruitment arc.`);
  }
  const consequenceCount = coreCampaign.quests.reduce((total, quest) => total + quest.consequences.length, 0);
  return {
    validPacingStructure: structuralErrors.length === 0,
    structuralErrors,
    authoredQuestCount: coreCampaign.quests.length,
    mainQuestCount: coreCampaign.quests.filter(({ mainStory }) => mainStory).length,
    optionalQuestCount: coreCampaign.quests.filter(({ mainStory }) => !mainStory).length,
    dialogueLineCount: Object.values(dialogueByNpcId).reduce((total, lines) => total + lines.length, 0),
    consequenceCount,
    regionEvidence,
    certification: validateEvidence(evidence)
  };
}

function readEvidence(path: string | undefined): CampaignTimingEvidence | undefined {
  if (!path || !existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as CampaignTimingEvidence;
}

function printResult(result: CampaignDurationAuditResult): void {
  console.log(`Authored breadth: ${result.authoredQuestCount} quests (${result.mainQuestCount} main, ${result.optionalQuestCount} optional), ${result.dialogueLineCount} dialogue lines, ${result.consequenceCount} persistent consequences.`);
  for (const region of result.regionEvidence) {
    console.log(`${region.regionId}: ${region.npcCount} NPCs, ${region.questTouchpointCount} quest touchpoints, ${region.encounterCount} encounters, ${region.bossEncounterCount} boss, ${region.recruitmentQuestIds.length} companion arc.`);
  }
  console.log(`20-hour certification: ${result.certification.status}${result.certification.elapsedMinutes === undefined ? "" : ` (${result.certification.elapsedMinutes} observed minutes)`}.`);
  for (const issue of [...result.structuralErrors, ...result.certification.missingOrInvalid]) console.warn(`note: ${issue}`);
  if (!result.validPacingStructure) process.exitCode = 1;
}

const invokedPath = process.argv[1]?.replaceAll("\\", "/");
if (invokedPath?.endsWith("/campaign-duration-audit.ts")) {
  const evidenceFlag = process.argv.find((argument) => argument.startsWith("--evidence="));
  const requireCertified = process.argv.includes("--require-certified");
  const result = auditCampaignDuration(readEvidence(evidenceFlag?.slice("--evidence=".length)));
  printResult(result);
  if (requireCertified && result.certification.status !== "certified") process.exitCode = 1;
}
