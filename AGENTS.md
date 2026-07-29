# Yggdrasil Chronicles — Agent Contract

## Product law

Build a real browser JRPG, never a chatbot. The deterministic game engine owns combat, progression, rewards, inventory, quest transitions, and canonical world state. AI may propose structured narrative content only through the validator.

The project must remain simple: TypeScript, Phaser, Vite, a small Node proxy, and IndexedDB. Do not add Docker, databases, queues, vector stores, authentication, microservices, or frameworks without an explicit user request.

## Sol workflow

- Implementation work uses `gpt-5.6-sol`.
- When at least two independent lanes exist, the primary agent must delegate to Sol sub-agents, with at most three sub-agents active concurrently.
- The primary agent owns architecture, shared contracts, integration, final verification, and user handoff.
- Shared types and schemas must be established before delegation.
- Every sub-agent receives a bounded task and exclusive directory ownership. Do not edit another lane's files without coordinating with the primary agent.
- Each sub-agent reports changed files, tests run, unresolved risks, and integration requirements.
- Prefer small, playable increments. Never start broad content expansion while the current gameplay loop is broken.

Suggested lanes:

1. `src/engine`, `src/save`, and their tests.
2. `src/game`, `src/content`, presentation assets, and their tests.
3. `server`, `src/ai`, and their tests.

## Engineering rules

- TypeScript strict mode; no unexplained `any`.
- Pure functions for deterministic game rules and seeded randomness.
- Content is data, not scene-specific hardcoding.
- Save mutations use IndexedDB transactions and versioned migrations.
- Core gameplay must work without the network and without an AI key.
- AI output is JSON, validated before use, and cannot provide raw stats, XP, currency, loot, combat results, or authored quest-state mutations.
- Runtime asset downloads are forbidden. Every asset must be local and listed in `ASSETS.md`.
- Do not commit secrets or `.env`.
- Add dependencies only when they remove more complexity than they introduce.

## Definition of done

A change is done when it builds, relevant tests pass, player-visible behavior is usable with keyboard, save compatibility is preserved, and affected documentation is updated. Visual features require an actual browser smoke test before release.
