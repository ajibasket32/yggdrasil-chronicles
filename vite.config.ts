import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const productionDirectory = resolve(projectRoot, "dist");
// Keep this explicit so a source asset addition must update release packaging;
// `npm run audit:release` compares this output against discovered references.
const runtimeAssetPaths = [
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
  "/assets/vendor/music/TownTheme.mp3",
  "/assets/vendor/music/The_Old_Tower_Inn.mp3",
  "/assets/vendor/music/battleThemeA.mp3",
  "/assets/vendor/music/song18_0.mp3",
  "/assets/vendor/music/the_field_of_dreams.mp3",
  "/assets/vendor/monster-pack-2d/custodian.png",
  "/assets/vendor/monster-pack-2d/gnawer.png",
  "/assets/vendor/monster-pack-2d/horned-beast.png",
  "/assets/vendor/monster-pack-2d/kiln-core.png",
  "/assets/vendor/monster-pack-2d/mote.png",
  "/assets/vendor/monster-pack-2d/moth.png",
  "/assets/vendor/monster-pack-2d/sentinel.png",
  "/assets/vendor/monster-pack-2d/slime.png",
  "/assets/vendor/monster-pack-2d/star-echo.png",
  "/assets/vendor/monster-pack-2d/wolf.png",
  "/assets/vendor/monster-pack-2d/wraith.png",
  "/assets/vendor/everface.png",
  "/assets/vendor/everrogue-tileset.png",
  "/assets/vendor/punyworld-overworld.png",
  "/assets/vendor/puny-characters/Puny-Characters/Archer-Green.png",
  "/assets/vendor/puny-characters/Puny-Characters/Archer-Purple.png",
  "/assets/vendor/puny-characters/Puny-Characters/Mage-Cyan.png",
  "/assets/vendor/puny-characters/Puny-Characters/Mage-Red.png",
  "/assets/vendor/puny-characters/Puny-Characters/Slime.png",
  "/assets/vendor/puny-characters/Puny-Characters/Soldier-Red.png",
  "/assets/vendor/puny-characters/Puny-Characters/Soldier-Yellow.png",
  "/assets/vendor/puny-characters/Puny-Characters/Warrior-Blue.png",
  "/assets/vendor/puny-characters/Puny-Characters/Warrior-Red.png"
] as const;

/** Vendor packs that contribute at least one runtime asset, and so must ship their licence. */
function vendorPacksInRelease(): Set<string> {
  const packs = new Set<string>();
  for (const assetPath of runtimeAssetPaths) {
    const pack = /^\/assets\/vendor\/([^/]+)\//.exec(assetPath)?.[1];
    if (pack) packs.add(pack);
  }
  return packs;
}

/**
 * Writes the player-facing attribution file.
 *
 * ASSETS.md is two documents in one: a CC0 attribution table, which every
 * recipient of the build has a right to and which the licences ask be kept with
 * the work, and an internal decision record — why a pack was chosen, which
 * findings were refuted, what the owner was warned about and decided anyway.
 * The whole file used to be copied to the public web root, so the second half
 * was published to every player at a guessable URL.
 *
 * The table travels; the deliberation does not.
 */
function writeReleaseAttribution(source: string, destination: string): void {
  if (!existsSync(source)) {
    throw new Error(`Release asset source is missing: ${source}`);
  }
  const lines = readFileSync(source, "utf8").split(/\r?\n/);
  const table: string[] = [];
  for (const line of lines) {
    // The catalogue is the leading table: every row starts a pipe cell. Stop at
    // the first section heading after it, which is where the prose begins.
    if (line.startsWith("## ") && table.length > 0) break;
    if (line.startsWith("|")) table.push(line);
  }
  if (table.length < 3) {
    throw new Error("ASSETS.md has no attribution table to publish.");
  }
  const attribution = [
    "# Asset attribution — Yggdrasil Chronicles",
    "",
    "Every asset below is CC0 or public domain. This file travels with the game",
    "so each work keeps its author, source and licence beside it.",
    "",
    ...table,
    ""
  ].join(String.fromCharCode(10));
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, attribution, "utf8");
}

function copyReleaseAsset(source: string, destination: string): void {
  if (!existsSync(source)) {
    throw new Error(`Release asset source is missing: ${source}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function productionAssetPruning(): Plugin {
  return {
    name: "yggdrasil-production-asset-pruning",
    closeBundle() {
      // Vite copies public/ verbatim. Release only the assets that browser code
      // references, plus attribution evidence, instead of shipping source zips
      // and unused vendor files to every desktop player.
      const vendorDestination = resolve(productionDirectory, "assets", "vendor");
      rmSync(vendorDestination, { recursive: true, force: true });

      for (const assetPath of runtimeAssetPaths) {
        const relativeAssetPath = assetPath.replace(/^\//, "");
        copyReleaseAsset(
          resolve(projectRoot, "public", relativeAssetPath),
          resolve(productionDirectory, relativeAssetPath)
        );
      }

      // Every pack that contributes a runtime asset ships its own attribution.
      // Naming one pack's License.txt here meant the rmSync above would prune a
      // second pack's notice out of the release — an attribution-required asset
      // shipping without the notice that is the condition of using it — and
      // nothing downstream would object, because the audit named the same one
      // file. Derived from what actually ships instead.
      for (const pack of Array.from(vendorPacksInRelease())) {
        const packSource = resolve(projectRoot, "public", "assets", "vendor", pack);
        if (!existsSync(packSource)) continue;
        for (const entry of readdirSync(packSource, { withFileTypes: true })) {
          if (entry.isFile() && /^(license|copying|notice)(\.|$)/i.test(entry.name)) {
            copyReleaseAsset(
              resolve(packSource, entry.name),
              resolve(vendorDestination, pack, entry.name)
            );
          }
        }
      }
      writeReleaseAttribution(resolve(projectRoot, "ASSETS.md"), resolve(productionDirectory, "ASSETS.md"));
    }
  };
}

export default defineConfig({
  // Relative, so a build runs from wherever it is unpacked rather than only
  // from a domain root. itch.io and GitHub Pages both serve from a subpath, and
  // there the root-absolute URLs Vite emits by default resolve against the
  // domain root instead: index.html loads, its own script 404s, and the player
  // gets a white page. Runtime asset paths are handled separately — they are
  // fetched by Phaser rather than rewritten by the bundler — through
  // `assetBase()` in src/game/runtime.ts.
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  },
  build: {
    target: "es2022",
    // Phaser is audited separately below its 450 kB gzip budget. Keep Vite's
    // generic warning focused on regressions beyond this known desktop runtime.
    chunkSizeWarningLimit: 1_250,
    rollupOptions: {
      output: {
        // Phaser is intentionally the only substantial runtime dependency.
        // Isolating it yields a small application chunk with durable browser cache.
        manualChunks: {
          phaser: ["phaser"]
        }
      }
    }
  },
  plugins: [productionAssetPruning()]
});
