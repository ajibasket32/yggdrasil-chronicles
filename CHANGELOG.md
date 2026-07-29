# Changelog

## Unreleased

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
