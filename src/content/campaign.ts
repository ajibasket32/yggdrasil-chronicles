import type {
  ContentPack,
  EncounterDefinition,
  ItemDefinition,
  LocationDefinition,
  NpcDefinition,
  QuestDefinition,
  RegionDefinition
} from "../shared/types";

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
    connections: ["location.mossroad"],
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
    connections: ["location.ashfall-trail"],
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

type QuestSeed = {
  id: string;
  title: string;
  summary: string;
  prerequisites?: string[];
  steps: QuestDefinition["steps"];
  rewardTier?: QuestDefinition["rewardTier"];
  mainStory?: boolean;
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
    rewardTier: "boss",
    mainStory: true
  }
];

const regionalQuestSeeds: QuestSeed[] = [
  { id: "medicine-in-the-mud", title: "Medicine in the Mud", summary: "Recover vesleaf for Hearthcross's clinic.", steps: [step("collect", "item.vesleaf", 5), step("talk", "npc.veska-reed")] },
  { id: "storytellers-toll", title: "The Storyteller's Toll", summary: "Find the ending Pella lost on the flooded road.", steps: [step("travel", "location.mossroad"), step("talk", "npc.pella-wren")] },
  { id: "ferriers-lantern", title: "Ferrier's Lantern", summary: "Relight Fen's route markers before nightfall.", steps: [step("collect", "item.lantern-wick", 3), step("talk", "npc.fen-til")] },
  { id: "salvagers-debt", title: "A Salvager's Debt", summary: "Choose whether a recovered memory belongs to its family or finder.", steps: [step("talk", "npc.ilas-morn"), step("talk", "npc.senna-brook")], rewardTier: "standard" },
  { id: "tovins-company", title: "Tovin's Company", summary: "Help Tovin face the route where their company vanished.", prerequisites: ["quest.marks-in-rain"], steps: [step("defeat", "enemy.briar-wolf", 3), step("talk", "npc.tovin-ash")], rewardTier: "major" },
  { id: "glass-and-bread", title: "Glass and Bread", summary: "Settle a refinery ration dispute before it becomes a riot.", steps: [step("talk", "npc.hett-copper"), step("talk", "npc.brannic-quill")] },
  { id: "keepers-coals", title: "The Keeper's Coals", summary: "Gather calm embers for Nema's spirit braziers.", steps: [step("collect", "item.calm-ember", 4), step("talk", "npc.nema-slate")] },
  { id: "cookfire-compact", title: "Cookfire Compact", summary: "Trade trail spices among three wary caravans.", steps: [step("collect", "item.ash-spice", 3), step("talk", "npc.cask-ember")] },
  { id: "adras-line", title: "Adra's Line", summary: "Protect striking workers from an ash-spirit surge.", prerequisites: ["quest.foundry-accord"], steps: [step("defeat", "enemy.ash-mote", 6), step("talk", "npc.adra-flint")], rewardTier: "major" },
  { id: "kevas-last-descent", title: "Keva's Last Descent", summary: "Return a delver's token to the Silent Kiln.", prerequisites: ["quest.ash-remembers"], steps: [step("travel", "location.silent-kiln"), step("collect", "item.delver-token"), step("talk", "npc.keva-dross")] },
  { id: "frost-for-thyme", title: "Frost for Thyme", summary: "Collect resin crystals before they thaw.", steps: [step("collect", "item.frost-resin", 4), step("talk", "npc.thyme-vale")] },
  { id: "rooks-high-road", title: "Rook's High Road", summary: "Chart a safer climb through Whitebough.", steps: [step("travel", "location.whitebough"), step("talk", "npc.rook-silva")] },
  { id: "courier-in-white", title: "Courier in White", summary: "Find Otis and deliver the letter he protected.", steps: [step("talk", "npc.otis-snow"), step("talk", "npc.corin-mist")] },
  { id: "conservators-choice", title: "The Conservator's Choice", summary: "Decide which damaged memory the Archive restores.", prerequisites: ["quest.stars-out-of-place"], steps: [step("talk", "npc.corin-mist"), step("collect", "item.memory-shard", 3)] },
  { id: "eiras-burden", title: "Eira's Burden", summary: "Learn why the bridgekeeper refuses to leave her post.", prerequisites: ["quest.bridge-of-bonewood"], steps: [step("talk", "npc.eira-lune"), step("talk", "npc.thea-nacre")], rewardTier: "major" }
];

const hiddenQuestSeeds: QuestSeed[] = [
  { id: "root-that-dreams", title: "The Root That Dreams", summary: "Follow a melody heard only while standing still.", prerequisites: ["quest.hollow-witness"], steps: [step("talk", "npc.old-cairn"), step("collect", "item.dream-resin")], rewardTier: "major" },
  { id: "yarrow-speaks", title: "Yarrow Speaks", summary: "Restore a name erased from the Silent Kiln.", prerequisites: ["quest.silent-kiln"], steps: [step("talk", "npc.yarrow-kest"), step("collect", "item.yarrow-seal")], rewardTier: "major" },
  { id: "unburned-recipe", title: "The Unburned Recipe", summary: "Cook a meal using an ember that gives no heat.", steps: [step("collect", "item.cold-ember"), step("talk", "npc.cask-ember")] },
  { id: "thirteenth-star", title: "The Thirteenth Star", summary: "Align the observatory to a star absent from every chart.", prerequisites: ["quest.buried-constellation"], steps: [step("collect", "item.star-key", 3), step("talk", "npc.sable-voss")], rewardTier: "boss" },
  { id: "what-the-tree-forgot", title: "What the Tree Forgot", summary: "Piece together a memory the world tree rejected.", prerequisites: ["quest.choir-without-voices"], steps: [step("collect", "item.memory-shard", 7), step("talk", "npc.mother-hush")], rewardTier: "boss" }
];

