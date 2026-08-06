import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditAssets, findRuntimeAssetReferences, findRuntimeExternalUrls, parseAssetCatalog } from "../../tools/audit-assets";

const temporaryRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "yggdrasil-assets-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "public", "assets", "vendor"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("release asset audit", () => {
  it("passes the committed catalog, local runtime files, checksums, and license evidence", () => {
    const result = auditAssets();

    expect(result.valid, result.issues.map((issue) => issue.message).join("\n")).toBe(true);
    expect(result.catalog).toHaveLength(9);
    expect(result.runtimeAssetReferences).toEqual([
      "/assets/vendor/everrogue-tileset.png",
      "/assets/vendor/kenney-rpg-audio/Audio/bookFlip1.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/bookPlace1.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/cloth1.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/cloth3.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/doorOpen_1.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/footstep04.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/handleCoins.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/handleCoins2.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/handleSmallLeather.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/knifeSlice.ogg",
      "/assets/vendor/kenney-rpg-audio/Audio/metalLatch.ogg",
      "/assets/vendor/music/The_Old_Tower_Inn.mp3",
      "/assets/vendor/music/TownTheme.mp3",
      "/assets/vendor/music/battleThemeA.mp3",
      "/assets/vendor/music/song18_0.mp3",
      "/assets/vendor/music/the_field_of_dreams.mp3",
      "/assets/vendor/puny-characters/Puny-Characters/Archer-Green.png",
      "/assets/vendor/puny-characters/Puny-Characters/Archer-Purple.png",
      "/assets/vendor/puny-characters/Puny-Characters/Character-Base.png",
      "/assets/vendor/puny-characters/Puny-Characters/Mage-Cyan.png",
      "/assets/vendor/puny-characters/Puny-Characters/Mage-Red.png",
      "/assets/vendor/puny-characters/Puny-Characters/Slime.png",
      "/assets/vendor/puny-characters/Puny-Characters/Soldier-Red.png",
      "/assets/vendor/puny-characters/Puny-Characters/Soldier-Yellow.png",
      "/assets/vendor/puny-characters/Puny-Characters/Warrior-Blue.png",
      "/assets/vendor/puny-characters/Puny-Characters/Warrior-Red.png",
      "/assets/vendor/punyworld-overworld.png"
    ]);
  });

  it("parses archive checksums separately from catalog directory paths", () => {
    const entries = parseAssetCatalog([
      "| Purpose | Source | Author | License | Local path | SHA-256 | Modification |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| Audio | https://example.invalid/audio | Example | CC0 | `public/assets/vendor/audio/` | Archive: `abc123` | None |"
    ].join("\n"));

    expect(entries).toEqual([{
      purpose: "Audio",
      source: "https://example.invalid/audio",
      author: "Example",
      license: "CC0",
      localPath: "public/assets/vendor/audio",
      checksum: "abc123",
      modification: "None"
    }]);
  });

  it("reports an unrecorded external URL and missing local runtime asset deterministically", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "src", "main.ts"), "const remote = 'https://assets.example.invalid/hero.png'; const local = '/assets/vendor/missing.png';");
    writeFileSync(join(root, "ASSETS.md"), [
      "| Purpose | Source | Author | License | Local path | SHA-256 | Modification |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      `| Sample | https://example.invalid/source | Example | CC0 | \`public/assets/vendor/sample.png\` | \`${checksum("sample")}\` | None |`
    ].join("\n"));
    writeFileSync(join(root, "public", "assets", "vendor", "sample.png"), "sample");

    expect(findRuntimeAssetReferences(root)).toEqual(["/assets/vendor/missing.png"]);
    expect(findRuntimeExternalUrls(root).map((issue) => issue.code)).toEqual(["runtime-external-url"]);
    expect(auditAssets(root).issues.map((issue) => issue.code)).toEqual([
      "runtime-asset-missing",
      "runtime-external-url"
    ]);
  });
});
