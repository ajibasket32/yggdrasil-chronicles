import type {
  ContentPack,
  Element,
  EncounterDefinition,
  ItemDefinition,
  LocationDefinition,
  NpcDefinition,
  QuestConsequence,
  QuestDefinition,
  RegionDefinition
} from "../shared/types";
import { dialogueByNpcId } from "./dialogue";

export { dialogueByNpcId } from "./dialogue";

export const FACTIONS = {
  rootwardens: "faction.rootwardens",
  brassCompact: "faction.brass-compact",
  lanternArchive: "faction.lantern-archive",
  freebound: "faction.freebound",
  quietChoir: "faction.quiet-choir",
  unaffiliated: "faction.unaffiliated"
} as const;

export const regions: RegionDefinition[] = [
  {
    id: "region.verdant-reach",
    name: "The Verdant Reach",
    description: "Rain-bright orchards, drowned roads, and roots carrying troubled memories.",
    recommendedLevel: [1, 8]
  },
  {
    id: "region.cinder-march",
    name: "The Cinder March",
    description: "Basalt valleys where refineries burn beside abandoned spirit kilns.",
    recommendedLevel: [7, 15]
  },
  {
    id: "region.pale-canopy",
    name: "The Pale Canopy",
    description: "A high white forest suspended above a buried observatory city.",
    recommendedLevel: [14, 22]
  }
];

export const locations: LocationDefinition[] = [
  {
    id: "location.hearthcross",
    regionId: "region.verdant-reach",
    name: "Hearthcross",
    kind: "town",
    connections: ["location.mossroad"],
    mapKey: "map.hearthcross"
  },
  {
    id: "location.mossroad",
    regionId: "region.verdant-reach",
    name: "The Mossroad",
    kind: "wilderness",
    connections: ["location.hearthcross", "location.hollow-root", "location.emberwake"],
    mapKey: "map.mossroad"
  },
  {
    id: "location.hollow-root",
    regionId: "region.verdant-reach",
    name: "Hollow Root",
    kind: "dungeon",
    // The deep tunnels reach the Silent Kiln, turning the world graph from a
    // straight line into a loop: a party can go out one way and come home the
    // other, and an under-levelled region can be approached from either side.
    connections: ["location.mossroad", "location.silent-kiln"],
    mapKey: "map.hollow-root"
  },
  {
    id: "location.emberwake",
    regionId: "region.cinder-march",
    name: "Emberwake",
    kind: "town",
    connections: ["location.mossroad", "location.ashfall-trail"],
    mapKey: "map.emberwake"
  },
  {
    id: "location.ashfall-trail",
    regionId: "region.cinder-march",
    name: "Ashfall Trail",
    kind: "wilderness",
    connections: ["location.emberwake", "location.silent-kiln", "location.larkspire"],
    mapKey: "map.ashfall-trail"
  },
  {
    id: "location.silent-kiln",
    regionId: "region.cinder-march",
    name: "The Silent Kiln",
    kind: "dungeon",
    connections: ["location.ashfall-trail", "location.hollow-root"],
    mapKey: "map.silent-kiln"
  },
  {
    id: "location.larkspire",
    regionId: "region.pale-canopy",
    name: "Larkspire",
    kind: "town",
    connections: ["location.ashfall-trail", "location.whitebough"],
    mapKey: "map.larkspire"
  },
  {
    id: "location.whitebough",
    regionId: "region.pale-canopy",
    name: "Whitebough Traverse",
    kind: "wilderness",
    connections: ["location.larkspire", "location.starless-vault"],
    mapKey: "map.whitebough"
  },
  {
    id: "location.starless-vault",
    regionId: "region.pale-canopy",
    name: "Starless Vault",
    kind: "dungeon",
    connections: ["location.whitebough"],
    mapKey: "map.starless-vault"
  }
];

export type RouteDirection = "north" | "east" | "south" | "west";

export interface WorldRoute {
  fromId: string;
  toId: string;
  direction: RouteDirection;
}

export const worldRoutes: readonly WorldRoute[] = [
  { fromId: "location.hearthcross", toId: "location.mossroad", direction: "east" },
  { fromId: "location.mossroad", toId: "location.hearthcross", direction: "west" },
  { fromId: "location.mossroad", toId: "location.hollow-root", direction: "north" },
  { fromId: "location.hollow-root", toId: "location.mossroad", direction: "south" },
  { fromId: "location.mossroad", toId: "location.emberwake", direction: "east" },
  { fromId: "location.emberwake", toId: "location.mossroad", direction: "west" },
  { fromId: "location.emberwake", toId: "location.ashfall-trail", direction: "east" },
  { fromId: "location.ashfall-trail", toId: "location.emberwake", direction: "west" },
  { fromId: "location.ashfall-trail", toId: "location.silent-kiln", direction: "north" },
  { fromId: "location.silent-kiln", toId: "location.ashfall-trail", direction: "south" },
  // The kiln tunnels break west into the Hollow Root, closing the loop.
  { fromId: "location.hollow-root", toId: "location.silent-kiln", direction: "east" },
  { fromId: "location.silent-kiln", toId: "location.hollow-root", direction: "west" },
  { fromId: "location.ashfall-trail", toId: "location.larkspire", direction: "east" },
  { fromId: "location.larkspire", toId: "location.ashfall-trail", direction: "west" },
  { fromId: "location.larkspire", toId: "location.whitebough", direction: "east" },
  { fromId: "location.whitebough", toId: "location.larkspire", direction: "west" },
  { fromId: "location.whitebough", toId: "location.starless-vault", direction: "east" },
  { fromId: "location.starless-vault", toId: "location.whitebough", direction: "west" }
];

type NpcSeed = readonly [
  id: string,
  name: string,
  role: string,
  locationId: string,
  factionId: string,
  assetTag: string
];

const npcSeeds: NpcSeed[] = [
  ["mara-vell", "Mara Vell", "Hearthcross reeve", "location.hearthcross", FACTIONS.rootwardens, "portrait.warden"],
  ["tovin-ash", "Tovin Ash", "Wayfarer scout", "location.hearthcross", FACTIONS.freebound, "portrait.scout"],
  ["senna-brook", "Senna Brook", "Orchard tender", "location.hearthcross", FACTIONS.unaffiliated, "portrait.grower"],
  ["orren-pike", "Orren Pike", "Rootway cartographer", "location.hearthcross", FACTIONS.lanternArchive, "portrait.scholar"],
  ["joryn-hale", "Joryn Hale", "Innkeeper and rumor keeper", "location.hearthcross", FACTIONS.unaffiliated, "portrait.innkeeper"],
  ["veska-reed", "Veska Reed", "Rootwarden medic", "location.hearthcross", FACTIONS.rootwardens, "portrait.medic"],
  ["fen-til", "Fen Til", "Floodplain ferrier", "location.mossroad", FACTIONS.freebound, "portrait.guide"],
  ["ilas-morn", "Ilas Morn", "Memory-glass salvager", "location.mossroad", FACTIONS.brassCompact, "portrait.salvager"],
  ["pella-wren", "Pella Wren", "Traveling storyteller", "location.mossroad", FACTIONS.unaffiliated, "portrait.bard"],
  ["old-cairn", "Old Cairn", "Root listener", "location.hollow-root", FACTIONS.quietChoir, "portrait.listener"],
  ["ira-sorn", "Ira Sorn", "Compact factor", "location.emberwake", FACTIONS.brassCompact, "portrait.factor"],
  ["brannic-quill", "Brannic Quill", "Foundry union speaker", "location.emberwake", FACTIONS.unaffiliated, "portrait.smith"],
  ["keva-dross", "Keva Dross", "Kiln delver", "location.emberwake", FACTIONS.freebound, "portrait.delver"],
  ["hett-copper", "Hett Copper", "Resin-glass artisan", "location.emberwake", FACTIONS.brassCompact, "portrait.artisan"],
  ["nema-slate", "Nema Slate", "Ash spirit keeper", "location.emberwake", FACTIONS.rootwardens, "portrait.keeper"],
  ["solvi-renn", "Solvi Renn", "Lantern investigator", "location.emberwake", FACTIONS.lanternArchive, "portrait.investigator"],
  ["cask-ember", "Cask Ember", "Caravan cook", "location.ashfall-trail", FACTIONS.freebound, "portrait.cook"],
  ["adra-flint", "Adra Flint", "Strike captain", "location.ashfall-trail", FACTIONS.unaffiliated, "portrait.captain"],
  ["mell-ochre", "Mell Ochre", "Quiet Choir pilgrim", "location.ashfall-trail", FACTIONS.quietChoir, "portrait.pilgrim"],
  ["yarrow-kest", "Yarrow Kest", "Kiln-bound memory", "location.silent-kiln", FACTIONS.unaffiliated, "portrait.echo"],
  ["sable-voss", "Sable Voss", "Larkspire astronomer", "location.larkspire", FACTIONS.lanternArchive, "portrait.astronomer"],
  ["eira-lune", "Eira Lune", "Canopy bridgekeeper", "location.larkspire", FACTIONS.rootwardens, "portrait.bridgekeeper"],
  ["corin-mist", "Corin Mist", "Archive conservator", "location.larkspire", FACTIONS.lanternArchive, "portrait.conservator"],
  ["thyme-vale", "Thyme Vale", "Frost apothecary", "location.larkspire", FACTIONS.unaffiliated, "portrait.apothecary"],
  ["rook-silva", "Rook Silva", "Freebound climber", "location.larkspire", FACTIONS.freebound, "portrait.climber"],
  ["mother-hush", "Mother Hush", "Choir cantor", "location.whitebough", FACTIONS.quietChoir, "portrait.cantor"],
  ["lenn-auric", "Lenn Auric", "Compact envoy", "location.whitebough", FACTIONS.brassCompact, "portrait.envoy"],
  ["otis-snow", "Otis Snow", "Lost courier", "location.whitebough", FACTIONS.unaffiliated, "portrait.courier"],
  ["thea-nacre", "Thea Nacre", "Buried-city custodian", "location.starless-vault", FACTIONS.lanternArchive, "portrait.custodian"],
  ["varn-rootless", "Varn Rootless", "Severance architect", "location.starless-vault", FACTIONS.quietChoir, "portrait.architect"]
];

