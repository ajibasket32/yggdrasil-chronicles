/**
 * Reconciling a save's content-pack versions against the pack the running build
 * actually ships.
 *
 * The field was written on save and validated for *shape* on load — a record of
 * strings, matching the record of strings stored beside it in the save's own
 * metadata. Both copies come from the same save, so the check could never fail
 * and never told anyone anything. A chronicle saved against an older `campaign.ts`
 * would load without complaint and then break somewhere downstream: a quest step
 * pointing at an NPC that no longer exists, an item id that was renamed.
 *
 * This module answers the question the field exists to answer. It is pure so it
 * can live in the engine and be tested without storage: version strings in,
 * verdict out.
 */

/**
 * `compatible`  — same packs, same versions. Nothing to say.
 * `updated`     — every pack in the save is present in the build at a different
 *                 version. Playable; the player is told once.
 * `missing`     — the save references a pack this build does not have at all.
 *                 The content it depends on cannot be resolved.
 */
export type ContentPackVerdict = "compatible" | "updated" | "missing";

export interface ContentPackReconciliation {
  readonly verdict: ContentPackVerdict;
  /** Packs present in both, at different versions: `[id, savedVersion, runningVersion]`. */
  readonly changed: readonly (readonly [string, string, string])[];
  /** Pack ids the save references that the running build does not provide. */
  readonly missing: readonly string[];
  /** Pack ids the running build provides that the save predates. */
  readonly added: readonly string[];
  /** One sentence fit to show a player, always non-empty. */
  readonly message: string;
}

export function reconcileContentPacks(
  saved: Readonly<Record<string, string>>,
  running: Readonly<Record<string, string>>
): ContentPackReconciliation {
  const changed: (readonly [string, string, string])[] = [];
  const missing: string[] = [];
  for (const [id, savedVersion] of Object.entries(saved).sort()) {
    const runningVersion = running[id];
    if (runningVersion === undefined) missing.push(id);
    else if (runningVersion !== savedVersion) changed.push([id, savedVersion, runningVersion]);
  }
  const added = Object.keys(running).filter((id) => saved[id] === undefined).sort();

  if (missing.length > 0) {
    return {
      verdict: "missing",
      changed,
      missing,
      added,
      message: `This chronicle needs content this build does not have: ${missing.join(", ")}. It may not play correctly.`
    };
  }
  if (changed.length > 0 || added.length > 0) {
    const details = changed.map(([id, from, to]) => `${id} ${from} → ${to}`);
    if (added.length > 0) details.push(`new: ${added.join(", ")}`);
    return {
      verdict: "updated",
      changed,
      missing,
      added,
      message: `Loaded against updated content (${details.join("; ")}).`
    };
  }
  return { verdict: "compatible", changed, missing, added, message: "Content matches this build." };
}
