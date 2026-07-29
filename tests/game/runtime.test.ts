import { describe, expect, it } from "vitest";
import { announceGameStatus, announceScene } from "../../src/game/runtime";

function createDocument() {
  const app = { dataset: {} as Record<string, string> };
  const status = { textContent: "" };
  return {
    app,
    status,
    document: {
      querySelector: (selector: string) => {
        if (selector === "#app") return app;
        if (selector === "#game-status") return status;
        return null;
      }
    } as unknown as Document
  };
}

describe("screen-reader game announcements", () => {
  it("writes concise status updates when a live region is available", () => {
    const fixture = createDocument();
    announceGameStatus("Settings. High contrast on.", fixture.document);
    expect(fixture.status.textContent).toBe("Settings. High contrast on.");
  });

  it("marks the active scene and announces the scene's keyboard-oriented guidance", () => {
    const fixture = createDocument();
    announceScene("world", fixture.document);
    expect(fixture.app.dataset.scene).toBe("world");
    expect(fixture.status.textContent).toContain("Exploration screen");
  });
});
