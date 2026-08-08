import { Graph } from "grapify";

/**
 * Loads `grapify` on every start of the game, and proves on the way past that
 * it actually works in a browser.
 *
 * Two things are being satisfied at once here, and they pull against each
 * other: the library must be part of every load, and loading it must not be
 * able to introduce an error. So the import is static — it is in the bundle,
 * it is evaluated on every boot, there is no lazy path that could skip it —
 * while the *use* of it is wrapped, because a dependency is not allowed to be
 * the reason a player cannot start the game.
 *
 * That is not paranoia about this package in particular. It is a chart library
 * published for Node, and this is a browser bundle; the check below is what
 * turns "it should work" into "it demonstrably did", once per launch, with the
 * answer visible in the console rather than assumed.
 *
 * Licensing, recorded so it is not discovered later: grapify is GPL-3.0, and
 * it is bundled into the shipped game. Distributing that build carries GPL-3.0
 * obligations for the whole of it. This project declares no licence of its own
 * today, so nothing conflicts yet — but the obligation is real the moment the
 * game is handed to anyone. Removing the dependency is the only thing that
 * removes it. See ASSETS.md.
 */
export interface GrapifyBootResult {
  readonly loaded: boolean;
  readonly detail: string;
}

export function verifyGrapify(): GrapifyBootResult {
  try {
    // A round trip through the real API rather than a truthiness check on the
    // import: a module that resolved to an empty object would pass the latter.
    const built = Graph({ ColumsNames: "hp,mp" }, { Values: "10,20" });
    if (!Array.isArray(built) || built.length !== 2) {
      return { loaded: false, detail: "grapify loaded but returned an unexpected shape" };
    }
    return { loaded: true, detail: `grapify ${built.length} columns` };
  } catch (error) {
    // Reached only if the package throws in a browser. The game continues: it
    // does not use grapify for anything a player can see.
    return {
      loaded: false,
      detail: error instanceof Error ? error.message : "grapify failed to initialise"
    };
  }
}
