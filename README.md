# Yggdrasil Chronicles

An original living-world browser JRPG. Explore three regions, recruit a four-person party, master branching jobs, fight deterministic turn-based battles, and leave permanent marks on a world that remembers.

## Quick start

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The game remains playable without an AI key.

## Controls

- Move: Arrow keys or WASD
- Interact/confirm: Enter, Space, or E
- Cancel/menu: Escape
- Journal: J
- Party: P
- Quick save: F5

## Optional living-world generation

Copy `.env.example` to `.env`, set `AI_API_KEY`, `AI_MODEL`, and optionally `AI_BASE_URL`, then run `npm run dev`. Keys stay in the Node proxy and are never sent to the browser.

## Quality commands

```bash
npm test
npm run typecheck
npm run validate:content
npm run build
npm run test:e2e
```

No Docker, external database, account, or cloud service is required for core play.
