import {
  auditCampaignReadiness,
  coreCampaign,
  encounterAvailability,
  encounterFinds,
  locationEncounters,
  locationFinds,
  validateContentPack,
  validateCampaignMetadata,
  worldRoutes
} from "../src/content";

const result = validateContentPack(coreCampaign);
const metadataErrors = validateCampaignMetadata();
const readiness = auditCampaignReadiness(coreCampaign, {
  startLocationId: "location.hearthcross",
  routes: worldRoutes,
  locationEncounters,
  locationFinds,
  encounterFinds,
  encounterAvailability
});

for (const warning of result.warnings) {
  console.warn(`warning: ${warning}`);
}
for (const error of result.errors) {
  console.error(`error: ${error}`);
}
for (const warning of readiness.warnings) {
  console.warn(`warning: ${warning}`);
}
for (const error of readiness.errors) {
  console.error(`error: ${error}`);
}
for (const error of metadataErrors) {
  console.error(`error: ${error}`);
}

if (!result.valid || !readiness.valid || metadataErrors.length > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${coreCampaign.regions.length} regions, ${coreCampaign.npcs.length} NPCs, `
    + `${coreCampaign.quests.length} quests, ${coreCampaign.encounters.length} encounters, `
    + `and ${result.reachableQuestIds.length} reachable quest nodes. `
    + `Readiness walked ${readiness.completedQuestIds.length} authored quests through `
    + `${readiness.activityBudget.minimumPlayerActions} minimum authored interactions.`
  );
}
