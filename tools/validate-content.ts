import {
  auditCampaignReadiness,
  coreCampaign,
  encounterFinds,
  locationEncounters,
  locationFinds,
  validateContentPack,
  worldRoutes
} from "../src/content";

const result = validateContentPack(coreCampaign);
const readiness = auditCampaignReadiness(coreCampaign, {
  startLocationId: "location.hearthcross",
  routes: worldRoutes,
  locationEncounters,
  locationFinds,
  encounterFinds
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

if (!result.valid || !readiness.valid) {
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${coreCampaign.regions.length} regions, ${coreCampaign.npcs.length} NPCs, `
    + `${coreCampaign.quests.length} quests, ${coreCampaign.encounters.length} encounters, `
    + `and ${result.reachableQuestIds.length} reachable quest nodes. `
    + `Readiness walked ${readiness.completedMainQuestIds.length} main quests through `
    + `${readiness.activityBudget.minimumPlayerActions} minimum authored interactions.`
  );
}
