import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request } from "express";
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

function requestKey(context: NarrativeContext): string {
  return createHash("sha256").update([
    context.trigger.id,
    context.trigger.kind,
    context.worldDigest,
    context.promptVersion
  ].join("\u001f")).digest("hex");
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
  const timeoutMs = options.timeoutMs ?? 15_000;
  const activeByClient = new Map<string, { key: string; promise: Promise<NarrativeResponse> }>();
  const cacheByClient = new Map<string, Map<string, NarrativeResponse>>();
  const distDirectory = options.distDirectory ?? resolve(process.cwd(), "dist");

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
  }

  return app;
}

const entryPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (entryPath !== undefined && fileURLToPath(import.meta.url) === entryPath) {
  const port = Number.parseInt(process.env.PORT ?? "8787", 10);
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`Yggdrasil server listening on http://127.0.0.1:${port}`);
  });
}
