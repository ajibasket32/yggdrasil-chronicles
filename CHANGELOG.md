# Changelog

## Unreleased

- Stopped four defects that destroyed player data. Quick Save was bound to F5
  with no `preventDefault`, so the browser's reload key raced the IndexedDB
  write; it now defaults to F9, writes to its own slot instead of overwriting
  Manual Slot 1, and has a matching Quick Load. Persisted bindings that still
  hold a browser-owned key are healed on read. A party wipe no longer autosaves
  over the pre-battle state, so losing is recoverable. Both scenes now destroy
  their render output rather than orphaning a canvas and texture per repaint.
  NEW CHRONICLE over an existing save asks twice.
- Made save failure legible instead of fatal. `load` and `continueGame` report
  a failure rather than throwing, a corrupt slot no longer freezes the whole
  title screen, and blocked storage (private browsing, quota) boots into an
  explicit no-persistence mode instead of a blank page.
- Landed every persisted-shape change as one migration (schemaVersion 1 to 2)
  behind a proper migration ladder. The previous single hardcoded step would
  have invalidated every save on the first ordinary version bump.
- Added battle targeting. The player may aim at any living enemy, the choice is
  remembered until that enemy falls, the four healing forms moved from
  self-target to ally-target so the healer can heal the party, and restoratives
  can be handed to a companion. MP, the full status list, typed combat events
  and turn order now reach the battle view.
- Authored an encounter level per encounter instead of deriving it from the
  party average, which had made levelling up narrow the party's margin. Added
  action-economy scaling so a group's total offence tracks the party's, which
  is what made a three-enemy encounter winnable at its own authored level.
- Moved equipment stat modifiers into content. Nine items had their price in
  `campaign.ts` and their stats in the integration layer.
- Made quest failure reachable: `failQuest`/`resetFailedQuest` had no caller,
  so the persisted `failed` state could never be written. Quests can now be
  gated on world flags, fail on an authored condition, and open a recovery
  branch. Added `deliver` and `survive` objectives.
- Implemented the reserve roster. A fifth companion was previously turned away
  by a party-size guard; they now wait in reserve and can be swapped in.
- Added New Game+ and a post-game superboss. Carry-over brings levels,
  equipment and currency into a fresh chronicle; the superboss is sealed until
  the campaign is finished, making the ending overlay's promise of unfinished
  threads true.
- Added an in-game codex. The game previously explained no mechanic anywhere.
- Windowed the inventory and shop overlays so the cursor cannot walk off the
  panel, and routed advanced-job unlocks through the engine's unlock API
  instead of a duplicate level check in the bridge.
- Made bosses last long enough to play their authored phases. A boss died in
  about two rounds against a party at its own level, so thresholds written at
  60%, 50%, 45% and 25% health were skipped: Varn's mid-fight heal had never
  fired in practice. Boss health now scales with the number of attackers,
  offensive forms roughly doubled in power (a form previously beat a free
  attack by 3-18%), and trash health eased so every starting build can clear a
  three-enemy encounter at its authored level. The health curve moved into the
  engine and is shared with the offline simulation, which had been validating a
  copy of the old numbers.
- Grew experience rewards with the level curve. The curve is quadratic and the
  reward was linear, so a completionist finished around level 16 against an
  authored final band of 14-22; the same run now ends at 20.
- Levelling teaches new forms and says so. Three per calling across the
  campaign's three regional bands, drawn from skills that already existed;
  level-ups were previously silent and a character learned nothing after
  creation unless they took a branch. Experience progress is shown in the party
  overlay.
- Gave battles damage numbers, hit reaction, MP bars and status tokens, all
  driven by the typed combat events added in the contract pass. Motion respects
  the Reduced Motion setting.
- Enemies no longer all behave identically: each picks targets by a profile
  derived from its own stats — finishing the wounded, hunting the biggest
  threat, or spreading its attention. Damage over time scales with the target
  so poison, burn and bleed stay relevant past the opening region.
- Agility decides turn order. `getInitiativeOrder` had been dead code, then
  display-only; the party now acts in initiative order and it is recomputed
  each round, which is what gives haste and slow meaning.

- Added difficulty options (Easy/Normal/Hard), chosen once at character
  creation alongside name/ancestry/calling and fixed for the life of the
  chronicle, matching standard JRPG convention. Easy softens enemy HP/
  offense and battle rewards; Hard strengthens both; Normal is the
  unmodified authored balance. Stored as a world flag rather than a global
  UI preference (like the existing settings store) since it affects
  deterministic game balance and must travel with the save, not the
  browser. Applied entirely in the integration layer (enemy stat scaling
  before combat starts, reward scaling after rewards are computed) so
  src/engine/combat.ts's formulas stay fully difficulty-agnostic.
