import { describe, expect, it } from "vitest";
import { mobileViewportMode } from "../src/viewportMode";

describe("mobile viewport mode", () => {
  it("shows the rotate prompt for a portrait phone", () => {
    expect(mobileViewportMode(390, 844, true, false)).toBe("portrait");
  });

  it("switches to the full-game layout after a phone rotates", () => {
    expect(mobileViewportMode(844, 390, true, false)).toBe("landscape");
  });

  it("does not apply the mobile gate to desktop or compact windows", () => {
    expect(mobileViewportMode(390, 844, false, false)).toBe("desktop");
    expect(mobileViewportMode(390, 844, true, true)).toBe("desktop");
  });
});
