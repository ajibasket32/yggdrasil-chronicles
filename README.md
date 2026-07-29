# Yggdrasil Chronicles

An original living-world browser JRPG. Explore three regions, recruit a four-person party, master branching jobs, fight deterministic turn-based battles, and leave permanent marks on a world that remembers.

## Quick start

Requirements: Node.js 22.9 or newer.

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
- Inventory/use/equip: I
- Party: P
- Quick save: F5
- System menu/manual saves: Escape, then choose a slot
- Gamepad: D-pad/left stick to move, A to confirm, B to cancel

Inventory and party screens use the same directional controls. Consumables
select a party target; gear can be equipped or removed; advanced job branches
become selectable at level 4.

Completed authored quests permanently update NPC trust/respect/fear, faction
standing, and outcome flags. The journal shows the strongest current standings,
and NPC dialogue reacts when those persisted values cross meaningful thresholds.
The final authored quest presents three non-AI story choices. The selected
covenant is saved atomically, changes faction standing and the chronicle, and
produces a distinct ending while leaving unfinished side threads playable.

Continue loads the autosave. `Load Chronicle` on the title screen lists the
three manual slots and restores the selected snapshot.

The title and in-game system menus expose persistent high-contrast,
reduced-motion, sound on/off, and sound-volume controls. Sound effects use the
committed CC0 Kenney RPG Audio pack and never require a network connection.
The title settings screen also supports persistent keyboard rebinding for
movement, confirmation, menus, interaction, journal, inventory, party,
encounters, and quick save. Assigning a key already in use swaps the two actions
so no command becomes unreachable.
The game also exposes concise scene and settings changes through a screen-reader
live region, while keeping gameplay inside the canvas.

The system menu can export the autosave as
`yggdrasil-chronicles-save.json` and import it later. Imports validate the
record checksum and schema, then retain a backup of the replaced autosave.

## Optional living-world generation

Copy `.env.example` to `.env`, set `AI_API_KEY`, `AI_MODEL`, and optionally `AI_BASE_URL`, then run `npm run dev`. Keys stay in the Node proxy and are never sent to the browser.

Both development and production commands load `.env` automatically when the
file exists. Generated story content is optional; the authored campaign,
combat, travel, and saves remain available when the proxy is offline.

## Quality commands

```bash
npm test
npm run typecheck
npm run validate:content
npm run simulate:campaign
npm run audit:duration
npm run audit:assets
npm run build
npm run audit:release
npm run test:e2e
```

No Docker, external database, account, or cloud service is required for core play.