const makeQuests = (seeds: QuestSeed[]): QuestDefinition[] =>
  seeds.map((seed) => ({
    id: `quest.${seed.id}`,
    title: seed.title,
    summary: seed.summary,
    prerequisites: seed.prerequisites ?? [],
    steps: seed.steps,
    rewardTier: seed.rewardTier ?? "minor",
    mainStory: seed.mainStory ?? false
  }));

export const quests: QuestDefinition[] = makeQuests([
  ...mainQuestSeeds,
  ...regionalQuestSeeds,
  ...hiddenQuestSeeds
]);

export const encounters: EncounterDefinition[] = [
  { id: "encounter.mossroad-foragers", name: "Briar Foragers", enemyIds: ["enemy.briar-wolf", "enemy.root-gnawer"], rewardTier: "minor", boss: false },
  { id: "encounter.flooded-grove", name: "Flooded Grove", enemyIds: ["enemy.mireling", "enemy.mireling", "enemy.root-gnawer"], rewardTier: "standard", boss: false },
  { id: "encounter.mire-antler", name: "Mire Antler", enemyIds: ["enemy.mire-antler"], rewardTier: "major", boss: true },
  { id: "encounter.ashfall-motes", name: "Ashfall Motes", enemyIds: ["enemy.ash-mote", "enemy.ash-mote", "enemy.cinder-hound"], rewardTier: "standard", boss: false },
  { id: "encounter.kiln-watch", name: "Kiln Watch", enemyIds: ["enemy.cinder-wraith", "enemy.brass-sentinel"], rewardTier: "major", boss: false },
  { id: "encounter.kiln-heart", name: "The Kiln Heart", enemyIds: ["enemy.kiln-heart"], rewardTier: "major", boss: true },
  { id: "encounter.whitebough-hunt", name: "Whitebough Hunt", enemyIds: ["enemy.rime-stag", "enemy.frost-moth"], rewardTier: "standard", boss: false },
  { id: "encounter.vault-echoes", name: "Vault Echoes", enemyIds: ["enemy.star-echo", "enemy.star-echo", "enemy.pale-custodian"], rewardTier: "major", boss: false },
  { id: "encounter.varn-rootless", name: "Varn, Architect of Severance", enemyIds: ["enemy.varn-rootless"], rewardTier: "boss", boss: true }
];

export const items: ItemDefinition[] = [
  { id: "item.vesleaf", name: "Vesleaf", kind: "consumable", description: "A bitter medicinal leaf that closes small wounds.", value: 18 },
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
  { id: "item.dream-resin", name: "Dream Resin", kind: "accessory", description: "A cloudy bead that hums during sleep.", value: 180 },
  { id: "item.yarrow-seal", name: "Yarrow's Seal", kind: "key", description: "Proof that a forgotten kiln-worker once lived.", value: 0 },
  { id: "item.cold-ember", name: "Cold Ember", kind: "consumable", description: "A blue coal that tastes faintly of mint.", value: 75 },
  { id: "item.wayfarer-blade", name: "Wayfarer Blade", kind: "weapon", description: "A balanced road sword made for uncertain fights.", value: 120 },
  { id: "item.resin-vest", name: "Resin Vest", kind: "armor", description: "Layered cloth hardened with flexible resin.", value: 110 }
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

export const dialogueByNpcId: Readonly<Record<string, readonly string[]>> = {
  "npc.mara-vell": [
    "The east root went quiet three nights ago. No wind, no pulse—only rain.",
    "Talk to Orren by the archive stall. If his charts agree with my ears, we have work."
  ],
  "npc.tovin-ash": [
    "I know the Mossroad. More importantly, I know when it is lying.",
    "You will want a second blade out there. Say the word and I walk with you."
  ],
  "npc.orren-pike": [
    "Every rootway leaves a rhythm in resin-glass. This one ends as if cut by a careful hand.",
    "Bring me three marked rivets from the Mossroad. Evidence survives where testimony bends."
  ],
  "npc.joryn-hale": ["Rooms are cheap. Rumors cost one honest answer."],
  "npc.senna-brook": ["The rain is early, the pears are late, and nobody will say what passed the east wall."],
  "npc.veska-reed": ["Bring me vesleaf if you see it. Heroics are easier with clean bandages."],
  "npc.old-cairn": ["Be still. The hollow is not silent. It is holding its breath."],
  "npc.ira-sorn": ["Emberwake deals in proof, not frontier panic. Show me what you carried through the ash."],
  "npc.sable-voss": ["The oldest chart has thirteen guide stars. The sky insists there are twelve."],
  "npc.varn-rootless": ["Memory is a wound the world refuses to close. I chose the knife."]
};

export function getDialogue(npcId: string): readonly string[] {
  const scripted = dialogueByNpcId[npcId];
  if (scripted) return scripted;
  const npc = npcs.find((candidate) => candidate.id === npcId);
  return npc
    ? [`${npc.name} watches the road for a moment.`, `"Every place remembers differently," ${npc.name} says.`]
    : ["Only the rain answers."];
}