- Gave the three named campaign bosses (Mire Antler, Kiln Heart, Varn
  Rootless) an authored, zero-MP-cost combat form matching their own boss
  phase theme, used once bloodied (at or below 60% HP) instead of only ever
  basic-attacking like every trash mob in the game. Previously every enemy
  — trash and named bosses alike — used one universal AI (always attack the
  lowest-HP party member) and was structurally created with `skills: []`, so
  a boss's own turn was never a real decision; only the automatic HP-
  threshold phase system (stat/status pops) distinguished it from a wolf.
  The decision remains fully deterministic (an HP-threshold check, no RNG
  roll), so the offline boss-viability simulation still needs no tuning of
  seeds or rosters.
- Implemented a shop/economy system. Battle and quest rewards had accumulated
  currency since the very first commit, but nothing could ever spend it — no
  shop, vendor, or buy/sell mechanic existed anywhere. Added one vendor per
  town, reusing an existing named NPC whose authored role already fit trading
  (Joryn Hale the innkeeper, Hett Copper the resin-glass artisan, Thyme Vale
  the frost apothecary) rather than adding a new NPC to the validated 30-NPC
  campaign budget. Talking to a vendor now opens a buy/sell overlay (same
  visual/interaction pattern as the inventory overlay) showing price, the
  party's current currency, and each vendor's curated, thematically fitting
  catalog. Selling returns 40% of an item's authored value. The two highest
  boss-dropped equipment tiers are deliberately excluded from every vendor's
  catalog, so combat progression still requires defeating the campaign's
  named bosses rather than just accumulating enough currency.
- Added a full stat line (STR/DEX/AGI/VIT/INT/WIS/CHA, post-equipment) to the
  party overlay. Every combat formula already depended on these seven stats,
  but the player had no way to see them — only HP/MP/level/job were ever
  shown, so ancestry/job/equipment choices had invisible mechanical effects.
- Made agility affect evasion in combat. Previously agility was tracked,
  grown per level, and modified by every ancestry/job/equipment entry, but
  had zero effect on hit chance, crit chance, or turn order — a fully
  decorative stat. Attacks now roll against the target's agility as an
  evasion term (self-targeted healing forms are exempt, so they never miss
  their own actor).
- Added an in-battle item-select menu (Vesleaf, Root Tonic, Aether Drop,
  Frost Resin, Cold Ember, Ash Spice) instead of the ITEM action always
  defaulting to Root Tonic regardless of what else was carried. Fixed Ash
  Spice silently failing to be used at all — it's now the game's only
  status-cure item, clearing stun/sleep/freeze/poison/burn/bleed from its
  target, the sole counter-play to boss phases that inflict party-wide
  freeze or burn.
- Deepened the three campaign endings' systemic consequences: each ending now
  also sets back a specific opposing faction (per WORLD_BIBLE.md's faction
  descriptions), not just advancing its own chosen faction, and records a
  distinct "What the Choice Cost" epilogue chronicle entry shown on the
  ending screen. Previously all three endings moved only one faction by the
  same flat +8 with no other differing consequence.
- Gave each of the three recruitable companions (Tovin, Keva, Eira) one
  exclusive combat skill reflecting their story role (a scout's ambush
  sense, a kiln-delver's endurance, a bridgekeeper's living-wood ward), so
  recruiting them is a mechanically distinct addition to the party instead
  of hiring a stat-identical, self-makeable Ranger/Vanguard/Mender.
- Added regional equipment progression: six new weapon/armor/accessory items
  (two tiers above the starting kit) dropped by the Mire Antler, Kiln Heart,
  and Varn Rootless bosses, with level-gated eligibility matching each
  region's recommended level floor. Previously the entire campaign only ever
  had 3 equippable items total, all handed out at character creation.
- Gave party members and enemies distinct battle portraits instead of every
  ally sharing one player sprite and every enemy sharing one red silhouette.
  Party portraits now vary by job family (six sprite sheets) with an
  ancestry tint; enemies use a small/humanoid/boss silhouette split plus a
  per-enemy-ID tint, covering all 14 authored enemies across all 9
  encounters. Uses existing committed CC0 Puny Characters sheets, no new
  assets. Fixed README's Space-key claim and documented the working Quick
  Encounter (B) action; named the system-menu wrap bound instead of leaving
  it a bare magic number.
- Gave each region a visually distinct tile palette and landmark set (basalt
  and ember tones for Cinder March towns/wilderness/dungeon, pale frost tones
  for Pale Canopy) instead of every region rendering identically by location
  kind alone, matching WORLD_BIBLE.md's distinct regional character.