export const npcs: NpcDefinition[] = npcSeeds.map(
  ([id, name, role, locationId, factionId, assetTag]) => ({
    id: `npc.${id}`,
    name,
    role,
    locationId,
    factionId,
    assetTag,
    dialogueId: `dialogue.${id}`
  })
);

const step = (
  kind: QuestDefinition["steps"][number]["kind"],
  targetId: string,
  count = 1
): QuestDefinition["steps"][number] => ({ kind, targetId, count });

/** A `deliver` step names both the item carried and the NPC it is handed to. */
const deliver = (
  itemId: string,
  recipientId: string,
  count = 1
): QuestDefinition["steps"][number] => ({ kind: "deliver", targetId: itemId, count, recipientId });

type QuestSeed = {
  id: string;
  title: string;
  summary: string;
  prerequisites?: string[];
  steps: QuestDefinition["steps"];
  rewardTier?: QuestDefinition["rewardTier"];
  mainStory?: boolean;
  /** World flags that must already hold before this quest becomes available. */
  requiredFlags?: QuestDefinition["requiredFlags"];
  /** Hidden quests are authored but not listed until their flag reveals them. */
  hidden?: boolean;
  failure?: QuestDefinition["failure"];
};

const mainQuestSeeds: QuestSeed[] = [
  {
    id: "first-silence",
    title: "The First Silence",
    summary: "Ask Hearthcross why the eastern rootway no longer sings.",
    steps: [step("talk", "npc.mara-vell"), step("talk", "npc.orren-pike")],
    mainStory: true
  },
  {
    id: "marks-in-rain",
    title: "Marks in the Rain",
    summary: "Follow fresh cart scars beyond the orchard wall.",
    prerequisites: ["quest.first-silence"],
    steps: [step("travel", "location.mossroad"), step("collect", "item.brass-rivet", 3)],
    mainStory: true
  },
  {
    id: "hollow-witness",
    title: "The Hollow Witness",
    summary: "Descend into the first silent root and recover its last intact memory.",
    prerequisites: ["quest.marks-in-rain"],
    steps: [step("travel", "location.hollow-root"), step("defeat", "enemy.root-gnawer", 4), step("defeat", "enemy.mire-antler")],
    rewardTier: "major",
    mainStory: true
  },
  {
    id: "weight-of-evidence",
    title: "The Weight of Evidence",
    summary: "Choose who receives the memory rescued from Hollow Root.",
    prerequisites: ["quest.hollow-witness"],
    steps: [step("talk", "npc.mara-vell"), step("talk", "npc.orren-pike")],
    mainStory: true
  },
  {
    id: "road-of-cinders",
    title: "Road of Cinders",
    summary: "Carry Hearthcross's warning through the ash passes.",
    prerequisites: ["quest.weight-of-evidence"],
    steps: [step("travel", "location.emberwake"), step("talk", "npc.ira-sorn")],
    mainStory: true
  },
  {
    id: "foundry-accord",
    title: "A Foundry Accord",
    summary: "Win safe passage by resolving the refinery walkout.",
    prerequisites: ["quest.road-of-cinders"],
    steps: [step("talk", "npc.brannic-quill"), step("talk", "npc.ira-sorn")],
    mainStory: true
  },
  {
    id: "ash-remembers",
    title: "Ash Remembers",
    summary: "Collect memories shed by spirits on the Ashfall Trail.",
    prerequisites: ["quest.foundry-accord"],
    steps: [step("travel", "location.ashfall-trail"), step("collect", "item.ash-memory", 4)],
    mainStory: true
  },
  {
    id: "silent-kiln",
    title: "The Silent Kiln",
    summary: "Enter the abandoned kiln and find the source of its impossible heat.",
    prerequisites: ["quest.ash-remembers"],
    steps: [step("travel", "location.silent-kiln"), step("defeat", "enemy.cinder-wraith", 5), step("defeat", "enemy.kiln-heart")],
    rewardTier: "major",
    mainStory: true
  },
  {
    id: "cutters-ledger",
    title: "The Cutters' Ledger",
    summary: "Expose the network financing the severed rootways.",
    prerequisites: ["quest.silent-kiln"],
    steps: [step("collect", "item.severance-ledger"), step("talk", "npc.solvi-renn")],
    mainStory: true
  },
  {
    id: "stars-out-of-place",
    title: "Stars Out of Place",
    summary: "Follow the ledger north to an observatory with contradictory charts.",
    prerequisites: ["quest.cutters-ledger"],
    steps: [step("travel", "location.larkspire"), step("talk", "npc.sable-voss")],
    mainStory: true
  },
  {
    id: "bridge-of-bonewood",
    title: "Bridge of Bonewood",
    summary: "Reopen the canopy route without killing its ailing root.",
    prerequisites: ["quest.stars-out-of-place"],
    steps: [step("talk", "npc.eira-lune"), step("collect", "item.frost-resin", 3)],
    mainStory: true
  },
  {
    id: "choir-without-voices",
    title: "A Choir Without Voices",
    summary: "Learn why the Quiet Choir wants the present age forgotten.",
    prerequisites: ["quest.bridge-of-bonewood"],
    steps: [step("travel", "location.whitebough"), step("talk", "npc.mother-hush")],
    mainStory: true
  },
  {
    id: "buried-constellation",
    title: "The Buried Constellation",
    summary: "Navigate the buried observatory beneath the white branches.",
    prerequisites: ["quest.choir-without-voices"],
    steps: [step("travel", "location.starless-vault"), step("collect", "item.star-key", 3)],
    mainStory: true
  },
  {
    id: "architect-of-severance",
    title: "Architect of Severance",
    summary: "Confront the mind behind the rootway cuts.",
    prerequisites: ["quest.buried-constellation"],
    steps: [step("talk", "npc.varn-rootless"), step("defeat", "enemy.varn-rootless")],
    rewardTier: "boss",
    mainStory: true
  },
  {
    id: "a-new-concord",
    title: "A New Concord",
    summary: "Decide what will replace the failing Rootbound Concord.",
    prerequisites: ["quest.architect-of-severance"],
    steps: [step("talk", "npc.mara-vell"), step("talk", "npc.ira-sorn"), step("talk", "npc.sable-voss")],
    rewardTier: "major",
    mainStory: true
  }
];

