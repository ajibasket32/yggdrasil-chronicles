import { describe, expect, it } from "vitest";
import { windowAround, windowFooter } from "../../src/game/overlayWindow";

const list = (count: number): string[] => Array.from({ length: count }, (_, index) => `item-${index}`);

describe("overlay windowing keeps the cursor visible", () => {
  it("returns everything when the list fits", () => {
    const view = windowAround(list(4), 2, 6);
    expect(view.items).toHaveLength(4);
    expect(view.cursor).toBe(2);
    expect(view.hasBefore).toBe(false);
    expect(view.hasAfter).toBe(false);
    // No paging chrome when there is nothing to page.
    expect(windowFooter(view)).toBe("");
  });

  it("handles an empty list without a cursor", () => {
    const view = windowAround([], 0, 6);
    expect(view.items).toHaveLength(0);
    expect(view.cursor).toBe(-1);
    expect(view.total).toBe(0);
    expect(windowFooter(view)).toBe("");
  });

  it("clamps to a full first page", () => {
    const view = windowAround(list(20), 0, 6);
    expect(view.items[0]).toBe("item-0");
    expect(view.items).toHaveLength(6);
    expect(view.cursor).toBe(0);
    expect(view.hasBefore).toBe(false);
    expect(view.hasAfter).toBe(true);
  });

  it("clamps to a full last page rather than trailing off", () => {
    const view = windowAround(list(20), 19, 6);
    expect(view.items).toHaveLength(6);
    expect(view.items.at(-1)).toBe("item-19");
    expect(view.cursor).toBe(5);
    expect(view.hasBefore).toBe(true);
    expect(view.hasAfter).toBe(false);
  });

  it("centres the window in the middle of a long list", () => {
    const view = windowAround(list(99), 50, 7);
    expect(view.items).toHaveLength(7);
    expect(view.items[view.cursor]).toBe("item-50");
    expect(view.hasBefore).toBe(true);
    expect(view.hasAfter).toBe(true);
    expect(view.position).toBe(51);
    expect(view.total).toBe(99);
  });

  it("always keeps the selected item inside the returned slice", () => {
    const items = list(99);
    for (let index = 0; index < items.length; index += 1) {
      const view = windowAround(items, index, 6);
      // This is the property the whole helper exists for.
      expect(view.items[view.cursor], `index ${index}`).toBe(items[index]);
    }
  });

  it("survives an out-of-range cursor", () => {
    const items = list(10);
    expect(windowAround(items, -5, 4).items[0]).toBe("item-0");
    expect(windowAround(items, 99, 4).items.at(-1)).toBe("item-9");
  });

  it("reports position for the footer only when paging is happening", () => {
    expect(windowFooter(windowAround(list(30), 4, 6))).toContain("5 of 30");
    expect(windowFooter(windowAround(list(3), 1, 6))).toBe("");
  });
});
