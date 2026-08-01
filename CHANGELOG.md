# Changelog

## Unreleased

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