const regionalQuestSeeds: QuestSeed[] = [
  { id: "medicine-in-the-mud", title: "Medicine in the Mud", summary: "Recover vesleaf for Hearthcross's clinic.", steps: [step("collect", "item.vesleaf", 5), deliver("item.vesleaf", "npc.veska-reed", 5)] },
  { id: "storytellers-toll", title: "The Storyteller's Toll", summary: "Find the ending Pella lost on the flooded road.", steps: [step("travel", "location.mossroad"), step("talk", "npc.pella-wren")] },
  { id: "ferriers-lantern", title: "Ferrier's Lantern", summary: "Relight Fen's route markers before nightfall.", steps: [step("collect", "item.lantern-wick", 3), deliver("item.lantern-wick", "npc.fen-til", 3)] },
  { id: "salvagers-debt", title: "A Salvager's Debt", summary: "Choose whether a recovered memory belongs to its family or finder.", steps: [step("talk", "npc.ilas-morn"), step("talk", "npc.senna-brook")], rewardTier: "standard" },
  { id: "tovins-company", title: "Tovin's Company", summary: "Help Tovin face the route where their company vanished.", prerequisites: ["quest.marks-in-rain"], steps: [step("defeat", "enemy.briar-wolf", 3), step("talk", "npc.tovin-ash")], rewardTier: "major" },
  { id: "glass-and-bread", title: "Glass and Bread", summary: "Settle a refinery ration dispute before it becomes a riot.", steps: [step("talk", "npc.hett-copper"), step("talk", "npc.brannic-quill")] },
  { id: "keepers-coals", title: "The Keeper's Coals", summary: "Gather calm embers for Nema's spirit braziers.", steps: [step("collect", "item.calm-ember", 4), deliver("item.calm-ember", "npc.nema-slate", 4)] },
  { id: "cookfire-compact", title: "Cookfire Compact", summary: "Trade trail spices among three wary caravans.", steps: [step("collect", "item.ash-spice", 3), deliver("item.ash-spice", "npc.cask-ember", 3)] },
  // Holding a line is enduring, not hunting: `survive` asks the party to last
  // the surge rather than to chase a kill count across the region.
  { id: "adras-line", title: "Adra's Line", summary: "Protect striking workers from an ash-spirit surge.", prerequisites: ["quest.foundry-accord"], steps: [step("survive", "encounter.ashfall-motes", 3), step("talk", "npc.adra-flint")], rewardTier: "major" },
  { id: "kevas-last-descent", title: "Keva's Last Descent", summary: "Return a delver's token to the Silent Kiln.", prerequisites: ["quest.ash-remembers"], steps: [step("travel", "location.silent-kiln"), step("collect", "item.delver-token"), step("talk", "npc.keva-dross")] },
  { id: "frost-for-thyme", title: "Frost for Thyme", summary: "Collect resin crystals before they thaw.", steps: [step("collect", "item.frost-resin", 4), step("talk", "npc.thyme-vale")] },
  { id: "rooks-high-road", title: "Rook's High Road", summary: "Chart a safer climb through Whitebough.", steps: [step("travel", "location.whitebough"), step("talk", "npc.rook-silva")] },
  { id: "courier-in-white", title: "Courier in White", summary: "Find Otis and deliver the letter he protected.", steps: [step("talk", "npc.otis-snow"), step("talk", "npc.corin-mist")] },
  // Failure with a recovery branch, per GAME_DESIGN's promise that a lost
  // main-story thread always leaves another way forward. Restoring the
  // Archive's own record first means the contested memory is gone; the
  // recovery quest is the attempt to reconstruct it from fragments instead.
  {
    id: "conservators-choice",
    title: "The Conservator's Choice",
    summary: "Decide which damaged memory the Archive restores.",
    prerequisites: ["quest.stars-out-of-place"],
    steps: [step("talk", "npc.corin-mist"), step("collect", "item.memory-shard", 3)],
    failure: { whenFlag: "outcome.quest.what-the-tree-forgot", equals: true, recoveryQuestId: "quest.conservators-amends" }
  },
  {
    id: "conservators-amends",
    title: "The Conservator's Amends",
    summary: "Rebuild what the Archive could not save, from the fragments it discarded.",
    steps: [step("collect", "item.memory-shard", 4), step("talk", "npc.corin-mist")],
    rewardTier: "major",
    requiredFlags: [{ key: "outcome.quest.what-the-tree-forgot", equals: true }]
  },
  { id: "eiras-burden", title: "Eira's Burden", summary: "Learn why the bridgekeeper refuses to leave her post.", prerequisites: ["quest.bridge-of-bonewood"], steps: [step("talk", "npc.eira-lune"), step("talk", "npc.thea-nacre")], rewardTier: "major" }
];

const hiddenQuestSeeds: QuestSeed[] = [
  { id: "root-that-dreams", title: "The Root That Dreams", summary: "Follow a melody heard only while standing still.", prerequisites: ["quest.hollow-witness"], steps: [step("talk", "npc.old-cairn"), step("collect", "item.dream-resin")], rewardTier: "major" },
  { id: "yarrow-speaks", title: "Yarrow Speaks", summary: "Restore a name erased from the Silent Kiln.", prerequisites: ["quest.silent-kiln"], steps: [step("talk", "npc.yarrow-kest"), step("collect", "item.yarrow-seal")], rewardTier: "major" },
  { id: "unburned-recipe", title: "The Unburned Recipe", summary: "Cook a meal using an ember that gives no heat.", steps: [step("collect", "item.cold-ember"), step("talk", "npc.cask-ember")] },
  { id: "thirteenth-star", title: "The Thirteenth Star", summary: "Align the observatory to a star absent from every chart.", prerequisites: ["quest.buried-constellation"], steps: [step("collect", "item.star-key", 3), step("talk", "npc.sable-voss")], rewardTier: "major" },
  { id: "what-the-tree-forgot", title: "What the Tree Forgot", summary: "Piece together a memory the world tree rejected.", prerequisites: ["quest.choir-without-voices"], steps: [step("collect", "item.memory-shard", 7), step("talk", "npc.mother-hush")], rewardTier: "major" }
];

const authoredSpecialConsequences: Readonly<Record<string, readonly QuestConsequence[]>> = {
  "quest.silent-kiln": [
    { type: "adjust_faction", factionId: FACTIONS.rootwardens, amount: 3 },
    { type: "adjust_faction", factionId: FACTIONS.brassCompact, amount: 3 }
  ],
  "quest.architect-of-severance": [
    { type: "adjust_faction", factionId: FACTIONS.freebound, amount: 4 },
    { type: "adjust_faction", factionId: FACTIONS.lanternArchive, amount: 4 },
    { type: "adjust_faction", factionId: FACTIONS.quietChoir, amount: -3 }
  ]
};

function completionConsequences(seed: QuestSeed): QuestConsequence[] {
  const questId = `quest.${seed.id}`;
  const mainStory = seed.mainStory ?? false;
  const talkNpcIds = [...new Set(
    seed.steps.filter(({ kind }) => kind === "talk").map(({ targetId }) => targetId)
  )];
  const factionIds = [...new Set(
    talkNpcIds
      .map((npcId) => npcs.find(({ id }) => id === npcId)?.factionId)
      .filter((factionId): factionId is string => Boolean(factionId) && factionId !== FACTIONS.unaffiliated)
  )];
  return [
    ...talkNpcIds.map((npcId): QuestConsequence => ({
      type: "adjust_relationship",
      npcId,
      axis: mainStory ? "respect" : "trust",
      amount: mainStory ? 6 : 4
    })),
    ...factionIds.map((factionId): QuestConsequence => ({
      type: "adjust_faction",
      factionId,
      amount: mainStory ? 3 : 2
    })),
    { type: "set_flag", key: `outcome.${questId}`, value: true },
    ...(authoredSpecialConsequences[questId] ?? [])
  ];
}

const makeQuests = (seeds: QuestSeed[]): QuestDefinition[] =>
  seeds.map((seed) => ({
    id: `quest.${seed.id}`,
    title: seed.title,
    summary: seed.summary,
    prerequisites: seed.prerequisites ?? [],
    steps: seed.steps,
    rewardTier: seed.rewardTier ?? "minor",
    mainStory: seed.mainStory ?? false,
    consequences: completionConsequences(seed),
    ...(seed.requiredFlags ? { requiredFlags: seed.requiredFlags } : {}),
    ...(seed.hidden ? { hidden: true } : {}),
    ...(seed.failure ? { failure: seed.failure } : {})
  }));

