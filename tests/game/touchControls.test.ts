import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountTouchControls, prefersTouchControls } from "../../src/game/touchControls";
import { DEFAULT_KEYBOARD_BINDINGS, gameSettingsStore } from "../../src/settings";

/**
 * A DOM stand-in, in the style this project already uses for canvas and
 * document in `tests/settings/runtime.test.ts`. Only the handful of members
 * `mountTouchControls` touches, so the test needs no DOM implementation.
 */
interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  type: string;
  title: string;
  attributes: Map<string, string>;
  children: FakeElement[];
  listeners: Map<string, Array<(event: Event) => void>>;
  ownerDocument: { createElement(tag: string): FakeElement };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, handler: (event: Event) => void): void;
  append(child: FakeElement): void;
  remove(): void;
  fire(type: string): void;
  find(className: string): FakeElement | undefined;
}

function createElement(tagName: string): FakeElement {
  const element: FakeElement = {
    tagName,
    className: "",
    textContent: "",
    type: "",
    title: "",
    attributes: new Map(),
    children: [],
    listeners: new Map(),
    ownerDocument: { createElement },
    setAttribute(name, value) {
      element.attributes.set(name, value);
    },
    getAttribute(name) {
      return element.attributes.get(name) ?? null;
    },
    addEventListener(type, handler) {
      const existing = element.listeners.get(type) ?? [];
      element.listeners.set(type, [...existing, handler]);
    },
    append(child) {
      element.children.push(child);
    },
    remove() {
      element.children = [];
    },
    fire(type) {
      const event = { type, preventDefault: () => undefined } as unknown as Event;
      for (const handler of element.listeners.get(type) ?? []) handler(event);
    },
    find(className) {
      for (const child of element.children) {
        if (child.className.split(" ").includes(className)) return child;
        const nested = child.find(className);
        if (nested) return nested;
      }
      return undefined;
    }
  };
  return element;
}

function collect(target: EventTarget): string[] {
  const codes: string[] = [];
  target.addEventListener("keydown", (event) => {
    codes.push((event as Event & { code: string }).code);
  });
  return codes;
}

function mount(): { controls: ReturnType<typeof mountTouchControls>; root: FakeElement; codes: string[] } {
  const root = createElement("div");
  const target = new EventTarget();
  const codes = collect(target);
  const controls = mountTouchControls(root as unknown as HTMLElement, target);
  return { controls, root, codes };
}

function button(controls: ReturnType<typeof mountTouchControls>, className: string): FakeElement {
  const found = (controls.element as unknown as FakeElement).find(className);
  expect(found, className).toBeDefined();
  return found!;
}

describe("touch controls", () => {
  beforeEach(() => {
    gameSettingsStore.update({ keyBindings: { ...DEFAULT_KEYBOARD_BINDINGS } });
  });

  it("mounts for a touch-driven device, not merely a device that can be touched", () => {
    const fake = (overrides: { coarse?: boolean; noHover?: boolean; touchPoints?: number }): Window =>
      ({
        matchMedia: (query: string) => ({
          matches: query.includes("coarse")
            ? overrides.coarse ?? false
            : query.includes("hover") && (overrides.noHover ?? false)
        }),
        navigator: { maxTouchPoints: overrides.touchPoints ?? 0 }
      }) as unknown as Window;

    // A phone or tablet: the primary pointer is coarse and nothing hovers.
    expect(prefersTouchControls(fake({ coarse: true, noHover: true, touchPoints: 5 }))).toBe(true);

    // A touchscreen laptop reports ten touch points while being driven by a
    // mouse. Mounting the pad there put seven buttons over the HUD of a game
    // nobody was tapping — and the stylesheet only hides them above 721px, so
    // half-screening the window brought them back.
    expect(prefersTouchControls(fake({ touchPoints: 10 }))).toBe(false);
    expect(prefersTouchControls(fake({ coarse: true, touchPoints: 10 }))).toBe(false);

    expect(prefersTouchControls(fake({}))).toBe(false);
    expect(prefersTouchControls(undefined)).toBe(false);
  });

  it("drives the game through the keyboard path every scene already reads", () => {
    const { controls, codes } = mount();
    button(controls, "pad-a").fire("pointerdown");
    expect(codes).toEqual([DEFAULT_KEYBOARD_BINDINGS.confirm[0]]);
    controls.destroy();
  });

  it("follows a rebound key rather than a hardcoded one", () => {
    gameSettingsStore.update({ keyBindings: { journal: ["KeyK"] } });
    const { controls, codes } = mount();
    button(controls, "pad-j").fire("pointerdown");
    expect(codes).toEqual(["KeyK"]);
    controls.destroy();
  });

  it("repeats a held direction and stops on release", () => {
    vi.useFakeTimers();
    const { controls, codes } = mount();
    const right = button(controls, "pad-right");

    right.fire("pointerdown");
    expect(codes).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    const whileHeld = codes.length;
    expect(whileHeld).toBeGreaterThan(1);

    right.fire("pointerup");
    vi.advanceTimersByTime(1000);
    expect(codes).toHaveLength(whileHeld);
    controls.destroy();
    vi.useRealTimers();
  });

  it("does not orphan a repeat when a second finger lands on the same button", () => {
    vi.useFakeTimers();
    const { controls, codes } = mount();
    const right = button(controls, "pad-right");

    // Two pointerdowns with no pointerup between them — a second finger on the
    // same button, or an up event the browser never delivered.
    right.fire("pointerdown");
    right.fire("pointerdown");
    vi.advanceTimersByTime(1000);
    const whileHeld = codes.length;
    expect(whileHeld).toBeGreaterThan(2);

    // One release must stop everything. The first press's interval used to be
    // orphaned by the second press overwriting its handles, and nothing could
    // reach it again: the party walked on until the page was reloaded.
    right.fire("pointerup");
    vi.advanceTimersByTime(2000);
    expect(codes).toHaveLength(whileHeld);

    controls.destroy();
    vi.useRealTimers();
  });

  it("does not repeat a command button", () => {
    vi.useFakeTimers();
    const { controls, codes } = mount();
    button(controls, "pad-b").fire("pointerdown");
    vi.advanceTimersByTime(2000);
    expect(codes).toHaveLength(1);
    controls.destroy();
    vi.useRealTimers();
  });

  it("leaves no timer running after it is removed", () => {
    vi.useFakeTimers();
    const { controls, codes } = mount();
    button(controls, "pad-down").fire("pointerdown");

    controls.destroy();
    const afterDestroy = codes.length;
    vi.advanceTimersByTime(2000);
    expect(codes).toHaveLength(afterDestroy);
    vi.useRealTimers();
  });

  it("labels every control for assistive technology", () => {
    const { controls } = mount();
    const element = controls.element as unknown as FakeElement;
    expect(element.getAttribute("aria-label")).toBe("On-screen controls");
    expect(element.children.length).toBeGreaterThan(0);
    for (const child of element.children) {
      expect(child.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(0);
    }
    controls.destroy();
  });

  it("offers a control for every direction plus confirm and cancel", () => {
    const { controls } = mount();
    for (const className of ["pad-up", "pad-down", "pad-left", "pad-right", "pad-a", "pad-b"]) {
      expect((controls.element as unknown as FakeElement).find(className), className).toBeDefined();
    }
    controls.destroy();
  });
});
