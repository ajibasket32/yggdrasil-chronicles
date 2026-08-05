import { gameSettingsStore, type KeyboardAction } from "../settings";

/**
 * On-screen controls for touch devices.
 *
 * `styles.css` has carried a 720px breakpoint since the first commit — the
 * canvas goes full-bleed and loses its border on a phone — while the input
 * layer had keyboard and gamepad and nothing else. The stylesheet was promising
 * a mobile build the game could not play.
 *
 * Rather than retract the breakpoint, this delivers it. The pad synthesises
 * keyboard events using the player's *current bindings*, so it drives every
 * scene through exactly the path a keyboard does: no scene knows touch exists,
 * a rebound key moves the pad with it, and a scene added later works without
 * being told about this file.
 */

/** Actions the pad offers, in the order they are built. */
const PAD_BUTTONS: ReadonlyArray<{
  readonly action: KeyboardAction;
  readonly label: string;
  readonly title: string;
  readonly className: string;
  /** Directions fire repeatedly while held; commands fire once per press. */
  readonly repeats: boolean;
}> = [
  { action: "up", label: "▲", title: "Move up", className: "pad-up", repeats: true },
  { action: "left", label: "◀", title: "Move left", className: "pad-left", repeats: true },
  { action: "right", label: "▶", title: "Move right", className: "pad-right", repeats: true },
  { action: "down", label: "▼", title: "Move down", className: "pad-down", repeats: true },
  { action: "confirm", label: "A", title: "Confirm or interact", className: "pad-a", repeats: false },
  { action: "cancel", label: "B", title: "Cancel, or open the system menu", className: "pad-b", repeats: false },
  { action: "journal", label: "J", title: "Journal", className: "pad-j", repeats: false }
];

/** Matches the keyboard auto-repeat the scenes are already tuned for. */
const HOLD_DELAY_MS = 320;
const HOLD_INTERVAL_MS = 150;

export interface TouchControls {
  readonly element: HTMLElement;
  destroy(): void;
}

/**
 * True when the device is driven by touch. Checked rather than assumed from
 * viewport width: a narrow desktop window is not a phone, and mounting a pad
 * over the canvas there would be worse than nothing.
 */
export function prefersTouchControls(
  windowRef: Window | undefined = typeof window === "undefined" ? undefined : window
): boolean {
  if (!windowRef) return false;
  const coarse = windowRef.matchMedia?.("(pointer: coarse)").matches ?? false;
  const touchPoints = windowRef.navigator?.maxTouchPoints ?? 0;
  return coarse || touchPoints > 0;
}

/**
 * A keyboard event for the given code. Falls back to a plain `Event` carrying
 * `code` where `KeyboardEvent` does not exist, which keeps this module testable
 * without pulling in a DOM implementation — the same injection approach
 * `announceGameStatus` uses for `document`. Browsers always take the first path.
 */
function keyboardEvent(type: string, code: string): Event {
  if (typeof KeyboardEvent === "function") {
    return new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true });
  }
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "code", { value: code });
  return event;
}

function dispatchAction(action: KeyboardAction, type: "keydown" | "keyup", target: EventTarget): void {
  const code = gameSettingsStore.get().keyBindings[action];
  if (!code) return;
  target.dispatchEvent(keyboardEvent(type, code));
}

/**
 * Builds the pad and attaches it to `parent`. Returns a handle so a caller can
 * remove it; mounting is caller's choice so tests can construct one without a
 * touch device.
 */
export function mountTouchControls(
  parent: HTMLElement,
  target: EventTarget = typeof window === "undefined" ? parent : window
): TouchControls {
  const container = parent.ownerDocument.createElement("div");
  container.className = "touch-controls";
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", "On-screen controls");

  const timers = new Map<KeyboardAction, { delay?: number; repeat?: number }>();

  const stop = (action: KeyboardAction): void => {
    const timer = timers.get(action);
    if (!timer) return;
    if (timer.delay !== undefined) clearTimeout(timer.delay);
    if (timer.repeat !== undefined) clearInterval(timer.repeat);
    timers.delete(action);
    dispatchAction(action, "keyup", target);
  };

  for (const { action, label, title, className, repeats } of PAD_BUTTONS) {
    const button = parent.ownerDocument.createElement("button");
    button.type = "button";
    button.className = `touch-button ${className}`;
    button.textContent = label;
    button.setAttribute("aria-label", title);
    button.title = title;

    const press = (event: Event): void => {
      // Claim the gesture: without this a tap also scrolls the page, and a
      // double tap zooms the canvas out from under the player.
      event.preventDefault();
      dispatchAction(action, "keydown", target);
      if (!repeats) {
        dispatchAction(action, "keyup", target);
        return;
      }
      const timer: { delay?: number; repeat?: number } = {};
      timer.delay = setTimeout(() => {
        timer.repeat = setInterval(() => dispatchAction(action, "keydown", target), HOLD_INTERVAL_MS) as unknown as number;
      }, HOLD_DELAY_MS) as unknown as number;
      timers.set(action, timer);
    };

    button.addEventListener("pointerdown", press);
    if (repeats) {
      button.addEventListener("pointerup", () => stop(action));
      button.addEventListener("pointercancel", () => stop(action));
      button.addEventListener("pointerleave", () => stop(action));
    }
    container.append(button);
  }

  parent.append(container);
  return {
    element: container,
    destroy(): void {
      for (const action of [...timers.keys()]) stop(action);
      container.remove();
    }
  };
}