export const quests: QuestDefinition[] = makeQuests([
  ...mainQuestSeeds,
  ...regionalQuestSeeds,
  ...hiddenQuestSeeds
]);

/**
 * `level` is authored, never derived from the party. Scaling enemies to the
 * party average made enemy stats grow faster than the player's, so levelling
 * up narrowed the party's margin — the inversion this field removes. Levels
 * track each encounter's region band (Verdant 1-8, Cinder 7-15, Pale 14-22)
 * and its position within that region, so arriving under-levelled is a real,
 * recoverable difficulty rather than an invisible tax on progress.
 */
export const encounters: EncounterDefinition[] = [
  { id: "encounter.mossroad-foragers", name: "Briar Foragers", enemyIds: ["enemy.briar-wolf", "enemy.root-gnawer"], rewardTier: "minor", boss: false, level: 2 },
  { id: "encounter.flooded-grove", name: "Flooded Grove", enemyIds: ["enemy.mireling", "enemy.mireling", "enemy.root-gnawer"], rewardTier: "standard", boss: false, level: 4 },
  { id: "encounter.mire-antler", name: "Mire Antler", enemyIds: ["enemy.mire-antler"], rewardTier: "major", boss: true, level: 7 },
  { id: "encounter.ashfall-motes", name: "Ashfall Motes", enemyIds: ["enemy.ash-mote", "enemy.ash-mote", "enemy.cinder-hound"], rewardTier: "standard", boss: false, level: 9 },
  { id: "encounter.kiln-watch", name: "Kiln Watch", enemyIds: ["enemy.cinder-wraith", "enemy.brass-sentinel"], rewardTier: "major", boss: false, level: 12 },
  { id: "encounter.kiln-heart", name: "The Kiln Heart", enemyIds: ["enemy.kiln-heart"], rewardTier: "major", boss: true, level: 14 },
  { id: "encounter.whitebough-hunt", name: "Whitebough Hunt", enemyIds: ["enemy.rime-stag", "enemy.frost-moth"], rewardTier: "standard", boss: false, level: 16 },
  { id: "encounter.vault-echoes", name: "Vault Echoes", enemyIds: ["enemy.star-echo", "enemy.star-echo", "enemy.pale-custodian"], rewardTier: "major", boss: false, level: 19 },
  { id: "encounter.varn-rootless", name: "Varn, Architect of Severance", enemyIds: ["enemy.varn-rootless"], rewardTier: "boss", boss: true, level: 21 },
  // Post-game superboss. Deliberately `boss: false` so it is repeatable and so
  // the three-named-boss campaign shape is unchanged; it is gated on campaign
  // completion by the bridge, not by the boss flag.
  { id: "encounter.varn-echo", name: "The Echo of Severance", enemyIds: ["enemy.varn-echo"], rewardTier: "boss", boss: false, level: 26 }
];

/** Encounters that only appear once the main story is finished. */
export const postgameEncounterIds: readonly string[] = ["encounter.varn-echo"];

export const locationEncounters: Readonly<Record<string, readonly string[]>> = {
  "location.mossroad": ["encounter.mossroad-foragers", "encounter.flooded-grove"],
  "location.hollow-root": ["encounter.mossroad-foragers", "encounter.mire-antler"],
  "location.ashfall-trail": ["encounter.ashfall-motes"],
  "location.silent-kiln": ["encounter.kiln-watch", "encounter.kiln-heart"],
  "location.whitebough": ["encounter.whitebough-hunt"],
  "location.starless-vault": ["encounter.vault-echoes", "encounter.varn-rootless", "encounter.varn-echo"]
};

/** Ordinary fights may be selected again; named bosses permanently change the world when defeated. */
export const encounterAvailability: Readonly<Record<string, "repeatable" | "once">> = {
  "encounter.mossroad-foragers": "repeatable",
  "encounter.flooded-grove": "repeatable",
  "encounter.mire-antler": "once",
  "encounter.ashfall-motes": "repeatable",
  "encounter.kiln-watch": "repeatable",
  "encounter.kiln-heart": "once",
  "encounter.whitebough-hunt": "repeatable",
  "encounter.vault-echoes": "repeatable",
  "encounter.varn-rootless": "once",
  // Repeatable on purpose: the post-game superboss is the terminal challenge
  // players return to, not a one-time story beat.
  "encounter.varn-echo": "repeatable"
};

export type ContentFind = readonly [itemId: string, quantity: number];

export const locationFinds: Readonly<Record<string, readonly ContentFind[]>> = {
  "location.mossroad": [["item.brass-rivet", 1], ["item.vesleaf", 1]],
  "location.ashfall-trail": [["item.ash-memory", 1], ["item.ash-spice", 1]],
  "location.silent-kiln": [["item.delver-token", 1]],
  "location.whitebough": [["item.frost-resin", 1], ["item.memory-shard", 1]],
  "location.starless-vault": [["item.star-key", 1], ["item.memory-shard", 1]]
};

export const encounterFinds: Readonly<Record<string, readonly ContentFind[]>> = {
  "encounter.mossroad-foragers": [["item.brass-rivet", 2], ["item.vesleaf", 2]],
  "encounter.flooded-grove": [["item.lantern-wick", 3]],
  "encounter.mire-antler": [["item.dream-resin", 1], ["item.hearthsteel-blade", 1], ["item.kilnforge-plate", 1]],
  "encounter.ashfall-motes": [["item.ash-memory", 2], ["item.calm-ember", 2], ["item.ash-spice", 2]],
  "encounter.kiln-watch": [["item.ash-memory", 2], ["item.yarrow-seal", 1]],
  "encounter.kiln-heart": [["item.severance-ledger", 1], ["item.cold-ember", 1], ["item.emberglass-charm", 1], ["item.rootbound-edge", 1]],
  "encounter.whitebough-hunt": [["item.frost-resin", 2], ["item.memory-shard", 2]],
  "encounter.vault-echoes": [["item.star-key", 3], ["item.memory-shard", 3]],
  "encounter.varn-rootless": [["item.canopy-ward", 1], ["item.starlit-signet", 1]]
};

