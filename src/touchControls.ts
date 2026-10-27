type HoldButton = Pick<
  HTMLButtonElement,
  | "onlostpointercapture"
  | "onpointercancel"
  | "onpointerdown"
  | "onpointerup"
  | "releasePointerCapture"
  | "setAttribute"
  | "setPointerCapture"
>;

type ActionButton = Pick<HTMLButtonElement, "onclick" | "onpointerdown">;

function isPrimaryPointerButton(event: PointerEvent): boolean {
  return event.pointerType !== "mouse" || event.button === 0;
}

export function bindTouchHoldButton(button: HoldButton, setHeld: (held: boolean) => void): void {
  let activePointerId: number | null = null;

  const release = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (event.pointerId !== activePointerId) return;

    activePointerId = null;
    button.setAttribute("aria-pressed", "false");
    setHeld(false);
  };

  button.onpointerdown = (event) => {
    if (!isPrimaryPointerButton(event) || activePointerId !== null) return;
    event.preventDefault();
    event.stopPropagation();
    activePointerId = event.pointerId;
    button.setAttribute("aria-pressed", "true");
    setHeld(true);

    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Touch pointers already use implicit capture on browsers that do not expose this API.
    }
  };
  button.onpointerup = release;
  button.onpointercancel = release;
  button.onlostpointercapture = release;
}

export function bindTouchActionButton(button: ActionButton, action: () => void): void {
  button.onpointerdown = (event) => {
    if (!isPrimaryPointerButton(event)) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    // Pointer input already ran on pointerdown. A detail of zero is a keyboard-triggered click.
    if (event.detail === 0) action();
  };
}
