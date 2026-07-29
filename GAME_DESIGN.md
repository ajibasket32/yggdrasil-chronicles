# Game Design

## Player promise

Yggdrasil Chronicles is a party-based JRPG about becoming part of an old world rather than its predestined center. Exploration reveals forgotten routes and political pressure points; choices alter relationships, settlements, quests, and endings.

## Core loop

Explore → talk and investigate → accept or discover goals → prepare the party → fight or negotiate → resolve consequences → rest and save → see the world react.

The authored campaign is independently completable without generated narrative.
The release target is 20+ hours in normal exploratory play; this duration must
be established by a timed full playthrough and is not yet inferred from quest
counts alone. Generated narrative adds variation but never gates progress.

## Exploration

The world is a 16×16 orthogonal pixel grid rendered at integer scale. Three connected regions each contain a settlement, wilderness routes, secrets, and a dungeon. Interaction is contextual and keyboard-first. Gamepad mappings mirror movement, confirm, cancel, menu, journal, and party actions.

## Characters and progression

Players choose one of four original ancestries and one of six starting jobs.
Each starting job exposes two advanced paths at level 4; unlocked paths persist
and can be changed from the party screen. A party holds four active characters
plus reserves. Every build has explicit strengths, weaknesses, and counters.

The inventory screen targets consumables at individual party members and moves
equipment atomically between the shared pack and character slots. Equipment
bonuses preserve the current HP/MP deficit rather than healing through gear
swaps.

## Combat

Battles are gridless, single-screen, turn-based encounters. Initiative, hits, criticals, status application, enemy choices, and rewards use seeded deterministic rules. The same state, action sequence, and seed must produce the same result.

Actions include attack, skill, item, guard, and escape. Elements, resistances, short status durations, equipment tradeoffs, and boss phases create strategy without hidden formulas.

## Quests and factions

Authored quests form a validated graph with available, active, completed, and failed states. Main-story failure always exposes an intentional recovery branch. Faction standing and NPC trust, respect, and fear are numeric engine state; dialogue interprets them but cannot alter them directly.

Every authored quest declares deterministic completion consequences. These are
applied exactly once with the quest reward, survive export/import, appear in the
journal, and affect later NPC dialogue. Older rewarded saves receive missing
consequences on load without receiving XP, currency, or items twice.

The final main-story objective pauses before completion and requires one of
three explicit player choices: renew the shared Concord, free the regional
rootways, or establish a transparent Lantern covenant. The engine records the
choice as canonical world state, applies its deterministic faction consequence,
and selects the matching ending. Legacy completed saves without an ending flag
backfill the original Concord ending to preserve compatibility.

## Persistence

Boss deaths, discoveries, relationships, faction outcomes, generated branches, and chronicle entries persist. Respawnable ordinary encounters are explicit gameplay abstractions; named world changes never silently reset.
