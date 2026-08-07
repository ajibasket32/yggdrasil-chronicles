import { describe, expect, it } from "vitest";
import { applyPresentationSettings, COLORS, fontPx, rowsThatFit, TEXT } from "../../src/game/runtime";
import { DEFAULT_GAME_SETTINGS, nextTextSize, TEXT_SIZES } from "../../src/settings";

function settings(patch: Partial<typeof DEFAULT_GAME_SETTINGS>) {
  return { ...DEFAULT_GAME_SETTINGS, ...patch };
}

/** Relative luminance, for asserting contrast rather than eyeballing hex. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return (((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114) / 255;
}

describe("presentation settings", () => {
  it("lifts text and darkens panels under High Contrast", () => {
    applyPresentationSettings(settings({ highContrast: false }));
    const standard = { cream: COLORS.cream, muted: COLORS.muted, panel: COLORS.panel };

    applyPresentationSettings(settings({ highContrast: true }));
    // The setting used to be a CSS filter on the canvas; now it reaches the
    // palette the game actually draws with.
    expect(luminance(COLORS.cream)).toBeGreaterThan(luminance(standard.cream));
    expect(luminance(COLORS.muted)).toBeGreaterThan(luminance(standard.muted));
    expect(COLORS.panel).toBeLessThan(standard.panel);

    applyPresentationSettings(DEFAULT_GAME_SETTINGS);
    expect(COLORS.cream).toBe(standard.cream);
    expect(COLORS.panel).toBe(standard.panel);
  });

  it("scales every named text style with the size preference", () => {
    const sizeOf = (value: string): number => Number.parseInt(value.replace("px", ""), 10);
    applyPresentationSettings(settings({ textSize: "medium" }));
    const medium = {
      title: sizeOf(TEXT.title.fontSize),
      heading: sizeOf(TEXT.heading.fontSize),
      body: sizeOf(TEXT.body.fontSize),
      small: sizeOf(TEXT.small.fontSize)
    };

    applyPresentationSettings(settings({ textSize: "large" }));
    expect(sizeOf(TEXT.body.fontSize)).toBeGreaterThan(medium.body);
    expect(sizeOf(TEXT.small.fontSize)).toBeGreaterThan(medium.small);
    expect(sizeOf(TEXT.heading.fontSize)).toBeGreaterThan(medium.heading);
    expect(sizeOf(TEXT.title.fontSize)).toBeGreaterThan(medium.title);

    applyPresentationSettings(settings({ textSize: "small" }));
    expect(sizeOf(TEXT.body.fontSize)).toBeLessThan(medium.body);
  });

  it("scales ad-hoc sizes too, and never below a readable floor", () => {
    applyPresentationSettings(settings({ textSize: "large" }));
    // The HP/MP readouts are the smallest text in the game at 9px.
    expect(Number.parseInt(fontPx(9), 10)).toBeGreaterThan(9);
    applyPresentationSettings(settings({ textSize: "small" }));
    expect(Number.parseInt(fontPx(9), 10)).toBeGreaterThanOrEqual(8);
    applyPresentationSettings(DEFAULT_GAME_SETTINGS);
    expect(fontPx(14)).toBe("14px");
  });

  it("cycles text size through every option and back", () => {
    let size: (typeof TEXT_SIZES)[number] = TEXT_SIZES[0]!;
    const seen = new Set<(typeof TEXT_SIZES)[number]>([size]);
    for (let step = 0; step < TEXT_SIZES.length; step += 1) {
      size = nextTextSize(size);
      seen.add(size);
    }
    expect(seen.size).toBe(TEXT_SIZES.length);
    expect(size).toBe(TEXT_SIZES[0]);
  });

  /**
   * Panels are masked to a fixed height while their rows grow with the text
   * setting. A budget counted once at `medium` overflowed at `large`, and what
   * got clipped was the panel's own "more below" line — the only sign that
   * anything had been cut.
   */
  it("shrinks a panel's row budget as the text size grows", () => {
    applyPresentationSettings(settings({ textSize: "medium" }));
    const atMedium = rowsThatFit(11);

    applyPresentationSettings(settings({ textSize: "large" }));
    const atLarge = rowsThatFit(11);

    applyPresentationSettings(settings({ textSize: "small" }));
    const atSmall = rowsThatFit(11);

    expect(atMedium).toBe(11);
    expect(atLarge).toBeLessThan(atMedium);
    expect(atSmall).toBeGreaterThan(atMedium);
    // Never zero rows, however large the text or small the budget.
    expect(rowsThatFit(1)).toBeGreaterThanOrEqual(1);
    applyPresentationSettings(settings({ textSize: "medium" }));
  });
});
