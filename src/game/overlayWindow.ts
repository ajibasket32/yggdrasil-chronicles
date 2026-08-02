/**
 * Keeps a cursor visible inside a fixed-height list.
 *
 * Overlays render into a panel that fits a bounded number of rows, but the
 * inventory can hold ninety-nine distinct stacks and a shop catalog is
 * unbounded in principle. Without windowing the cursor simply walks off the
 * bottom of the panel and the player loses track of their own selection.
 */
export interface OverlayWindow<T> {
  /** The slice to draw, in order. */
  readonly items: readonly T[];
  /** Index of the cursor within `items`, or -1 when the list is empty. */
  readonly cursor: number;
  /** True when rows exist above or below the visible slice. */
  readonly hasBefore: boolean;
  readonly hasAfter: boolean;
  /** Position of the cursor in the full list, 1-based; 0 when empty. */
  readonly position: number;
  readonly total: number;
}

/**
 * Centres the window on the cursor where possible, and clamps at both ends so
 * the first and last pages are full rather than half-empty.
 */
export function windowAround<T>(
  items: readonly T[],
  selectedIndex: number,
  visibleCount: number
): OverlayWindow<T> {
  const total = items.length;
  const size = Math.max(1, Math.floor(visibleCount));
  if (total === 0) {
    return { items: [], cursor: -1, hasBefore: false, hasAfter: false, position: 0, total: 0 };
  }
  if (total <= size) {
    const cursor = Math.min(Math.max(0, selectedIndex), total - 1);
    return { items: [...items], cursor, hasBefore: false, hasAfter: false, position: cursor + 1, total };
  }

  const clampedIndex = Math.min(Math.max(0, selectedIndex), total - 1);
  const half = Math.floor(size / 2);
  const start = Math.min(Math.max(0, clampedIndex - half), total - size);
  return {
    items: items.slice(start, start + size),
    cursor: clampedIndex - start,
    hasBefore: start > 0,
    hasAfter: start + size < total,
    position: clampedIndex + 1,
    total
  };
}

/** Standard "3 of 27" suffix, or an empty string when everything is visible. */
export function windowFooter(window: OverlayWindow<unknown>): string {
  if (window.total === 0) return "";
  if (!window.hasBefore && !window.hasAfter) return "";
  return `— ${window.position} of ${window.total} —`;
}