- Gave every one of the 12 advanced job branches a permanently learned,
  mechanically distinct form and a unique stat emphasis, replacing the prior
  cosmetic skill-reorder-only branch change. Battle now exposes a form-select
  menu so any known skill can be chosen in combat, not just the first learned
  one.
- Fixed `npm run dev:server` crashing on start due to a `tsx` CLI argument
  order bug (`--env-file-if-exists` must follow the `watch` subcommand).
- Expanded regional NPC writing from 33 total lines to 240 authored lines,
  split into ownership-safe content catalogs. Persistent per-NPC conversation
  memory now rotates later beats across visits and survives save/reload.
- Replaced the automatic single campaign ending with a persisted three-way
  authored decision, distinct ending presentations, deterministic faction
  consequences, keyboard/gamepad choice navigation, and legacy-save backfill.
- Added screen-reader live announcements for scene changes, settings, dialogue,
  and the selected final-story choice.
- Production builds now split the Phaser runtime from app code, omit unused
  source archives and vendor files, preserve only browser-referenced assets,
  package attribution evidence, and enforce deterministic release-size and
  static-package integrity budgets in CI.
- Made all 35 authored quest completions produce validated, one-time persistent
  relationship, faction, and outcome consequences. NPC dialogue and the compact
  journal reputation view now react to that state, including safe backfill for
  older rewarded saves.
- Added an offline release asset gate covering checksums, extracted packs,
  license evidence, runtime references, catalog coverage, and external URL
  rejection.
- Added persistent keyboard rebinding for twelve exploration, menu, combat, and
  quick-action commands. Conflicts swap atomically, scene prompts reflect the
  active keys, and browser coverage verifies capture, use, and reload.
- Added a deterministic campaign viability gate that walks all authored quests
  and defeats every boss across fixed seeds while activating every boss phase.
- Added persistent high-contrast, reduced-motion, sound toggle, and volume
  settings to the title and in-game system menus, plus offline CC0 interface,
  movement, travel, battle, and restorative sound effects.
- Added defensive preference-storage tests and browser coverage proving visual
  accessibility settings survive reload.
- Hardened browser E2E timing for slower Linux runners and removed the final
  seed-dependent outcome assumption from the Mender integration test.
- Upgraded official GitHub Actions to their Node 24-backed releases, removing
  runner deprecation compatibility warnings.
- Removed an environment-sensitive Mender integration assertion while retaining
  deterministic healing rule coverage and public-bridge behavior coverage.
- Added in-game autosave export/import with a named JSON download, checksum and
  schema rejection, pre-import backup, active-state restore, and safe failure
  feedback.
- Made inventory and party overlays interactive with keyboard/gamepad item
  targeting, restorative use, atomic equip/unequip, and clear action feedback.
- Added twelve level-gated advanced jobs, persistent branch unlocks, signature
  form selection, and visible active/available/locked requirements.
- Updated party HUD values to include equipped HP/MP bonuses while preserving
  the underlying wound/focus deficit across gear changes and battles.
- Added distinct authored loadouts for every ancestry/job pairing, including
  starting stats, practiced forms, inventory, resistances, and equipped gear.
- Added quest-gated Tovin, Keva, and Eira recruitment plus data-driven
  companion creation and party inventory grants.
- Added runtime multi-phase boss transitions with visible telegraphs and
  deterministic phase mechanics including roots, burns, restoration, and
  elemental defense shifts.
- Added equipment eligibility/stat derivation and inspectable job-branch
  unlock blockers, with focused unit and integration coverage.
- Added a manual-load title flow for all three save slots, an E2E restore test,
  a high-contrast title toggle, and automatic `.env` loading.
- Expanded the offline campaign audit to all 35 quests, 74 objectives, and 130
  minimum authored interactions.
- Added GitHub Actions quality gates for typechecking, tests, campaign
  validation, production builds, and Chromium E2E coverage.
- Added authored route directions, objective wayfinding, destination labels,
  objective markers, and content-owned encounter and item-source metadata.
- Hardened combat and initial-state validation against ambiguous IDs, invalid
  resources, impossible battles, and unlearned skill use.
- Added a client-side narrative timeout so a stalled AI request cannot block
  later checkpoints or core gameplay.
- Added deterministic party turn cycles, one-time quest rewards, safe repeatable
  encounter loot, party rest, and persistent campaign-completion reporting.
- Added controller mappings, accessible NPC placement, a functional system
  menu with three manual slots, and an authored campaign ending overlay.
- Added an offline main-campaign readiness walk and corrected unsupported
  20-hour wording pending a timed full playthrough.
- Rebuilt the project contract around a simple Phaser/Vite browser game.
- Established original world canon, deterministic engine boundaries, local saves, content packs, and validated living-world generation.
