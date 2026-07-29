# Testing

## Automated layers

- Vitest unit tests cover seeded RNG, combat, progression, inventory, quest transitions, rewards, content validation, and AI boundaries.
- IndexedDB integration tests cover atomic slots, backup, checksum, import/export, migration, and generated patch persistence.
- Playwright covers new game, travel, recruitment, quest, combat, rewards, save/reload, and ending with AI enabled and disabled.
- Campaign validation checks graph reachability, stable references, asset tags, boss viability, and recovery paths.

## Manual release checks

- Stable 60 FPS at the target viewport on a typical desktop.
- Complete keyboard flow and equivalent gamepad actions.
- No network requirement for campaign completion.
- No chatbot-style primary interface.
- Full authored playthrough exceeds 20 hours without generated content.
- No secret, unknown-license asset, broken save migration, or console error.
