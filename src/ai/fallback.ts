import type {
  GeneratedContentPatch,
  NarrativeContext
} from "../shared/types";

function safeIdPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized.slice(0, 48) || "event";
}

/**
 * A deliberately small authored reaction. It never grants rewards or changes
 * canonical state, so offline play and provider failures remain safe.
 */
export function createScriptedFallback(
  context: NarrativeContext,
  reason = "The world takes note."
): GeneratedContentPatch {
  const triggerPart = safeIdPart(context.trigger.id);
  return {
    id: `fallback.${triggerPart}.${safeIdPart(context.promptVersion)}`,
    triggerId: context.trigger.id,
    promptVersion: context.promptVersion,
    createdAt: context.trigger.createdAt,
    dialogue: [],
    quests: [],
    npcs: [],
    events: [{
      localId: `echo-${triggerPart}`,
      title: "A Quiet Echo",
      description: `${reason} ${context.trigger.summary}`.slice(0, 1200)
    }],
    effects: [{
      type: "add_chronicle_entry",
      title: "A Quiet Echo",
      body: context.trigger.summary.slice(0, 1000)
    }]
  };
}
