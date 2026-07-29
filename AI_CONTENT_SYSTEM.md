# AI Content System

## Purpose

The living-world layer responds when a player does something the authored campaign did not anticipate. It creates structured optional content, never executable code or authoritative gameplay values.

## Checkpoint pipeline

1. The engine records a `NarrativeTrigger`.
2. Rest, travel, and loading checkpoints enqueue relevant triggers.
3. The client sends a compact `NarrativeContext` to the owner-hosted proxy.
4. The provider returns a `GeneratedContentPatch`.
5. Client validation checks schema, canon, references, reachability, assets, limits, and effects.
6. Accepted entities receive stable IDs and are committed with the save.
7. Invalid or unavailable output falls back to authored reactions.

Only one request per client runs at once. Duplicate trigger/world/prompt combinations reuse cached results. Generation never blocks movement, combat, saving, or campaign completion.

## Authority boundary

Allowed: dialogue graphs, optional quest branches, local NPCs, rumors, chronicle text, world-event framing, and encounters selected from known IDs.

Forbidden: raw combat numbers, XP, currency, item stats, loot, battle outcomes, direct authored quest transitions, canonical boss state, arbitrary asset URLs, or arbitrary save keys.

Effects are restricted to the discriminated union in `src/shared/schemas.ts`; generated flags must use the `generated.` namespace, relationship changes are bounded, and rewards are chosen as tiers resolved by the engine.

## Provider behavior

The server exposes one provider interface and an OpenAI-compatible adapter configured by environment variables. Requests have a 15-second timeout and no automatic paid retry. Missing credentials, timeout, malformed JSON, or validation failure returns a scripted fallback.