export const items: ItemDefinition[] = [
  { id: "item.vesleaf", name: "Vesleaf", kind: "consumable", description: "A bitter medicinal leaf that closes small wounds.", value: 18 },
  // Consumed to camp outside a settlement. Deliberately cheap and stocked
  // everywhere: it is the floor that stops a party stranding itself deep in a
  // dungeon with no focus and no coin.
  { id: "item.trail-rations", name: "Trail Rations", kind: "consumable", description: "Hard bread, smoked root, and enough tea for one night's camp.", value: 24 },
  { id: "item.root-tonic", name: "Root Tonic", kind: "consumable", description: "Restores a modest amount of vitality.", value: 45 },
  { id: "item.aether-drop", name: "Aether Drop", kind: "consumable", description: "Restores focus used by practiced forms.", value: 60 },
  { id: "item.lantern-wick", name: "Resin Lantern Wick", kind: "key", description: "A rainproof wick used along the old road.", value: 8 },
  { id: "item.brass-rivet", name: "Marked Brass Rivet", kind: "key", description: "Stamped with an erased Compact batch mark.", value: 12 },
  { id: "item.ash-memory", name: "Ash Memory", kind: "key", description: "A warm recollection caught in brittle glass.", value: 30 },
  { id: "item.severance-ledger", name: "Severance Ledger", kind: "key", description: "Records payments hidden behind refinery losses.", value: 0 },
  { id: "item.frost-resin", name: "Frost Resin", kind: "consumable", description: "Cold sap used in medicine and bridgecraft.", value: 55 },
  { id: "item.star-key", name: "Star Key", kind: "key", description: "A lens fragment shaped for an ancient mechanism.", value: 0 },
  { id: "item.memory-shard", name: "Memory Shard", kind: "key", description: "A fractured moment without a reliable owner.", value: 25 },
  { id: "item.calm-ember", name: "Calm Ember", kind: "key", description: "Glows without consuming its vessel.", value: 20 },
  { id: "item.ash-spice", name: "Ash Spice", kind: "consumable", description: "Smoky caravan seasoning with restorative warmth.", value: 22 },
  { id: "item.delver-token", name: "Delver Token", kind: "key", description: "A copper disk scratched with a safe-route oath.", value: 0 },
  { id: "item.dream-resin", name: "Dream Resin", kind: "accessory", description: "A cloudy bead that hums during sleep.", value: 180, modifiers: { maxMp: 8, wisdom: 2 }, allowedBands: ["caster"] },
  { id: "item.yarrow-seal", name: "Yarrow's Seal", kind: "key", description: "Proof that a forgotten kiln-worker once lived.", value: 0 },
  { id: "item.cold-ember", name: "Cold Ember", kind: "consumable", description: "A blue coal that tastes faintly of mint.", value: 75 },
  { id: "item.wayfarer-blade", name: "Wayfarer Blade", kind: "weapon", description: "A balanced road sword made for uncertain fights.", value: 120, modifiers: { strength: 3, dexterity: 2 }, allowedBands: ["martial"] },
  { id: "item.resin-vest", name: "Resin Vest", kind: "armor", description: "Layered cloth hardened with flexible resin.", value: 110, modifiers: { maxHp: 14, vitality: 3 } },
  // Regional gear progression: named bosses drop the next equipment tier, so
  // the starting weapon/armor/accessory are not the only gear across a full
  // campaign. Mire Antler (Verdant Reach) drops tier 2; Kiln Heart (Cinder
  // March) drops tier 2/3; Varn (Pale Canopy, final boss) drops tier 3.
  //
  // Stat modifiers live here rather than in the integration layer, so a
  // designer rebalancing gear edits one record instead of changing the price
  // in content and silently nothing else.
  { id: "item.hearthsteel-blade", name: "Hearthsteel Blade", kind: "weapon", description: "A Cinder March forge-blade tempered against root-frost.", value: 240, requiredLevel: 7, modifiers: { strength: 6, dexterity: 3 }, allowedBands: ["martial"] },
  { id: "item.kilnforge-plate", name: "Kilnforge Plate", kind: "armor", description: "Basalt-fired plate that shrugs off blunt harm.", value: 220, requiredLevel: 7, modifiers: { maxHp: 28, vitality: 5, agility: -1 } },
  { id: "item.emberglass-charm", name: "Emberglass Charm", kind: "accessory", description: "A kiln-glass bead that keeps a coal-warm focus.", value: 260, requiredLevel: 7, modifiers: { maxMp: 14, intellect: 3 }, allowedBands: ["caster"] },
  { id: "item.rootbound-edge", name: "Rootbound Edge", kind: "weapon", description: "A pale-canopy blade grown rather than forged.", value: 420, requiredLevel: 14, modifiers: { strength: 10, dexterity: 5, agility: 2 }, allowedBands: ["martial"] },
  { id: "item.canopy-ward", name: "Canopy Ward", kind: "armor", description: "White-bough lamellar that turns aside starlit harm.", value: 400, requiredLevel: 14, modifiers: { maxHp: 44, vitality: 7, wisdom: 2 } },
  { id: "item.starlit-signet", name: "Starlit Signet", kind: "accessory", description: "A ring cut from a star absent from every chart.", value: 460, requiredLevel: 14, modifiers: { maxMp: 22, intellect: 4, wisdom: 4 }, allowedBands: ["caster"] },

  // Sidegrades, one per slot per region. Two tiers per slot made every choice a
  // strict upgrade, so equipping was never a decision — you wore the newest
  // thing you owned. Each of these trades one stat away for another, so a
  // player picks against the fight ahead rather than against a bigger number.
  // Purchasable, unlike the boss-dropped tier, which keeps the shop relevant.
  { id: "item.reed-knife", name: "Reed Knife", kind: "weapon", description: "Light enough to strike twice while a sword swings once.", value: 130, modifiers: { dexterity: 5, agility: 3, strength: -1 }, allowedBands: ["martial"] },
  { id: "item.orchard-wrap", name: "Orchard Wrap", kind: "armor", description: "Woven pear-bark that keeps a body quick rather than shielded.", value: 120, modifiers: { maxHp: 6, agility: 3, wisdom: 2 } },
  { id: "item.rain-charm", name: "Rain Charm", kind: "accessory", description: "A glass drop that steadies the hand more than the mind.", value: 170, modifiers: { maxMp: 4, dexterity: 3, charisma: 2 } },
  // Caster-banded openers, so a scholarly build has its own tier-1 choice
  // rather than only the martial pair.
  { id: "item.rootwood-focus", name: "Rootwood Focus", kind: "weapon", description: "A carved branch that listens better than it strikes.", value: 135, modifiers: { intellect: 4, wisdom: 3, strength: -2 }, allowedBands: ["caster"] },
  { id: "item.warden-mantle", name: "Warden's Mantle", kind: "armor", description: "Rootwarden wool: warm, plain, and quietly stubborn.", value: 125, modifiers: { maxHp: 10, maxMp: 6, wisdom: 1 } },
  { id: "item.listener-cord", name: "Listener's Cord", kind: "accessory", description: "Knotted twine that steadies a nervous mind.", value: 165, modifiers: { maxMp: 10, wisdom: 3, agility: -1 } },

  { id: "item.slagsteel-maul", name: "Slagsteel Maul", kind: "weapon", description: "Heavy Cinder March iron: it lands hard and slowly.", value: 250, requiredLevel: 7, modifiers: { strength: 9, agility: -3 }, allowedBands: ["martial"] },
  { id: "item.kiln-censer", name: "Kiln Censer", kind: "weapon", description: "A swinging brazier that carries heat further than a blade.", value: 255, requiredLevel: 7, modifiers: { intellect: 7, maxMp: 8, vitality: -2 }, allowedBands: ["caster"] },
  { id: "item.emberweave-coat", name: "Emberweave Coat", kind: "armor", description: "Kiln-thread cloth that answers heat instead of blows.", value: 230, requiredLevel: 7, modifiers: { maxHp: 14, wisdom: 5, intellect: 2 } },
  { id: "item.slagplate-harness", name: "Slagplate Harness", kind: "armor", description: "Refinery scrap, riveted: it stops everything except haste.", value: 235, requiredLevel: 7, modifiers: { maxHp: 34, vitality: 4, agility: -3, maxMp: -4 } },
  { id: "item.foundry-seal", name: "Foundry Seal", kind: "accessory", description: "A union token that steadies a voice in a crowded room.", value: 250, requiredLevel: 7, modifiers: { charisma: 5, maxMp: 6, vitality: 2 } },
  { id: "item.ashglass-lens", name: "Ashglass Lens", kind: "accessory", description: "Smoked glass that finds the seam in anything burning.", value: 265, requiredLevel: 7, modifiers: { dexterity: 5, intellect: 3, wisdom: -1 } },

  { id: "item.whitebough-spear", name: "Whitebough Spear", kind: "weapon", description: "Pale reach: it keeps trouble further away than a blade can.", value: 430, requiredLevel: 14, modifiers: { strength: 6, dexterity: 8, vitality: 3 }, allowedBands: ["martial"] },
  { id: "item.starless-rod", name: "Starless Rod", kind: "weapon", description: "Vault-cut obsidian that answers to nothing above it.", value: 440, requiredLevel: 14, modifiers: { intellect: 11, wisdom: 4, strength: -3 }, allowedBands: ["caster"] },
  { id: "item.vaultglass-mail", name: "Vaultglass Mail", kind: "armor", description: "Observatory glass-scale: it turns aether where steel would not.", value: 410, requiredLevel: 14, modifiers: { maxHp: 22, maxMp: 16, wisdom: 6 } },
  { id: "item.bonewood-cuirass", name: "Bonewood Cuirass", kind: "armor", description: "Bridge-timber plate that trades every ounce of grace for cover.", value: 415, requiredLevel: 14, modifiers: { maxHp: 52, vitality: 8, agility: -4, dexterity: -2 } },
  { id: "item.chart-fragment", name: "Chart Fragment", kind: "accessory", description: "A sliver of a star map that sharpens judgement under pressure.", value: 450, requiredLevel: 14, modifiers: { intellect: 6, dexterity: 4, agility: 3 } },
  { id: "item.quiet-bell", name: "Quiet Bell", kind: "accessory", description: "It rings inward. Choir work, and it steadies more than it inspires.", value: 455, requiredLevel: 14, modifiers: { wisdom: 8, maxMp: 12, charisma: -2 } }
];

export const coreCampaign: ContentPack = {
  id: "core.yggdrasil-chronicles",
  version: "0.1.0",
  title: "Yggdrasil Chronicles: The Severed Concord",
  regions,
  locations,
  npcs,
  quests,
  encounters,
  items
};

