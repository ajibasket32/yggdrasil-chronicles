import { coreCampaign, validateContentPack } from "../src/content";

const result = validateContentPack(coreCampaign);

for (const warning of result.warnings) {
  console.warn(`warning: ${warning}`);
}
for (const error of result.errors) {
  console.error(`error: ${error}`);
}

if (!result.valid) {
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${coreCampaign.regions.length} regions, ${coreCampaign.npcs.length} NPCs, `
    + `${coreCampaign.quests.length} quests, ${coreCampaign.encounters.length} encounters, `
    + `and ${result.reachableQuestIds.length} reachable quest nodes.`
  );
}
