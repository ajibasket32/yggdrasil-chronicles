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

const SYSTEM_PROMPT = `You are the optional narrative generator for Yggdrasil Chronicles.
Return exactly one JSON object and no Markdown. Generate optional dialogue, local NPCs,
quests, events, and only whitelisted effects. Never invent raw damage, stats, XP,
currency, loot, battle outcomes, boss state, or authored quest transitions. Use only
asset tags, encounter IDs, and reward tiers supplied in the context. Every generated
quest must be referenced by an unlock_generated_quest effect. Keep canonical facts
consistent with canonSummary.`;

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
    const completion = completionResponseSchema.parse(await response.json());
    const content = completion.choices[0]?.message.content;
    if (content === undefined) {
      throw new Error("Narrative provider returned no content.");
    }
    return strictJsonObject(content);
  }
}

export function providerFromEnvironment(): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL
  });
}