export const ancestries = [
  { id: "hearthborn", name: "Hearthborn", trait: "Versatile", description: "Travel-shaped communities who adapt quickly to unfamiliar ground." },
  { id: "sylvan", name: "Sylvan", trait: "Root Listener", description: "Long-lived listeners sensitive to aether moving through wood." },
  { id: "stonekin", name: "Stonekin", trait: "Steadfast", description: "Dense-boned makers trained to bind mineral and root resin." },
  { id: "wayfarer", name: "Wayfarer", trait: "Open Road", description: "Descendants of Concord caravans, skilled at crossing cultural borders." }
] as const;

export const jobs = [
  { id: "vanguard", name: "Vanguard", role: "Front-line defender", branches: ["Bulwark", "Banneret"] },
  { id: "ranger", name: "Ranger", role: "Fast physical striker", branches: ["Pathfinder", "Beastwarden"] },
  { id: "mender", name: "Mender", role: "Healing and protection", branches: ["Lifebinder", "Dawnkeeper"] },
  { id: "shaper", name: "Aether Shaper", role: "Elemental spellcraft", branches: ["Stormcaller", "Resonant"] },
  { id: "trickster", name: "Trickster", role: "Debuffs and turn control", branches: ["Veilhand", "Gambler"] },
  { id: "warden", name: "Root Warden", role: "Nature magic and counters", branches: ["Thornspeaker", "Green Sentinel"] }
] as const;

export interface AdvancedJobDefinition {
  readonly id: string;
  readonly name: string;
  readonly baseJobId: (typeof jobs)[number]["id"];
  readonly minimumLevel: number;
  readonly signatureSkillId: string;
  /** A previously unlearned form granted the first time this branch is chosen. */
  readonly bonusSkillId: string;
}

/**
 * Each branch grants a distinct, permanently learned form (bonusSkillId,
 * defined in the runtime combat skill catalog) in addition to reordering its
 * signature skill. Branch pairs also diverge in stat emphasis; see
 * ADVANCED_JOB_STATS in src/integration/EngineGameBridge.ts.
 */
export const advancedJobs: readonly AdvancedJobDefinition[] = [
  { id: "bulwark", name: "Bulwark", baseJobId: "vanguard", minimumLevel: 4, signatureSkillId: "skill.guard-line", bonusSkillId: "skill.bastion-slam" },
  { id: "banneret", name: "Banneret", baseJobId: "vanguard", minimumLevel: 4, signatureSkillId: "skill.shield-bash", bonusSkillId: "skill.rallying-strike" },
  { id: "pathfinder", name: "Pathfinder", baseJobId: "ranger", minimumLevel: 4, signatureSkillId: "skill.quickstep", bonusSkillId: "skill.pathfinders-stride" },
  { id: "beastwarden", name: "Beastwarden", baseJobId: "ranger", minimumLevel: 4, signatureSkillId: "skill.aimed-shot", bonusSkillId: "skill.hunting-mark" },
  { id: "lifebinder", name: "Lifebinder", baseJobId: "mender", minimumLevel: 4, signatureSkillId: "skill.mend", bonusSkillId: "skill.greater-mend" },
  { id: "dawnkeeper", name: "Dawnkeeper", baseJobId: "mender", minimumLevel: 4, signatureSkillId: "skill.ward-thread", bonusSkillId: "skill.dawnfire-lance" },
  { id: "stormcaller", name: "Stormcaller", baseJobId: "shaper", minimumLevel: 4, signatureSkillId: "skill.ember-spark", bonusSkillId: "skill.storm-lance" },
  { id: "resonant", name: "Resonant", baseJobId: "shaper", minimumLevel: 4, signatureSkillId: "skill.tide-pulse", bonusSkillId: "skill.deep-resonance" },
  { id: "veilhand", name: "Veilhand", baseJobId: "trickster", minimumLevel: 4, signatureSkillId: "skill.slow-mark", bonusSkillId: "skill.veil-strike" },
  { id: "gambler", name: "Gambler", baseJobId: "trickster", minimumLevel: 4, signatureSkillId: "skill.feint", bonusSkillId: "skill.wild-gambit" },
  { id: "thornspeaker", name: "Thornspeaker", baseJobId: "warden", minimumLevel: 4, signatureSkillId: "skill.thorn-bind", bonusSkillId: "skill.bramble-snare" },
  { id: "green-sentinel", name: "Green Sentinel", baseJobId: "warden", minimumLevel: 4, signatureSkillId: "skill.rootward", bonusSkillId: "skill.verdant-bulwark" }
];

type AncestryId = (typeof ancestries)[number]["id"];
type StartingJobId = (typeof jobs)[number]["id"];

export interface StartingBuildLoadout {
  readonly id: string;
  readonly ancestryId: AncestryId;
  readonly jobId: StartingJobId;
  readonly partyRole: string;
  readonly strengths: readonly string[];
  readonly counters: readonly string[];
  readonly startingItems: readonly string[];
  readonly startingSkills: readonly string[];
  /** Negative resists the element, positive is a weakness to it. */
  readonly elementalAffinities: Partial<Record<Element, number>>;
}

/**
 * Ancestry elemental affinities. Negative resists, positive is a weakness —
 * matching `Combatant.elements`.
 *
 * These were hardcoded in `EngineGameBridge` as a chain of ternaries on the
 * ancestry id, which put a content decision in the integration layer and left
 * the authored loadouts unable to describe the character they produce. They are
 * data here, so a build preview can state them and content validation can see them.
 */
const ancestryAffinities: Readonly<Record<AncestryId, StartingBuildLoadout["elementalAffinities"]>> = {
  hearthborn: { aether: -0.1 },
  sylvan: { nature: -0.2, fire: 0.15 },
  stonekin: { earth: -0.2, lightning: 0.1 },
  wayfarer: { wind: -0.1 }
};

const ancestryLoadoutNotes: Readonly<Record<AncestryId, Pick<StartingBuildLoadout, "strengths" | "counters">>> = {
  hearthborn: { strengths: ["Flexible opening turns", "Reliable recovery"], counters: ["Focused elemental pressure", "Long attrition fights"] },
  sylvan: { strengths: ["Nature resonance", "Status awareness"], counters: ["Fire pressure", "Direct burst damage"] },
  stonekin: { strengths: ["Guard durability", "Stagger resistance"], counters: ["Slow initiative", "Armor-piercing attacks"] },
  wayfarer: { strengths: ["Fast positioning", "Item efficiency"], counters: ["Area damage", "Forced stand-your-ground fights"] }
};

const jobLoadoutNotes: Readonly<Record<StartingJobId, Omit<StartingBuildLoadout, "id" | "ancestryId" | "jobId" | "strengths" | "counters" | "elementalAffinities">>> = {
  vanguard: { partyRole: "Front-line defender", startingItems: ["item.root-tonic", "item.resin-vest"], startingSkills: ["skill.guard-line", "skill.shield-bash"] },
  ranger: { partyRole: "Fast physical striker", startingItems: ["item.root-tonic", "item.wayfarer-blade"], startingSkills: ["skill.aimed-shot", "skill.quickstep"] },
  mender: { partyRole: "Healing and protection", startingItems: ["item.root-tonic", "item.aether-drop"], startingSkills: ["skill.mend", "skill.ward-thread"] },
  shaper: { partyRole: "Elemental spellcraft", startingItems: ["item.aether-drop", "item.aether-drop"], startingSkills: ["skill.ember-spark", "skill.tide-pulse"] },
  trickster: { partyRole: "Debuffs and turn control", startingItems: ["item.root-tonic", "item.ash-spice"], startingSkills: ["skill.feint", "skill.slow-mark"] },
  warden: { partyRole: "Nature magic and counters", startingItems: ["item.vesleaf", "item.dream-resin"], startingSkills: ["skill.thorn-bind", "skill.rootward"] }
};

/** Every character-creation pairing is authored rather than inferred by the UI. */
export const startingBuildLoadouts: readonly StartingBuildLoadout[] = ancestries.flatMap((ancestry) =>
  jobs.map((job) => ({
    id: `build.${ancestry.id}.${job.id}`,
    ancestryId: ancestry.id,
    jobId: job.id,
    ...jobLoadoutNotes[job.id],
    strengths: [...ancestryLoadoutNotes[ancestry.id].strengths, job.role],
    counters: ancestryLoadoutNotes[ancestry.id].counters,
    elementalAffinities: { ...ancestryAffinities[ancestry.id] }
  }))
);

