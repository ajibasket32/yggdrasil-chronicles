import type { AddressInfo } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../server/index";
import { auditReleasePackage } from "../../tools/audit-release";

const temporaryRoots: string[] = [];

function fixtureRoot(): { root: string; dist: string } {
  const root = mkdtempSync(join(tmpdir(), "yggdrasil-release-"));
  temporaryRoots.push(root);
  const dist = join(root, "dist");
  // A coherent package: the asset lives inside the vendor pack whose licence
  // travels with it, in both the source tree and the release. The licence
  // expectation is derived from the pack that actually ships, so a fixture
  // carrying a notice for a pack it never uses is itself an unused artifact.
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "public", "assets", "vendor", "kenney-rpg-audio"), { recursive: true });
  mkdirSync(join(dist, "assets", "vendor", "kenney-rpg-audio"), { recursive: true });
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(root, "src", "main.ts"), "const sprite = '/assets/vendor/kenney-rpg-audio/hero.png';");
  writeFileSync(join(root, "public", "assets", "vendor", "kenney-rpg-audio", "hero.png"), "hero-bytes");
  writeFileSync(join(root, "public", "assets", "vendor", "kenney-rpg-audio", "License.txt"), "CC0");
  writeFileSync(join(root, "ASSETS.md"), "# Fixture attribution\n");
  writeFileSync(join(dist, "index.html"), '<script type="module" src="/assets/index.js"></script>');
  writeFileSync(join(dist, "assets", "index.js"), "console.log('fixture');");
  writeFileSync(join(dist, "assets", "vendor", "kenney-rpg-audio", "hero.png"), "hero-bytes");
  writeFileSync(join(dist, "assets", "vendor", "kenney-rpg-audio", "License.txt"), "CC0");
  writeFileSync(join(dist, "ASSETS.md"), "# Fixture attribution\n");
  return { root, dist };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("production package audit", () => {
  it("accepts a static package with matching browser files and attribution", () => {
    const { root, dist } = fixtureRoot();
    const result = auditReleasePackage(root, dist);

    expect(result.valid, result.issues.map((issue) => issue.message).join("\n")).toBe(true);
    expect(result.runtimeAssetCount).toBe(1);
  });

  it("rejects unused vendor artifacts deterministically", () => {
    const { root, dist } = fixtureRoot();
    writeFileSync(join(dist, "assets", "vendor", "source-archive.zip"), "not for players");

    expect(auditReleasePackage(root, dist).issues.map((issue) => issue.code)).toEqual([
      "release-unexpected-vendor-file"
    ]);
  });

  it("catches an asset the bundle loads but source discovery never declared", () => {
    const { root, dist } = fixtureRoot();
    // The shipped bundle asks for a second sprite. Nothing else in the package
    // knows about it: the source scan never saw it, so it is not a declared
    // runtime asset, and being absent from dist it cannot trip the
    // unexpected-file check either. Before the bundle was read, every gate
    // passed and players got a 404.
    writeFileSync(
      join(dist, "assets", "index.js"),
      "console.log('fixture'); load('/assets/vendor/kenney-rpg-audio/undeclared.png');"
    );

    const issues = auditReleasePackage(root, dist).issues;
    expect(issues.map((issue) => issue.code)).toEqual(["release-missing-file"]);
    expect(issues[0]?.message).toContain("undeclared.png");
  });

  it("serves the static release and history fallback through the production server", async () => {
    const { dist } = fixtureRoot();
    const server = createServer({ distDirectory: dist }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const [home, asset, route] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/`),
        fetch(`http://127.0.0.1:${port}/assets/vendor/kenney-rpg-audio/hero.png`),
        fetch(`http://127.0.0.1:${port}/chronicle/continue`)
      ]);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain("/assets/index.js");
      expect(asset.status).toBe(200);
      expect(await asset.text()).toBe("hero-bytes");
      expect(route.status).toBe(200);
      expect(await route.text()).toContain("/assets/index.js");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
    }
  });
});
