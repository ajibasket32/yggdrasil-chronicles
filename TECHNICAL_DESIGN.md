# Technical Design

## Runtime

The browser runs Phaser, deterministic engine modules, content data, UI, and IndexedDB saves. A small Express process serves the production build and exposes only AI narrative endpoints. Vite proxies `/api` during development.

## Source layout

- `src/shared`: public contracts and Zod schemas.
- `src/engine`: pure gameplay rules.
- `src/save`: IndexedDB repository, migrations, import/export.
- `src/content`: versioned authored packs.
- `src/game`: Phaser scenes, input, rendering, UI.
- `src/ai`: client queue, validation, patch application.
- `server`: provider adapter, request limits, static hosting.
- `tests`: deterministic, integration, and boundary tests.

## State flow

Scenes emit player intents. The engine validates and returns state transitions and domain events. A single session store applies transitions, updates presentation, and asks the save repository to persist checkpoints. Scenes never calculate rewards or mutate IndexedDB directly.

## Save contract

One autosave and three manual slots store complete `GameState` snapshots. Records include schema version, content-pack versions, seed, timestamps, checksum, and optional generated patches. Import validates structure and checksum before backing up and replacing a slot.

## Production

`npm run build` emits the browser bundle and compiled Node proxy. `npm start` serves both from one process. Core assets and content are bundled; no runtime asset downloads occur.