export interface RecruitProfile {
  readonly id: string;
  readonly npcId: string;
  readonly ancestryId: AncestryId;
  readonly jobId: StartingJobId;
  readonly recruitmentQuestId: string;
  readonly recruitmentMoment: string;
  readonly startingItems: readonly string[];
  readonly startingSkills: readonly string[];
}

export const recruitProfiles: readonly RecruitProfile[] = [
  {
    id: "recruit.tovin-ash",
    npcId: "npc.tovin-ash",
    ancestryId: "wayfarer",
    jobId: "ranger",
    recruitmentQuestId: "quest.tovins-company",
    recruitmentMoment: "Tovin joins after the vanished company is named and the Mossroad route is reclaimed.",
    startingItems: ["item.wayfarer-blade", "item.root-tonic"],
    // Marked Quarry is exclusive to Tovin: a scout's trained eye for a
    // vanished company's ambush routes, unavailable to a self-made Ranger.
    startingSkills: ["skill.aimed-shot", "skill.quickstep", "skill.marked-quarry"]
  },
  {
    id: "recruit.keva-dross",
    npcId: "npc.keva-dross",
    ancestryId: "stonekin",
    jobId: "vanguard",
    recruitmentQuestId: "quest.kevas-last-descent",
    recruitmentMoment: "Keva joins when the delver's oath is returned to the Silent Kiln instead of sold as a relic.",
    startingItems: ["item.resin-vest", "item.delver-token"],
    // Delver's Grit is exclusive to Keva: the endurance of someone who
    // survives collapsed kiln tunnels alone, unavailable to a self-made Vanguard.
    startingSkills: ["skill.guard-line", "skill.shield-bash", "skill.delvers-grit"]
  },
  {
    id: "recruit.eira-lune",
    npcId: "npc.eira-lune",
    ancestryId: "sylvan",
    jobId: "mender",
    recruitmentQuestId: "quest.eiras-burden",
    recruitmentMoment: "Eira joins after entrusting the repaired bridge to the people who now understand its living burden.",
    startingItems: ["item.aether-drop", "item.frost-resin"],
    // Bridgekeeper's Warding is exclusive to Eira: the living-wood defense
    // she used to hold her bridge, unavailable to a self-made Mender.
    startingSkills: ["skill.mend", "skill.ward-thread", "skill.bridgekeepers-warding"]
  }
];

export interface VendorProfile {
  readonly id: string;
  readonly npcId: string;
  readonly shopName: string;
  /** Catalog offered for purchase; boss-dropped gear tiers are deliberately excluded so combat progression stays meaningful. */
  readonly catalogItemIds: readonly string[];
  /** Fraction of an item's authored value paid out when the party sells it back. */
  readonly sellRate: number;
}

/**
 * One vendor per town, reusing an existing named NPC whose authored role
 * already fits trading (innkeeper, artisan, apothecary) rather than adding a
 * new NPC — the 30-NPC campaign budget is validated exactly elsewhere.
 * Regional starter/mid gear is purchasable; the two highest boss-dropped
 * tiers (Rootbound Edge/Canopy Ward/Starlit Signet) are not, so equipment
 * progression still requires defeating Varn Rootless.
 */
export const vendorProfiles: readonly VendorProfile[] = [
  {
    id: "vendor.joryn-hale",
    npcId: "npc.joryn-hale",
    shopName: "Joryn's Rainy Hearth",
    catalogItemIds: ["item.vesleaf", "item.root-tonic", "item.trail-rations", "item.aether-drop", "item.wayfarer-blade", "item.resin-vest", "item.reed-knife", "item.orchard-wrap", "item.rain-charm", "item.rootwood-focus", "item.warden-mantle", "item.listener-cord"],
    sellRate: 0.4
  },
  {
    id: "vendor.hett-copper",
    npcId: "npc.hett-copper",
    shopName: "Hett's Resin-Glass Forge",
    catalogItemIds: ["item.root-tonic", "item.trail-rations", "item.cold-ember", "item.hearthsteel-blade", "item.kilnforge-plate", "item.emberglass-charm", "item.slagsteel-maul", "item.kiln-censer", "item.emberweave-coat", "item.slagplate-harness", "item.foundry-seal", "item.ashglass-lens"],
    sellRate: 0.4
  },
  {
    id: "vendor.thyme-vale",
    npcId: "npc.thyme-vale",
    shopName: "Thyme's Frost Apothecary",
    catalogItemIds: ["item.frost-resin", "item.trail-rations", "item.cold-ember", "item.aether-drop", "item.ash-spice", "item.whitebough-spear", "item.starless-rod", "item.vaultglass-mail", "item.bonewood-cuirass", "item.chart-fragment", "item.quiet-bell"],
    sellRate: 0.4
  }
];

export interface BossPhaseMetadata {
  readonly encounterId: string;
  readonly enemyId: string;
  readonly phaseName: string;
  readonly beginsAtHealthPercent: number;
  readonly telegraph: string;
  readonly tacticalChange: string;
  readonly mechanic: "empower" | "fortify" | "root_party" | "scorch_party" | "restore_boss" | "elemental_shift";
}

export const bossPhases: readonly BossPhaseMetadata[] = [
  { encounterId: "encounter.mire-antler", enemyId: "enemy.mire-antler", phaseName: "Drowned Charge", beginsAtHealthPercent: 100, telegraph: "Water gathers around its antlers.", tacticalChange: "Its opening charge grows stronger and faster.", mechanic: "empower" },
  { encounterId: "encounter.mire-antler", enemyId: "enemy.mire-antler", phaseName: "Rooted Panic", beginsAtHealthPercent: 50, telegraph: "Its hooves split the flooded ground.", tacticalChange: "Slowing roots seize the party for one turn.", mechanic: "root_party" },
  { encounterId: "encounter.kiln-heart", enemyId: "enemy.kiln-heart", phaseName: "Banked Furnace", beginsAtHealthPercent: 100, telegraph: "The kiln breathes through sealed vents.", tacticalChange: "Its sealed shell hardens against physical and aether pressure.", mechanic: "fortify" },
  { encounterId: "encounter.kiln-heart", enemyId: "enemy.kiln-heart", phaseName: "Open Crucible", beginsAtHealthPercent: 45, telegraph: "The central seal fractures in white fire.", tacticalChange: "Escaping heat burns every living party member.", mechanic: "scorch_party" },
  { encounterId: "encounter.varn-rootless", enemyId: "enemy.varn-rootless", phaseName: "Measured Severance", beginsAtHealthPercent: 100, telegraph: "Varn marks a rootway line across the arena.", tacticalChange: "Varn's measured cuts gain force and initiative.", mechanic: "empower" },
  { encounterId: "encounter.varn-rootless", enemyId: "enemy.varn-rootless", phaseName: "Borrowed Chorus", beginsAtHealthPercent: 60, telegraph: "Old voices answer from the vault walls.", tacticalChange: "The chorus restores a portion of Varn's vitality.", mechanic: "restore_boss" },
  { encounterId: "encounter.varn-rootless", enemyId: "enemy.varn-rootless", phaseName: "Unmade Concord", beginsAtHealthPercent: 25, telegraph: "The marked lines converge beneath the party.", tacticalChange: "Varn changes elemental defenses for the final exchange.", mechanic: "elemental_shift" }
];

export function getDialogue(npcId: string): readonly string[] {
  const scripted = dialogueByNpcId[npcId];
  if (scripted) return scripted;
  const npc = npcs.find((candidate) => candidate.id === npcId);
  return npc
    ? [`${npc.name} watches the road for a moment.`, `"Every place remembers differently," ${npc.name} says.`]
    : ["Only the rain answers."];
}

export const MIN_AUTHORED_DIALOGUE_LINES_PER_NPC = 8;

