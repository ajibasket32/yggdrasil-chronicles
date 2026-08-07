import type { NarrativeContext, NarrativePatch } from "./contracts.js";

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "event";
}

export function scriptedFallback(context: NarrativeContext): NarrativePatch {
  const triggerPart = safeId(context.trigger.id);
  return {
    id: `fallback.${triggerPart}.${safeId(context.promptVersion)}`,
    triggerId: context.trigger.id,
    promptVersion: context.promptVersion,
    createdAt: context.trigger.createdAt,
    dialogue: [],
    quests: [],
    npcs: [],
    events: [{
      localId: `echo-${triggerPart}`,
      title: "A Quiet Echo",
      description: `The distant boughs remain silent. ${context.trigger.summary}`.slice(0, 1200)
    }],
    // No effects. This is the reaction shown when the provider cannot answer,
    // and offline that is every checkpoint — one per crossing. Writing a
    // chronicle entry each time buried the entries that mattered under an
    // identical line and grew the save forever. The event above still carries
    // the colour; nothing durable is recorded.
    effects: []
  };
}
