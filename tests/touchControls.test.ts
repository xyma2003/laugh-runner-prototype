import { describe, expect, it, vi } from "vitest";
import { bindTouchActionButton, bindTouchHoldButton } from "../src/touchControls";

type PointerHandler = ((event: PointerEvent) => void) | null;
type ClickHandler = ((event: MouseEvent) => void) | null;

class FakeButton {
  onclick: ClickHandler = null;
  onlostpointercapture: PointerHandler = null;
  onpointercancel: PointerHandler = null;
  onpointerdown: PointerHandler = null;
  onpointerup: PointerHandler = null;
  readonly attributes = new Map<string, string>();
  readonly capturedPointers: number[] = [];

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.push(pointerId);
  }

  releasePointerCapture(): void {}
}

function pointerEvent(pointerId: number): PointerEvent {
  return {
    button: 0,
    pointerId,
    pointerType: "touch",
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent;
}

function clickEvent(detail: number): MouseEvent {
  return {
    detail,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;
}

describe("touch controls", () => {
  it("keeps movement held while another finger presses jump", () => {
    const moveButton = new FakeButton();
    const jumpButton = new FakeButton();
    const heldStates: boolean[] = [];
    const jump = vi.fn();

    bindTouchHoldButton(moveButton as unknown as HTMLButtonElement, (held) => heldStates.push(held));
    bindTouchActionButton(jumpButton as unknown as HTMLButtonElement, jump);

    moveButton.onpointerdown?.(pointerEvent(1));
    jumpButton.onpointerdown?.(pointerEvent(2));

    expect(heldStates).toEqual([true]);
    expect(moveButton.capturedPointers).toEqual([1]);
    expect(jump).toHaveBeenCalledTimes(1);

    moveButton.onpointerup?.(pointerEvent(1));
    expect(heldStates).toEqual([true, false]);
  });

  it("ignores release events from a different pointer", () => {
    const button = new FakeButton();
    const heldStates: boolean[] = [];
    bindTouchHoldButton(button as unknown as HTMLButtonElement, (held) => heldStates.push(held));

    button.onpointerdown?.(pointerEvent(7));
    button.onpointerup?.(pointerEvent(8));
    expect(heldStates).toEqual([true]);

    button.onpointerup?.(pointerEvent(7));
    expect(heldStates).toEqual([true, false]);
  });

  it("does not run an action twice when pointerdown is followed by click", () => {
    const button = new FakeButton();
    const action = vi.fn();
    bindTouchActionButton(button as unknown as HTMLButtonElement, action);

    button.onpointerdown?.(pointerEvent(3));
    button.onclick?.(clickEvent(1));
    expect(action).toHaveBeenCalledTimes(1);

    button.onclick?.(clickEvent(0));
    expect(action).toHaveBeenCalledTimes(2);
  });
});
