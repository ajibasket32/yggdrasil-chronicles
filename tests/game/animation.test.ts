import { describe, expect, it, vi } from "vitest";
import { fadeSceneIn, fadeSceneOutThen, revealObject } from "../../src/game/runtime";
import { gameSettingsStore } from "../../src/settings";

/**
 * Reduced Motion is where animation code goes wrong in this project.
 *
 * It has already shipped one bug of exactly this shape: a zero-length tween was
 * asked to raise a toast's alpha back to 1, never ran, and the toast was
 * invisible rather than merely static. The same mistake in a scene transition
 * is worse — a fade to black that nothing clears is a game the player cannot
 * leave.
 *
 * So the rule these helpers encode is not "animate for zero milliseconds" but
 * "do not animate at all, and put the end state on screen immediately". These
 * tests hold them to it.
 */

/** These helpers read the live settings store, so the test drives that. */
function setReducedMotion(reducedMotion: boolean): void {
  gameSettingsStore.update({ reducedMotion });
}

function fakeScene() {
  return {
    cameras: { main: { fadeIn: vi.fn(), fadeOut: vi.fn() } },
    tweens: { add: vi.fn() },
    time: { delayedCall: vi.fn() }
  };
}

/** The helpers only ever touch this much of a scene, so a stub is honest here. */
type SceneStub = ReturnType<typeof fakeScene>;
const asScene = (stub: SceneStub) => stub as unknown as Parameters<typeof fadeSceneIn>[0];

describe("animation under Reduced Motion", () => {
  it("moves to the next scene immediately instead of fading to black", () => {
    setReducedMotion(true);
    const scene = fakeScene();
    const action = vi.fn();

    fadeSceneOutThen(asScene(scene), action);

    expect(action, "the next scene must start at once").toHaveBeenCalledTimes(1);
    // The dangerous shape: fading out over zero milliseconds and trusting
    // something to clear it. Nothing here should touch the camera at all.
    expect(scene.cameras.main.fadeOut).not.toHaveBeenCalled();
    expect(scene.time.delayedCall).not.toHaveBeenCalled();
  });

  it("still fades, and still arrives, when motion is allowed", () => {
    setReducedMotion(false);
    const scene = fakeScene();
    const action = vi.fn();

    fadeSceneOutThen(asScene(scene), action, 200);

    expect(scene.cameras.main.fadeOut).toHaveBeenCalledTimes(1);
    // Driven by a timer rather than the camera's completion event, so a camera
    // that never reports completion cannot strand the player mid-transition.
    expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
    const [delay, callback] = scene.time.delayedCall.mock.calls[0] as [number, () => void];
    expect(delay).toBeGreaterThan(200);
    callback();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not fade a scene in when motion is off", () => {
    setReducedMotion(true);
    const scene = fakeScene();
    fadeSceneIn(asScene(scene));
    expect(scene.cameras.main.fadeIn).not.toHaveBeenCalled();

    setReducedMotion(false);
    const moving = fakeScene();
    fadeSceneIn(asScene(moving));
    expect(moving.cameras.main.fadeIn).toHaveBeenCalledTimes(1);
  });

  it("leaves a revealed panel fully visible rather than transparent", () => {
    setReducedMotion(true);
    const scene = fakeScene();
    const panel = { setAlpha: vi.fn() };

    revealObject(asScene(scene), panel as unknown as Parameters<typeof revealObject>[1]);

    // This is the toast bug, restated: a panel whose alpha is dropped to zero
    // and then never raised is worse than one that never animated.
    expect(panel.setAlpha, "alpha must not be zeroed with no tween to undo it").not.toHaveBeenCalled();
    expect(scene.tweens.add).not.toHaveBeenCalled();
  });

  it("fades a revealed panel in when motion is allowed", () => {
    setReducedMotion(false);
    const scene = fakeScene();
    const panel = { setAlpha: vi.fn() };

    revealObject(asScene(scene), panel as unknown as Parameters<typeof revealObject>[1]);

    expect(panel.setAlpha).toHaveBeenCalledWith(0);
    expect(scene.tweens.add).toHaveBeenCalledTimes(1);
    const tween = scene.tweens.add.mock.calls[0]?.[0] as { alpha: number; duration: number };
    expect(tween.alpha, "it has to end fully visible").toBe(1);
    expect(tween.duration).toBeGreaterThan(0);

    setReducedMotion(false);
  });
});
