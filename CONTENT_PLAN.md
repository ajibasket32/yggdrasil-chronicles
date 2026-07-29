# Content Plan

## MVP budget

- 3 regions: Verdant Reach, Cinder March, Pale Canopy.
- 4 playable ancestries and 6 starting jobs.
- Approximately 30 named NPCs.
- 35 authored quests: 15 main, 15 regional/companion, 5 hidden.
- 3 major dungeons and 1 final multi-phase boss.
- Release target: a complete authored route exceeding 20 hours in normal
  exploratory play, verified by timed playthrough rather than quest count.

The automated readiness walk currently proves that all 35 authored quests and
74 objectives can be completed offline through 130 minimum authored world
interactions. This is a reachability lower bound, not a duration claim; content
expansion and timed playtesting remain required before certifying 20+ hours.

## Duration certification

`tools/campaign-duration-audit.ts` records two intentionally separate facts:
the authored breadth structure (regional town/wilderness/dungeon loops, NPCs,
quest touchpoints, bosses, companion arcs, dialogue, and persistent
consequences) and the status of the 20-hour certificate. Breadth never becomes
an hours estimate.

The certificate remains **unverified** until a fresh, normal-exploratory,
offline playthrough records every authored quest, reaches the ending with AI
disabled, includes playtester notes, and lasts at least 1,200 observed minutes.
Run `npx tsx tools/campaign-duration-audit.ts --evidence=PATH --require-certified`
for the release decision. Evidence must include a reviewable recording or
archive reference; the tool validates its structure, while release QA verifies
that reference is authentic. No placeholder timing evidence is committed. As
of this audit, the campaign has structural pacing coverage but no qualifying
timed run, so the 20+ hour target must not be advertised as verified.

Regional dialogue is split into Verdant Reach, Cinder March, and Pale Canopy
catalogs. Each region currently provides 80 authored lines across ten named
NPCs. The engine exposes two lines per conversation and rotates later beats
from persistent NPC memory rather than dumping the whole catalog at once.

## Campaign

Act I establishes Hearthcross, the Rootwardens, and the first silent root. Act II lets the party choose how the Reach shares evidence with the Brass Compact and Lantern Archive. Act III opens the Cinder March and reveals deliberate root cutting. Act IV follows contradictory memories into the Pale Canopy. Act V resolves whether the Concord is restored, replaced, or allowed to fracture.

Each act ends in a playable state and includes at least one consequential choice, companion moment, dungeon escalation, and persistent regional change.

## Expansion packs

Every pack declares an ID, semantic version, regions, locations, NPCs, quests, encounters, and items. References use stable string IDs. Packs may add content but cannot rewrite another pack's records. Save files record loaded pack versions and migrations cover incompatible changes.
