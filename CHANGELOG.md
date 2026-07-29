# Changelog

## Unreleased

- Added GitHub Actions quality gates for typechecking, tests, campaign
  validation, production builds, and Chromium E2E coverage.
- Added authored route directions, objective wayfinding, destination labels,
  objective markers, and content-owned encounter and item-source metadata.
- Hardened combat and initial-state validation against ambiguous IDs, invalid
  resources, impossible battles, and unlearned skill use.
- Added a client-side narrative timeout so a stalled AI request cannot block
  later checkpoints or core gameplay.
- Rebuilt the project contract around a simple Phaser/Vite browser game.
- Established original world canon, deterministic engine boundaries, local saves, content packs, and validated living-world generation.
