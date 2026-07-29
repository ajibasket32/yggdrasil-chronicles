# Changelog

## Unreleased

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
