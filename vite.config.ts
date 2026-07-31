import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const productionDirectory = resolve(projectRoot, "dist");
// Keep this explicit so a source asset addition must update release packaging;
// `npm run audit:release` compares this output against discovered references.
const runtimeAssetPaths = [
  "/assets/vendor/kenney-rpg-audio/Audio/bookFlip1.ogg",
  "/assets/vendor/kenney-rpg-audio/Audio/doorOpen_1.ogg",
  "/assets/vendor/kenney-rpg-audio/Audio/footstep04.ogg",
  "/assets/vendor/kenney-rpg-audio/Audio/handleSmallLeather.ogg",
  "/assets/vendor/kenney-rpg-audio/Audio/knifeSlice.ogg",
  "/assets/vendor/puny-characters/Puny-Characters/Archer-Green.png",
  "/assets/vendor/puny-characters/Puny-Characters/Archer-Purple.png",
  "/assets/vendor/puny-characters/Puny-Characters/Character-Base.png",
  "/assets/vendor/puny-characters/Puny-Characters/Mage-Cyan.png",
  "/assets/vendor/puny-characters/Puny-Characters/Mage-Red.png",
  "/assets/vendor/puny-characters/Puny-Characters/Slime.png",
  "/assets/vendor/puny-characters/Puny-Characters/Soldier-Red.png",
  "/assets/vendor/puny-characters/Puny-Characters/Soldier-Yellow.png",
  "/assets/vendor/puny-characters/Puny-Characters/Warrior-Blue.png",
  "/assets/vendor/puny-characters/Puny-Characters/Warrior-Red.png"
] as const;

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

      copyReleaseAsset(
        resolve(projectRoot, "public", "assets", "vendor", "kenney-rpg-audio", "License.txt"),
        resolve(vendorDestination, "kenney-rpg-audio", "License.txt")
      );
      copyReleaseAsset(resolve(projectRoot, "ASSETS.md"), resolve(productionDirectory, "ASSETS.md"));
    }
  };
}

export default defineConfig({
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
