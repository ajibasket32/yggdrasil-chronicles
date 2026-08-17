import { z } from "zod";
import type { NarrativeContext } from "./contracts.js";

export interface NarrativeProvider {
  readonly configured: boolean;
  generate(context: NarrativeContext, signal: AbortSignal): Promise<unknown>;
}

export interface OpenAiCompatibleOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
}

const completionResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string()
    })
  })).min(1)
});

/** Generous for this patch schema, and small enough that a runaway body cannot hurt. */
const MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * The exact shape the validator accepts, stated to the model.
 *
 * The prompt used to describe the *policy* — no raw stats, only whitelisted
 * effects — but never named a single field, while `generatedContentPatchSchema`
 * is `.strict()` and rejects anything else. So a model had to guess the schema,
 * and guessed wrong: one returned top-level `canonNotes` and `trigger`, omitted
 * `id`, `triggerId` and `createdAt`, wrote dialogue as `{lines, playerOptions}`
 * instead of `{text, nextIds}`, and used `questId` where an effect needs
 * `questLocalId`. Every one of those is a silent fall back to the scripted beat,
 * so the provider looked configured and never once produced narrative.
 */
const SYSTEM_PROMPT = `You are the optional narrative generator for Yggdrasil Chronicles.

Return exactly one JSON object, no Markdown, no prose outside it. The object is
validated strictly: any extra, missing or misnamed key is rejected whole.

Required shape — use these exact key names:
{
  "id": string,                       // unique id for this patch
  "triggerId": string,                // copy trigger.id from the context
  "promptVersion": string,            // copy promptVersion from the context
  "createdAt": string,                // ISO 8601, e.g. 2024-01-01T00:00:00.000Z
  "dialogue": [                       // up to 40
    { "id": string, "speakerId": string, "text": string, "nextIds": string[] }
  ],
  "quests": [                         // up to 4
    { "localId": string, "title": string, "summary": string,
      "objectives": string[], "rewardTier": "minor"|"standard"|"major"|"boss" }
  ],
  "npcs": [                           // up to 4
    { "localId": string, "name": string, "role": string,
      "personality": string[], "assetTag": string }
  ],
  "events": [                         // up to 4
    { "localId": string, "title": string, "description": string,
      "encounterId"?: string }
  ],
  "effects": [                        // up to 12, only these four forms
    { "type": "create_generated_flag", "key": "generated.<lowercase.id>", "value": boolean|number|string },
    { "type": "adjust_relationship", "npcId": string, "axis": "trust"|"respect"|"fear", "amount": -5..5 },
    { "type": "unlock_generated_quest", "questLocalId": string },
    { "type": "add_chronicle_entry", "title": string, "body": string }
  ]
}

Every array must be present, even if empty. One line of dialogue is one object
with its own "text"; do not nest an array of lines inside it.

Never invent raw damage, stats, XP, currency, loot, battle outcomes, boss state,
or authored quest transitions — the game engine owns all of those. Use only the
asset tags, encounter IDs and reward tiers supplied in the context. Every quest
you generate must also be referenced by an unlock_generated_quest effect whose
questLocalId matches its localId. Keep every canonical fact consistent with
canonSummary.`;

function strictJsonObject(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Provider content was not a JSON object.");
  }
  return parsed;
}

export class OpenAiCompatibleProvider implements NarrativeProvider {
  readonly #apiKey: string | undefined;
  readonly #baseUrl: string;
  readonly #model: string | undefined;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: OpenAiCompatibleOptions = {}) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.#model = options.model;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get configured(): boolean {
    return this.#apiKey !== undefined && this.#apiKey.length > 0 &&
      this.#model !== undefined && this.#model.length > 0;
  }

  async generate(context: NarrativeContext, signal: AbortSignal): Promise<unknown> {
    if (!this.configured || this.#apiKey === undefined || this.#model === undefined) {
      throw new Error("Narrative provider is not configured.");
    }
    const response = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.#model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(context) }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Narrative provider returned HTTP ${response.status}.`);
    }
    // Inbound requests are capped at 64kb; nothing guarded the outbound leg. A
    // misconfigured base URL, or an upstream having a bad day, could dribble a
    // large body for the whole timeout and be buffered whole and then parsed
    // twice — in the same process that serves the game's own files.
    const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new Error("Narrative provider response was too large.");
    }
    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) {
      throw new Error("Narrative provider response was too large.");
    }
    const completion = completionResponseSchema.parse(JSON.parse(body));
    const content = completion.choices[0]?.message.content;
    if (content === undefined) {
      throw new Error("Narrative provider returned no content.");
    }
    return strictJsonObject(content);
  }
}

export function providerFromEnvironment(): OpenAiCompatibleProvider {
  // Blank means unset, the way AI_API_KEY and AI_MODEL already treat it and the
  // way `.env.example` — which ships those two blank — teaches. `??` only falls
  // back on undefined, so clearing AI_BASE_URL to "get the default" made the
  // empty string the base URL: every request failed to parse its own URL while
  // `configured` still reported true, so the clean not-configured path was
  // never taken and each call burned a request producing a scripted fallback.
  const baseUrl = process.env.AI_BASE_URL;
  return new OpenAiCompatibleProvider({
    apiKey: process.env.AI_API_KEY,
    baseUrl: baseUrl !== undefined && baseUrl.length > 0 ? baseUrl : undefined,
    model: process.env.AI_MODEL
  });
}
