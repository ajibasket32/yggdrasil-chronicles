# Testing

GitHub Actions runs the complete quality gate on every push to `main` and on
every pull request. The same gate can be reproduced locally with:

```bash
npm run typecheck
npm test
npm run validate:content
npm run simulate:campaign
npm run audit:duration
npm run audit:assets
npm run build
npm run audit:release
npm run test:e2e
```

## Automated layers

- Vitest unit tests cover seeded RNG, combat, progression, inventory, quest transitions, rewards, content validation, and AI boundaries.
- IndexedDB integration tests cover atomic slots, backup, checksum, import/export, migration, and generated patch persistence.
- Playwright currently covers new game, exploration travel, combat entry,
  system/manual-save controls, manual-slot restoration from the title, and
  targeted restorative use from the inventory, plus startup with the narrative
  proxy unavailable. It also verifies the named autosave export download and
  persistence of accessibility settings across a browser reload. A dedicated
  flow rebinds Journal to a new physical key, uses it in exploration, and
  verifies the binding survives reload.
- Campaign validation walks all 35 authored quests through real routes, NPC
  placements, encounter placements, and item sources; it checks graph
  reachability, references, source quantities, boss placement, and route
  ambiguity.
- `npm run simulate:campaign` runs that authored route audit plus deterministic
  boss simulations through the public combat engine. It verifies a campaign-valid
  Shaper/Ranger/Vanguard/Mender roster can defeat every boss across fixed seeds
  while each authored boss phase activates. This is a combat/regression gate,
  not evidence of a 20-hour playtime.
- `npm run audit:duration` audits regional authored breadth
  separately from time. It reports the 20-hour certificate as unverified unless
  real offline playtest evidence is supplied. The release-only form adds
  `--evidence=PATH --require-certified`; it rejects short, AI-enabled,
  incomplete, or unreferenced records rather than inferring hours from
  objectives or interaction counts. Release QA must verify the supplied
  recording/archive reference itself.
- Integration coverage verifies job-specific forms, starting equipment,
  atomic equip/unequip, restorative consumption, advanced-job unlocks,
  save interchange/corruption rejection, quest-gated recruitment,
  deterministic party turns, boss phase thresholds, and safe preference
  storage when browser storage is corrupt or unavailable.
- Quest-consequence coverage verifies one-time relationship/faction changes,
  responsive dialogue, journal snapshot exposure, and backfill of older
  rewarded saves without duplicate rewards.
- Campaign-ending coverage verifies that the last authored objective cannot
  complete before a three-way player decision, persists exactly one ending and
  its faction effect, selects matching ending copy, and safely backfills legacy
  completed saves.
- `npm run audit:assets` verifies the committed asset catalog, direct and
  archive checksums, extracted-pack/license evidence, runtime path coverage,
  and the absence of browser runtime downloads.
- `npm run audit:release` verifies that the production package contains only
  browser-referenced vendor assets, preserves their bytes, packages license
  evidence, resolves its index bundles, and remains within the explicit gzip
  budgets for app code, Phaser, and total JavaScript.

## Manual release checks

- Stable 60 FPS at the target viewport on a typical desktop.
- Complete keyboard flow and equivalent gamepad actions.
- No network requirement for campaign completion.
- No chatbot-style primary interface.
- Full authored playthrough exceeds 20 hours without generated content.
- No secret, unknown-license asset, broken save migration, or console error.
