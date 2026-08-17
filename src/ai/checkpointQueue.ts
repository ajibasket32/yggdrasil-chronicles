import type {
  GeneratedContentPatch,
  NarrativeContext,
  ValidationReport
} from "../shared/types";
import { createScriptedFallback } from "./fallback";
import {
  validateGeneratedPatch,
  type PatchValidationCatalog
} from "./validation";

export interface NarrativeApiResponse {
  patch: GeneratedContentPatch;
  source: "provider" | "scripted";
  fallbackReason?: string;
}

export interface CheckpointResult extends NarrativeApiResponse {
  cacheKey: string;
  report: ValidationReport;
}

export interface NarrativeCheckpointQueueOptions {
  endpoint?: string;
  clientId?: string;
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
  validationCatalog?: PatchValidationCatalog;
  cache?: Map<string, NarrativeApiResponse>;
}

interface PendingJob {
  context: NarrativeContext;
  resolve: (value: CheckpointResult) => void;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function narrativeCacheKey(context: NarrativeContext): string {
  return `narrative:${fnv1a([
    context.trigger.id,
    context.trigger.kind,
    context.worldDigest,
    context.promptVersion
  ].join("\u001f"))}`;
}

export class NarrativeCheckpointQueue {
  readonly #endpoint: string;
  readonly #clientId: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #requestTimeoutMs: number;
  readonly #catalog: PatchValidationCatalog;
  readonly #cache: Map<string, NarrativeApiResponse>;
  readonly #pending: PendingJob[] = [];
  readonly #inFlight = new Map<string, Promise<CheckpointResult>>();
  #running = false;

  constructor(options: NarrativeCheckpointQueueOptions = {}) {
    this.#endpoint = options.endpoint ?? "/api/narrative";
    this.#clientId = options.clientId ?? `browser-${Math.random().toString(36).slice(2)}`;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    // Sixteen seconds was tuned for a model that answers immediately. A
    // reasoning model thinks first: a real narrative patch measured 55s against
    // the configured gateway, so the browser gave up before the answer existed
    // and every checkpoint silently became scripted. Nothing waits on this —
    // `enqueue` is fire-and-forget and a timeout just yields the scripted beat —
    // so the only cost of waiting longer is waiting longer.
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 90_000;
    this.#catalog = options.validationCatalog ?? {};
    this.#cache = options.cache ?? new Map();
  }

  get pendingCount(): number {
    return this.#pending.length + (this.#running ? 1 : 0);
  }

  enqueue(context: NarrativeContext): Promise<CheckpointResult> {
    const key = narrativeCacheKey(context);
    const existing = this.#inFlight.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const cached = this.#cache.get(key);
    if (cached !== undefined) {
      const validation = validateGeneratedPatch(cached.patch, context, this.#catalog);
      if (validation.patch !== undefined) {
        return Promise.resolve({ ...cached, cacheKey: key, report: validation.report });
      }
      this.#cache.delete(key);
    }

    let resolveJob: ((value: CheckpointResult) => void) | undefined;
    const promise = new Promise<CheckpointResult>((resolve) => {
      resolveJob = resolve;
    });
    if (resolveJob === undefined) {
      throw new Error("Unable to create narrative checkpoint job.");
    }
    this.#inFlight.set(key, promise);
    this.#pending.push({ context, resolve: resolveJob });
    void this.#drain();
    return promise;
  }

  async #drain(): Promise<void> {
    if (this.#running) {
      return;
    }
    this.#running = true;
    try {
      let job = this.#pending.shift();
      while (job !== undefined) {
        const key = narrativeCacheKey(job.context);
        const result = await this.#execute(job.context, key);
        this.#cache.set(key, {
          patch: result.patch,
          source: result.source,
          ...(result.fallbackReason === undefined ? {} : { fallbackReason: result.fallbackReason })
        });
        this.#inFlight.delete(key);
        job.resolve(result);
        job = this.#pending.shift();
      }
    } finally {
      this.#running = false;
    }
  }

  async #execute(context: NarrativeContext, cacheKey: string): Promise<CheckpointResult> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let didTimeOut = false;
    try {
      const timedOut = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          didTimeOut = true;
          controller.abort();
          reject(new Error("Narrative service request timed out."));
        }, this.#requestTimeoutMs);
      });
      const response = await Promise.race([
        this.#fetch(this.#endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-yggdrasil-client": this.#clientId
          },
          body: JSON.stringify({ context })
        }),
        timedOut
      ]);
      if (!response.ok) {
        throw new Error(`Narrative service returned HTTP ${response.status}.`);
      }
      const candidate = await response.json() as Partial<NarrativeApiResponse>;
      const validation = validateGeneratedPatch(candidate.patch, context, this.#catalog);
      if (validation.patch === undefined) {
        throw new Error(validation.report.errors.join(" "));
      }
      return {
        patch: validation.patch,
        source: candidate.source === "provider" ? "provider" : "scripted",
        ...(typeof candidate.fallbackReason === "string"
          ? { fallbackReason: candidate.fallbackReason }
          : {}),
        cacheKey,
        report: validation.report
      };
    } catch (error) {
      const reason = didTimeOut
        ? "Narrative service request timed out."
        : error instanceof Error ? error.message : "Narrative service unavailable.";
      const patch = createScriptedFallback(context, "The distant boughs remain silent.");
      const validation = validateGeneratedPatch(patch, context, this.#catalog);
      return {
        patch,
        source: "scripted",
        fallbackReason: reason,
        cacheKey,
        report: validation.report
      };
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}
