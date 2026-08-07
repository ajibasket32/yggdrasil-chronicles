import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import {
  contextSchema,
  validateProviderPatch,
  type NarrativeContext,
  type NarrativePatch
} from "./contracts.js";
import { scriptedFallback } from "./fallback.js";
import {
  providerFromEnvironment,
  type NarrativeProvider
} from "./provider.js";

export interface NarrativeResponse {
  patch: NarrativePatch;
  source: "provider" | "scripted";
  fallbackReason?: string;
}

export interface ServerOptions {
  provider?: NarrativeProvider;
  timeoutMs?: number;
  distDirectory?: string;
}

/** Field separator for the request hash; a control character cannot appear in the fields. */
const SEPARATOR = "\u001f";

/**
 * Content-addresses a request.
 *
 * Deliberately excludes `trigger.id`, which is a fresh UUID minted per
 * checkpoint: including it made every key unique, so the response cache and the
 * in-flight dedupe below could never hit once. The cache was not a cache, it
 * was accumulation, and the dedupe never collapsed two identical asks.
 */
function requestKey(context: NarrativeContext): string {
  return createHash("sha256").update([
    context.trigger.kind,
    context.trigger.summary,
    context.worldDigest,
    context.promptVersion
  ].join(SEPARATOR)).digest("hex");
}

/** Distinct callers to keep response caches for. Localhost only, so this is generous. */
const MAX_CACHED_CLIENTS = 32;

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * `.env.example` has always advertised AI_TIMEOUT_MS and nothing ever read it,
 * so an operator pointing the proxy at a slow local model could not lengthen
 * the timeout no matter what they set.
 */
function environmentTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AI_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function clientKey(request: Request): string {
  const header = request.header("x-yggdrasil-client")?.trim();
  return header !== undefined && header.length > 0
    ? header.slice(0, 128)
    : request.ip ?? "anonymous";
}

export function createServer(options: ServerOptions = {}): Express {
  const app = express();
  const provider = options.provider ?? providerFromEnvironment();
  const timeoutMs = options.timeoutMs ?? environmentTimeoutMs();
  const activeByClient = new Map<string, { key: string; promise: Promise<NarrativeResponse> }>();
  const cacheByClient = new Map<string, Map<string, NarrativeResponse>>();
  // Resolved from this module, not the working directory. `npm start` only
  // worked because npm sets cwd to the package root; run the same build from a
  // service manager whose WorkingDirectory is / and `dist` resolved to /dist,
  // so the static middleware was never mounted at all.
  const distDirectory = options.distDirectory
    ?? resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb", strict: true }));

  app.post("/api/narrative", async (request, response) => {
    const parsed = contextSchema.safeParse(request.body?.context);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid narrative context." });
      return;
    }
    const context = parsed.data;
    const client = clientKey(request);
    const key = requestKey(context);
    const clientCache = cacheByClient.get(client) ?? new Map<string, NarrativeResponse>();
    cacheByClient.set(client, clientCache);
    // The per-client cache is bounded below, but the map of clients was not, and
    // its key comes partly from a caller-supplied header. Oldest client out.
    while (cacheByClient.size > MAX_CACHED_CLIENTS) {
      const oldest = cacheByClient.keys().next().value;
      if (oldest === undefined || oldest === client) break;
      cacheByClient.delete(oldest);
    }
    const cached = clientCache.get(key);
    if (cached !== undefined) {
      response.json(cached);
      return;
    }

    const active = activeByClient.get(client);
    if (active !== undefined) {
      if (active.key === key) {
        response.json(await active.promise);
        return;
      }
      response.json({
        patch: scriptedFallback(context),
        source: "scripted",
        fallbackReason: "A narrative generation is already active for this client."
      } satisfies NarrativeResponse);
      return;
    }

    const generation = (async (): Promise<NarrativeResponse> => {
      if (!provider.configured) {
        return {
          patch: scriptedFallback(context),
          source: "scripted",
          fallbackReason: "Narrative provider is not configured."
        };
      }
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const timedOut = new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error("Narrative provider timed out."));
          }, timeoutMs);
        });
        const candidate = await Promise.race([
          provider.generate(context, controller.signal),
          timedOut
        ]);
        const validation = validateProviderPatch(candidate, context);
        if (!validation.success) {
          return {
            patch: scriptedFallback(context),
            source: "scripted",
            fallbackReason: validation.reason
          };
        }
        return { patch: validation.patch, source: "provider" };
      } catch (error) {
        const reason = controller.signal.aborted
          ? "Narrative provider timed out."
          : error instanceof Error ? error.message : "Narrative provider failed.";
        return {
          patch: scriptedFallback(context),
          source: "scripted",
          fallbackReason: reason
        };
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
      }
    })();

    activeByClient.set(client, { key, promise: generation });
    try {
      const result = await generation;
      clientCache.set(key, result);
      if (clientCache.size > 100) {
        const oldestKey = clientCache.keys().next().value as string | undefined;
        if (oldestKey !== undefined) {
          clientCache.delete(oldestKey);
        }
      }
      response.json(result);
    } finally {
      activeByClient.delete(client);
    }
  });

  if (existsSync(distDirectory)) {
    app.use(express.static(distDirectory));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/")) {
        next();
        return;
      }
      response.sendFile(resolve(distDirectory, "index.html"));
    });
  } else {
    // Say so once. Without this the process logs that it is listening, answers
    // /api/narrative perfectly, and returns a bare 404 for the game itself —
    // healthy-looking and completely unplayable, with no clue why.
    console.warn(`No release package at ${distDirectory}; serving the API only.`);
  }

  // Last, so it catches everything above. Express's default handler renders the
  // stack trace and a slice of the request into the response body; this proxy
  // sits in front of a narrative provider and a player's own save data, and
  // neither belongs in an HTTP response.
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error("Unhandled error in the narrative proxy", error);
    if (response.headersSent) return;
    response.status(500).json({ error: "Narrative service failed." });
  });

  return app;
}

const entryPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (entryPath !== undefined && fileURLToPath(import.meta.url) === entryPath) {
  const port = Number.parseInt(process.env.PORT ?? "8787", 10);
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`Yggdrasil server listening on http://127.0.0.1:${port}`);
  });
}
