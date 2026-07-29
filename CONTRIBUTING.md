# Contributing

Read `AGENTS.md`, `GAME_DESIGN.md`, and the relevant technical document before editing. Keep changes inside one subsystem, preserve deterministic rules, and include focused tests.

Do not add infrastructure or dependencies merely for future possibilities. Content changes must pass `npm run validate:content`; gameplay changes must preserve save compatibility; asset changes must update `ASSETS.md`.

Commits should be small, imperative, and playable. Describe player-visible behavior, tests, and migration impact in pull requests.