/** Validates content-local references that are intentionally outside the shared pack contract. */
export function validateCampaignMetadata(): string[] {
  const errors: string[] = [];
  const ancestryIds = new Set(ancestries.map(({ id }) => id));
  const jobIds = new Set(jobs.map(({ id }) => id));
  const npcIds = new Set(npcs.map(({ id }) => id));
  const questIds = new Set(quests.map(({ id }) => id));
  const itemIds = new Set(items.map(({ id }) => id));
  const startingSkillIds = new Set(startingBuildLoadouts.flatMap(({ startingSkills }) => startingSkills));
  const encounterById = new Map(encounters.map((encounter) => [encounter.id, encounter]));
  const buildKeys = new Set<string>();

  for (const build of startingBuildLoadouts) {
    const key = `${build.ancestryId}.${build.jobId}`;
    if (buildKeys.has(key)) errors.push(`Duplicate starting build ${key}`);
    buildKeys.add(key);
    if (!ancestryIds.has(build.ancestryId)) errors.push(`${build.id} references unknown ancestry ${build.ancestryId}`);
    if (!jobIds.has(build.jobId)) errors.push(`${build.id} references unknown job ${build.jobId}`);
    for (const itemId of build.startingItems) if (!itemIds.has(itemId)) errors.push(`${build.id} references unknown item ${itemId}`);
  }
  for (const ancestry of ancestries) for (const job of jobs) {
    if (!buildKeys.has(`${ancestry.id}.${job.id}`)) errors.push(`Missing starting build ${ancestry.id}.${job.id}`);
  }
  const advancedJobIds = new Set<string>();
  const bonusSkillIds = new Set<string>();
  for (const job of advancedJobs) {
    if (advancedJobIds.has(job.id)) errors.push(`Duplicate advanced job ${job.id}`);
    advancedJobIds.add(job.id);
    if (!jobIds.has(job.baseJobId)) errors.push(`${job.id} references unknown base job ${job.baseJobId}`);
    if (job.minimumLevel < 2) errors.push(`${job.id} has an invalid minimum level`);
    if (!startingSkillIds.has(job.signatureSkillId)) errors.push(`${job.id} references unknown signature skill ${job.signatureSkillId}`);
    if (!job.bonusSkillId.trim()) errors.push(`${job.id} is missing a bonus skill`);
    if (startingSkillIds.has(job.bonusSkillId)) errors.push(`${job.id} bonus skill ${job.bonusSkillId} must be new, not an already-known starting skill`);
    if (job.bonusSkillId === job.signatureSkillId) errors.push(`${job.id} bonus skill must differ from its signature skill`);
    if (bonusSkillIds.has(job.bonusSkillId)) errors.push(`Duplicate bonus skill ${job.bonusSkillId} across advanced jobs`);
    bonusSkillIds.add(job.bonusSkillId);
  }
  for (const recruit of recruitProfiles) {
    if (!npcIds.has(recruit.npcId)) errors.push(`${recruit.id} references unknown NPC ${recruit.npcId}`);
    if (!questIds.has(recruit.recruitmentQuestId)) errors.push(`${recruit.id} references unknown quest ${recruit.recruitmentQuestId}`);
    if (!ancestryIds.has(recruit.ancestryId)) errors.push(`${recruit.id} references unknown ancestry ${recruit.ancestryId}`);
    if (!jobIds.has(recruit.jobId)) errors.push(`${recruit.id} references unknown job ${recruit.jobId}`);
    for (const itemId of recruit.startingItems) if (!itemIds.has(itemId)) errors.push(`${recruit.id} references unknown item ${itemId}`);
  }
  const vendorIds = new Set<string>();
  for (const vendor of vendorProfiles) {
    if (vendorIds.has(vendor.id)) errors.push(`Duplicate vendor ${vendor.id}`);
    vendorIds.add(vendor.id);
    if (!npcIds.has(vendor.npcId)) errors.push(`${vendor.id} references unknown NPC ${vendor.npcId}`);
    if (vendor.catalogItemIds.length === 0) errors.push(`${vendor.id} has an empty catalog`);
    if (vendor.sellRate <= 0 || vendor.sellRate > 1) errors.push(`${vendor.id} has an invalid sell rate`);
    for (const itemId of vendor.catalogItemIds) {
      if (!itemIds.has(itemId)) errors.push(`${vendor.id} references unknown item ${itemId}`);
      if (items.find(({ id }) => id === itemId)?.kind === "key") errors.push(`${vendor.id} cannot sell key item ${itemId}`);
    }
  }
  for (const npc of npcs) {
    if (vendorProfiles.filter((vendor) => vendor.npcId === npc.id).length > 1) {
      errors.push(`${npc.id} is assigned to more than one vendor profile`);
    }
  }
  for (const encounter of encounters) {
    const availability = encounterAvailability[encounter.id];
    if (!availability) errors.push(`${encounter.id} has no availability semantics`);
    if (encounter.boss && availability !== "once") errors.push(`${encounter.id} is a boss but is not once-only`);
    if (!encounter.boss && availability !== "repeatable") errors.push(`${encounter.id} is ordinary but is not repeatable`);
  }
  for (const phase of bossPhases) {
    const encounter = encounterById.get(phase.encounterId);
    if (!encounter?.boss) errors.push(`${phase.phaseName} references a non-boss encounter ${phase.encounterId}`);
    if (!encounter?.enemyIds.includes(phase.enemyId)) errors.push(`${phase.phaseName} references unknown boss enemy ${phase.enemyId}`);
    if (phase.beginsAtHealthPercent < 1 || phase.beginsAtHealthPercent > 100) errors.push(`${phase.phaseName} has an invalid health threshold`);
  }
  for (const boss of encounters.filter(({ boss }) => boss)) {
    if (!bossPhases.some(({ encounterId }) => encounterId === boss.id)) errors.push(`${boss.id} has no phase metadata`);
  }
  for (const npc of npcs) {
    const lines = dialogueByNpcId[npc.id] ?? [];
    if (lines.length < MIN_AUTHORED_DIALOGUE_LINES_PER_NPC) {
      errors.push(`${npc.id} has ${lines.length} authored dialogue lines; expected at least ${MIN_AUTHORED_DIALOGUE_LINES_PER_NPC}`);
    }
    if (new Set(lines).size !== lines.length) errors.push(`${npc.id} has duplicate authored dialogue`);
    for (const line of lines) {
      if (line.trim().length < 20 || line.length > 240) {
        errors.push(`${npc.id} has dialogue outside the 20-240 character readability bound`);
      }
    }
  }
  for (const npcId of Object.keys(dialogueByNpcId)) {
    if (!npcIds.has(npcId)) errors.push(`Dialogue catalog references unknown NPC ${npcId}`);
  }
  return errors;
}

/**
 * Each ending has a genuine trade-off, not just a single faction gain: the
 * opposedFactionId is the faction whose interests that future structurally
 * closes off, per WORLD_BIBLE.md's faction descriptions. epilogue is a
 * fourth chronicle line shown only in the journal/ending screen, naming a
 * concrete systemic consequence beyond the faction-standing numbers.
 */
export const CONCORD_CHOICES = [
  {
    id: "ending.concord-remade",
    label: "Restore the Concord",
    description: "Bind the factions to a renewed shared covenant.",
    factionId: "faction.rootwardens",
    opposedFactionId: "faction.freebound",
    title: "THE CONCORD REMADE",
    resolution: "The old promise is rewritten with mortal voices at its center.",
    body: "The severed roads sing again—not as they once did, but in the voices of those who chose to mend them.",
    epilogue: "The Freebound Companies lose their independent routes to the renewed covenant's shared law; some comply, more scatter to the unmapped edges."
  },
  {
    id: "ending.rootways-freed",
    label: "Free the Rootways",
    description: "End central rule and let every region govern its own memories.",
    factionId: "faction.freebound",
    opposedFactionId: "faction.rootwardens",
    title: "THE ROOTWAYS FREED",
    resolution: "No single covenant owns the roads now; each settlement carries its own truth and risk.",
    body: "The rootways open without a throne above them. Their songs disagree, overlap, and finally belong to the people who travel them.",
    epilogue: "The Rootwardens' mandate to protect every living rootway ends with the central authority that enforced it; some roots go unwatched."
  },
  {
    id: "ending.lantern-covenant",
    label: "Entrust the Archive",
    description: "Create a transparent covenant of witnesses and public records.",
    factionId: "faction.lantern-archive",
    opposedFactionId: "faction.quiet-choir",
    title: "THE LANTERN COVENANT",
    resolution: "The Archive accepts stewardship under laws that make every hidden revision visible.",
    body: "Lanterns burn beside every living record. Memory has keepers again, but never again an unseen hand.",
    epilogue: "The Quiet Choir's belief that the tree must forget finds no shelter under public record; its remaining voices go quieter still, or go underground."
  }
] as const;

