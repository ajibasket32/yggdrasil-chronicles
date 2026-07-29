import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../server/index";
import type { NarrativeProvider } from "../../server/provider";
import { narrativeContext, validPatch } from "./fixtures";

const servers: Array<ReturnType<ReturnType<typeof createServer>["listen"]>> = [];

async function postToServer(provider: NarrativeProvider): Promise<{
  source: string;
  fallbackReason?: string;
}> {
  const server = createServer({ provider, timeoutMs: 50 }).listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/narrative`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-yggdrasil-client": "vitest"
    },
    body: JSON.stringify({ context: narrativeContext() })
  });
  expect(response.status).toBe(200);
  return await response.json() as { source: string; fallbackReason?: string };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => error === undefined ? resolve() : reject(error)))));
});

describe("narrative server boundary", () => {
  it("falls back without contacting an unconfigured provider", async () => {
    let called = false;
    const provider: NarrativeProvider = {
      configured: false,
      async generate() {
        called = true;
        return validPatch();
      }
    };

    const response = await postToServer(provider);

    expect(called).toBe(false);
    expect(response.source).toBe("scripted");
  });

  it("rejects provider output containing raw combat values", async () => {
    const provider: NarrativeProvider = {
      configured: true,
      async generate() {
        return { ...validPatch(), damage: 999 };
      }
    };

    const response = await postToServer(provider);

    expect(response.source).toBe("scripted");
    expect(response.fallbackReason).toContain("gameplay-authority");
  });

  it("times out once without retrying the paid provider", async () => {
    let calls = 0;
    const provider: NarrativeProvider = {
      configured: true,
      async generate(_context, signal) {
        calls += 1;
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
    };

    const response = await postToServer(provider);

    expect(calls).toBe(1);
    expect(response.source).toBe("scripted");
    expect(response.fallbackReason).toContain("timed out");
  });
});
