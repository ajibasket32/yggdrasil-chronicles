# Testing

GitHub Actions runs the complete quality gate on every push to `main` and on
every pull request. The same gate can be reproduced locally with:

```bash
npm run typecheck
npm test
npm run validate:content
npm run build
npm run test:e2e
```

## Automated layers

- Vitest unit tests cover seeded RNG, combat, progression, inventory, quest transitions, rewards, content validation, and AI boundaries.
- IndexedDB integration tests cover atomic slots, backup, checksum, import/export, migration, and generated patch persistence.
- Playwright currently covers new game, exploration travel, combat entry,
  system/manual-save controls, manual-slot restoration from the title, and
  startup with the narrative proxy unavailable.
- Campaign validation walks all 35 authored quests through real routes, NPC
  placements, encounter placements, and item sources; it checks graph
  reachability, references, source quantities, boss placement, and route
  ambiguity.
- Integration coverage verifies job-specific forms, starting equipment,
  quest-gated recruitment, deterministic party turns, and boss phase
  thresholds.

## Manual release checks

- Stable 60 FPS at the target viewport on a typical desktop.
- Complete keyboard flow and equivalent gamepad actions.
- No network requirement for campaign completion.
- No chatbot-style primary interface.
- Full authored playthrough exceeds 20 hours without generated content.
- No secret, unknown-license asset, broken save migration, or console error.
