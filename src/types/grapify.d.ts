/**
 * Types for `grapify`, which ships none of its own.
 *
 * Written by reading `node_modules/grapify/main.js` rather than guessed: both
 * exports take their arguments as objects with comma-separated *strings*, not
 * arrays, and `Graph` returns `undefined` on a length mismatch after logging to
 * the console. Declaring that honestly is the point — an `any` here would hide
 * the fact that the return can be missing.
 *
 * The package is GPL-3.0. See ASSETS.md for what that means for this project.
 */
declare module "grapify" {
  /** One column of a built graph. The spelling of `ColumName` is the library's. */
  export interface GrapifyColumn {
    readonly ColumName: string;
    readonly Value: string;
  }

  /**
   * Pairs comma-separated column names with comma-separated values.
   * Returns `undefined` when the two lists are different lengths.
   */
  export function Graph(
    columns: { ColumsNames: string },
    values: { Values: string }
  ): GrapifyColumn[] | undefined;

  /** One row of a percentage graph. */
  export interface GrapifySchoolRow {
    readonly Column?: string;
    readonly valuePercentage?: number;
    readonly ValueError?: string;
  }

  /** Builds a percentage graph across `lines` columns against `maxRange`. */
  export function School(
    lines: number,
    maxRange: number,
    columns: { ColumsNames: string },
    values: { Values: string }
  ): GrapifySchoolRow[] | undefined;
}
