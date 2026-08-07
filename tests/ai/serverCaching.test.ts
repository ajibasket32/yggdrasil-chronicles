import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../server/index";
import type { NarrativeProvider } from "../../server/provider";
import { narrativeContext, validPatch } from "./fixtures";

const servers: Array<ReturnType<ReturnType<typeof createServer>["listen"]>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => error === undefined ? resolve() : reject(error)))));
});

async function start(provider: NarrativeProvider): Promise<string> {
  const server = createServer({ provider, timeoutMs: 200 }).listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/narrative`;
}

async function ask(url: string, context: ReturnType<typeof narrativeContext>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-yggdrasil-client": "vitest" },
    body: JSON.stringify({ context })
  });
}

describe("the narrative response cache actually caches", () => {
  it("serves a repeated ask from cache instead of paying the provider twice", async () => {
    let calls = 0;
    const url = await start({
      configured: true,
      async generate() {
        calls += 1;
        return validPatch();
      }
    });

    // Same world state, same trigger kind and summary — a fresh checkpoint id
    // each time, which is exactly what the bridge produces. The key used to
    // include that id, so it was unique per request and the cache never hit:
    // the provider was paid again for a question it had just answered.
    await ask(url, narrativeContext({ trigger: { ...narrativeContext().trigger, id: "trigger-a" } }));
    await ask(url, narrativeContext({ trigger: { ...narrativeContext().trigger, id: "trigger-b" } }));

    expect(calls).toBe(1);
  });

  it("still treats a genuinely different event as a different request", async () => {
    let calls = 0;
    const url = await start({
      configured: true,
      async generate() {
        calls += 1;
        return validPatch();
      }
    });

    await ask(url, narrativeContext());
    await ask(url, narrativeContext({
      trigger: { ...narrativeContext().trigger, id: "other", summary: "Something else entirely happened." }
    }));

    expect(calls).toBe(2);
  });
});
